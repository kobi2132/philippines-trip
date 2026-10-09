// Runs every 15 minutes from GitHub Actions (.github/workflows/notifier.yml).
// Env: FIREBASE_SERVICE_ACCOUNT (JSON), AERODATABOX_KEY (optional), TRIP_ID, TEST_PUSH=1 for a test message.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { dueReminders, legsToCheck, flightChangeAlert } from './schedule.mjs';
import { fetchLegStatus } from './flights.mjs';

const SITE = 'https://kobi2132.github.io/philippines-trip/';
const tripId = process.env.TRIP_ID || 'philippines-2026';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const tripRef = db.doc(`trips/${tripId}`);
const stateRef = db.doc(`trips/${tripId}/status/notifier`);
const flightsRef = db.doc(`trips/${tripId}/status/flights`);

async function push(title, body, link = '#/today') {
  const devices = await tripRef.collection('devices').get();
  const tokens = devices.docs.map((d) => d.get('token')).filter(Boolean);
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
      return devices.docs.find((d) => d.get('token') === tokens[i]).ref.delete();
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
  process.exit(0);
}

const state = (await stateRef.get()).data() || {};
const sent = state.sent || {};
const lastChecked = state.lastChecked || {};
const notified = state.notified || {};

// 1. Daily and flight reminders.
for (const r of dueReminders(trip, now, sent)) {
  await push(r.title, r.body, r.link);
  sent[r.key] = now.toISOString();
}

// 2. Live flight status, and a push when something important changes.
const apiKey = process.env.AERODATABOX_KEY;
const live = {};
if (apiKey) {
  for (const { key, leg } of legsToCheck(trip, now, lastChecked)) {
    try {
      const s = await fetchLegStatus(leg, apiKey);
      lastChecked[key] = now.getTime();
      if (!s) continue;
      live[key] = s;
      const alert = flightChangeAlert(leg, notified[key], s);
      if (alert) await push(alert.title, alert.body, `#/day/${leg.dep.slice(0, 10)}`);
      notified[key] = { status: s.status, depLocal: s.depLocal, gate: s.gate };
    } catch (e) {
      console.error(e.message);
    }
  }
}

if (Object.keys(live).length) await flightsRef.set({ legs: live, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
await stateRef.set({ sent, lastChecked, notified, ranAt: now.toISOString() });
console.log('done', now.toISOString());
