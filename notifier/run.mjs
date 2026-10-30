// Runs every 15 minutes from GitHub Actions (.github/workflows/notifier.yml).
// Env: FIREBASE_SERVICE_ACCOUNT (JSON), AERODATABOX_KEY (optional), TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (optional),
// TRIP_ID, TEST_PUSH=1 for a test message.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { dueReminders, legsToCheck, flightChangeAlert, landedAlert, dueTelegram, telegramReminders, telegramFlightText, telegramErrorText, scheduleChangeText, missingFlightText, schedKey } from './schedule.mjs';
import { telegram, telegramOn } from './telegram.mjs';
import { fetchLegStatus } from './flights.mjs';

const SITE = 'https://kobi2132.github.io/philippines-trip/';
const tripId = process.env.TRIP_ID || 'philippines-2026';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const tripRef = db.doc(`trips/${tripId}`);
const stateRef = db.doc(`trips/${tripId}/status/notifier`);
const flightsRef = db.doc(`trips/${tripId}/status/flights`);

async function push(title, body, link = '#/today') {
  // Each person's document holds one token per device (older ones a single `token` field).
  const devices = await tripRef.collection('devices').get();
  const targets = [];
  for (const d of devices.docs) {
    if (d.get('token')) targets.push({ token: d.get('token'), ref: d.ref, field: 'token' });
    for (const [id, t] of Object.entries(d.get('tokens') || {})) if (t && t.token) targets.push({ token: t.token, ref: d.ref, field: `tokens.${id}` });
  }
  const tokens = [...new Set(targets.map((x) => x.token))];
  if (!tokens.length) { console.log('no devices registered'); return; }
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    webpush: {
      headers: { Urgency: 'high', TTL: String(6 * 3600) },
      data: { title, body, link: SITE + link },
    },
  });
  // Forget phones that uninstalled or revoked permission.
  await Promise.all(res.responses.map((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      return Promise.all(targets.filter((x) => x.token === tokens[i]).map((x) => x.ref.update({ [x.field]: FieldValue.delete() })));
    }
    return null;
  }));
  console.log(`sent "${title}" to ${res.successCount}/${tokens.length}`);
}

const now = new Date();
const trip = (await tripRef.get()).get('data');
if (!trip) { console.log('trip not found'); process.exit(0); }

if (process.env.TEST_PUSH === '1') {
  await push('🔔 בדיקת התראות', 'אם רואים את זה, ההתראות של אפליקציית הטיול עובדות!');
  await telegram('🔔 בדיקה: הבוט של אפליקציית הטיול מחובר ויעדכן אותך כאן.');
  process.exit(0);
}

// One of each Telegram message, built from the real trip with made-up flight changes. Telegram only.
if (process.env.TG_SAMPLES) {
  const f = trip.flights[0], leg = f.legs[0];
  const one = process.env.TG_SAMPLES === 'one';
  const sample = async (text) => { await telegram(`🧪 <i>דוגמה</i>\n${text}`); if (one) process.exit(0); };
  for (const r of telegramReminders(trip).filter((x) => x.key.startsWith(`tg_checkin_${f.date}_`) || x.key.startsWith(`tg_day_${f.date}`))) await sample(r.text);
  const alerts = [
    flightChangeAlert(leg, null, { status: 'delayed', depLocal: '11:25' }),
    flightChangeAlert(leg, null, { status: 'scheduled', depLocal: leg.dep.slice(11, 16), gate: 'B7' }),
    flightChangeAlert(leg, null, { status: 'cancelled' }),
  ];
  for (const a of alerts) await sample(telegramFlightText(leg, a));
  await sample(landedAlert(f.legs[f.legs.length - 1], { status: 'departed' }, { status: 'landed', arrLocal: '09:42' }));
  await sample(scheduleChangeText(leg, null, { schedDep: leg.dep.replace(/T(\d\d):(\d\d)/, 'T$1:15'), schedArr: f.legs[0].arr.replace(/T(\d\d):(\d\d)/, 'T$1:25') }));
  await sample(missingFlightText(leg, { status: 'scheduled' }));
  await sample(telegramErrorText(leg, `AeroDataBox 429 for ${leg.flightNo}`));
  process.exit(0);
}

const state = (await stateRef.get()).data() || {};
const sent = state.sent || {};
const lastChecked = state.lastChecked || {};
const notified = state.notified || {};
// Saved after every message, so a failure later in the run can't make the next run send it again.
const saveState = () => stateRef.set({ sent, lastChecked, notified, tgErrorAt: state.tgErrorAt || 0, ranAt: now.toISOString() });

// 1. Daily and flight reminders.
for (const r of dueReminders(trip, now, sent)) {
  try {
    await push(r.title, r.body, r.link);
    sent[r.key] = now.toISOString();
    await saveState();
  } catch (e) { console.error('push failed', r.key, e.message); } // not marked sent: tried again next run
}

// 1b. Telegram reminders for Jacob (check-in 24h before, flight day morning).
if (telegramOn()) {
  for (const r of dueTelegram(trip, now, sent)) {
    if (await telegram(r.text)) { sent[r.key] = now.toISOString(); await saveState(); }
  }
}

// 2. Live flight status, and a push when something important changes.
const apiKey = process.env.AERODATABOX_KEY;
const live = {};
if (apiKey) {
  for (const { key, leg } of legsToCheck(trip, now, lastChecked, notified)) {
    // A failed check counts as a check: retrying every run would use up the monthly quota in a day.
    lastChecked[key] = now.getTime();
    try {
      const s = await fetchLegStatus(leg, apiKey);
      if (!s) {
        const gone = missingFlightText(leg, notified[key]);
        if (gone && await telegram(gone)) { notified[key] = { ...notified[key], missing: true }; await saveState(); }
        continue;
      }
      live[key] = s;
      const alert = flightChangeAlert(leg, notified[key], s);
      if (alert) {
        await push(alert.title, alert.body, `#/day/${leg.dep.slice(0, 10)}`);
        await telegram(telegramFlightText(leg, alert));
      }
      const landed = landedAlert(leg, notified[key], s);
      if (landed) await telegram(landed);
      const moved = scheduleChangeText(leg, notified[key], s);
      // Kept as seen until Telegram takes it, so a failed send is tried again next check.
      const sched = !moved || await telegram(moved) ? schedKey(s) : notified[key] && notified[key].sched;
      notified[key] = { status: s.status, depLocal: s.depLocal, gate: s.gate, sched: sched || null };
      await saveState();
    } catch (e) {
      console.error(e.message);
      // Tell Jacob when checking flights fails, at most every 6 hours.
      if (now.getTime() - (state.tgErrorAt || 0) > 6 * 3600e3 && await telegram(telegramErrorText(leg, e.message))) state.tgErrorAt = now.getTime();
    }
  }
}

if (Object.keys(live).length) await flightsRef.set({ legs: live, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
await saveState();
console.log('done', now.toISOString());
