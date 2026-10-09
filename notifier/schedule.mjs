// Pure logic (no network): which reminders are due, and which flight changes are worth a push.

const HE_PLACE = (trip, key) => (trip.places[key] || {}).name || key;

export const tzOfPlace = (place) => (place === 'israel' || !place ? 'Asia/Jerusalem' : 'Asia/Manila');
// A flight's departure airport zone, from the offset its time is written in.
const tzOfDeparture = (f) => (f.legs[0].dep.endsWith('+02:00') ? 'Asia/Jerusalem' : 'Asia/Manila');

// Local date and time in a time zone: { date: 'YYYY-MM-DD', hm: 'HH:MM' }
export function localParts(now, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const fromMin = (t) => { t = ((t % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const shortDate = (date) => `${Number(date.slice(8, 10))}.${Number(date.slice(5, 7))}`;
const localTime = (iso) => iso.slice(11, 16);

export const airportBy = (f) => fromMin(toMin(localTime(f.legs[0].dep)) - (f.international ? 180 : 120));

const hotelCheckingOut = (trip, date) => trip.hotels.find((h) => h.checkOut === date);
const flightOn = (trip, date) => trip.flights.find((f) => f.date === date);

// Every reminder the trip calls for: { key, date, time, tz, title, body, link }
export function plannedReminders(trip) {
  const out = [];
  const names = trip.travelers;
  const link = (date) => `#/day/${date}`;

  out.push({ key: 'etravel', date: addDays(trip.start, -2), time: '10:00', tz: 'Asia/Jerusalem',
    title: '📝 עוד יומיים טסים!', body: 'זה הזמן למלא את טופס eTravel של הפיליפינים ולבדוק את הרשימה באפליקציה.', link: '#/today' });
  out.push({ key: 'packing', date: addDays(trip.start, -1), time: '10:00', tz: 'Asia/Jerusalem',
    title: '🎒 מחר טסים! הגיע הזמן לארוז', body: `${names}, רשימת האריזה מחכה באפליקציה. מחר להיות בנתב"ג עד ${airportBy(trip.flights[0])}.`, link: '#/today' });

  for (const day of trip.days) {
    if (day.date < trip.start || day.date > trip.end) continue;
    const tz = tzOfPlace(day.place);
    const f = flightOn(trip, day.date);
    if (f) {
      // Flight day: early enough to matter, never after 08:00.
      const time = fromMin(Math.min(toMin('08:00'), toMin(airportBy(f)) - 120));
      out.push({ key: `morning_${day.date}`, date: day.date, time, tz: tzOfDeparture(f),
        title: `✈️ יום טיסה: ${f.legs[0].from.city} ← ${f.legs[f.legs.length - 1].to.city}`,
        body: `טיסה ${f.legs[0].flightNo} ב-${localTime(f.legs[0].dep)}. להיות בשדה עד ${airportBy(f)}. מספר הזמנה: ${f.booking}`,
        link: link(day.date) });
    } else if (day.date !== trip.end) {
      const hotelOut = hotelCheckingOut(trip, day.date);
      out.push({ key: `morning_${day.date}`, date: day.date, time: '08:00', tz,
        title: `☀️ בוקר טוב ${names}!`,
        body: `היום ב${HE_PLACE(trip, day.place)}${day.title && day.title !== HE_PLACE(trip, day.place) ? `: ${day.title}` : ''}.${hotelOut ? ' יש היום צ\'ק אאוט.' : ''} הציצו באפליקציה 🌴`,
        link: link(day.date) });
    }
  }

  for (const f of trip.flights) {
    const eve = addDays(f.date, -1);
    // No evening reminder when they spend that evening flying.
    if (eve < addDays(trip.start, -1) || flightOn(trip, eve)) continue;
    const out1 = hotelCheckingOut(trip, f.date);
    out.push({ key: `eve_${f.date}`, date: eve, time: '20:00', tz: tzOfDeparture(f),
      title: `🧳 מחר טסים ל${f.legs[f.legs.length - 1].to.city}`,
      body: `טיסה ${f.legs[0].flightNo} ב-${localTime(f.legs[0].dep)}. להיות בשדה עד ${airportBy(f)}.${out1 ? ` צ'ק אאוט מ-${out1.name}.` : ''} כדאי לארוז הערב.`,
      link: link(f.date) });
  }
  return out;
}

// Reminders due now: their local time has passed today, within a 4-hour grace window, not yet sent.
export function dueReminders(trip, now, sent = {}) {
  return plannedReminders(trip).filter((r) => {
    if (sent[r.key]) return false;
    const { date, hm } = localParts(now, r.tz);
    if (date !== r.date) return false;
    const late = toMin(hm) - toMin(r.time);
    return late >= 0 && late < 240;
  });
}

// How often to check a leg right now (ms), or null when it needs no check.
// Once a day before that for the first flight only (catches early schedule changes, ~2 requests a day);
// every 12h from 4 days out; every 3h in the last day; every 20 min from 4h before take-off
// (longer while a delayed flight hasn't left yet) and around landing until it has landed.
const H = 3600e3, M = 60e3;
export function pollEvery(leg, t, last, daily = false) {
  const status = last && last.status;
  if (status === 'landed' || status === 'cancelled') return null;
  const dep = new Date(leg.dep).getTime(), arr = new Date(leg.arr).getTime();
  const airborne = status === 'departed';
  if (t >= arr - 30 * M && t <= arr + 3 * H) return 20 * M;
  if (!airborne && t >= dep - 4 * H && t <= dep + 6 * H) return 20 * M;
  if (t >= dep - 24 * H && t < dep - 4 * H) return 3 * H;
  if (t >= dep - 4 * 24 * H && t < dep - 24 * H) return 12 * H;
  if (daily && t < dep - 4 * 24 * H) return 24 * H;
  return null;
}

// Legs due for a check now. A minute of slack so a 5-minute schedule lands on every 20 minutes.
export function legsToCheck(trip, now, lastChecked = {}, notified = {}) {
  const t = now.getTime();
  const res = [];
  trip.flights.forEach((f, i) => {
    for (const leg of f.legs) {
      const key = `${leg.flightNo}_${leg.dep.slice(0, 10)}`;
      const every = pollEvery(leg, t, notified[key], i === 0);
      if (every && t - (lastChecked[key] || 0) >= every - M) res.push({ key, leg });
    }
  });
  return res;
}

// Telegram messages are one fact per line: "label: value".
const lines = (title, rows) => [`<b>${title}</b>`, ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)].join('\n');
const legRoute = (leg) => `${leg.from.city || leg.from.code} ← ${leg.to.city || leg.to.code}`;

// Landed: a note for Jacob so he can check in with them.
export function landedAlert(leg, prev, next) {
  if (!next || next.status !== 'landed' || (prev && prev.status === 'landed')) return null;
  return lines('🛬 המטוס נחת', [['טיסה', leg.flightNo], ['מסלול', legRoute(leg)], ['נחת בשעה', next.arrLocal]]) + '\nזה זמן טוב לשלוח להם הודעה 💬';
}

// Compare a leg's new status with what we last told them; return a push or null.
// kind/oldDep/newDep/gate let Telegram show the same change as separate lines.
export function flightChangeAlert(leg, prev, next) {
  if (!next) return null;
  const p = prev || { status: 'scheduled', depLocal: localTime(leg.dep), gate: null };
  const title = `⚠️ עדכון לטיסה ${leg.flightNo}`;
  if (next.status === 'cancelled' && p.status !== 'cancelled') {
    return { kind: 'cancelled', title: `❌ טיסה ${leg.flightNo} בוטלה`, body: 'כדאי לפנות לדלפק חברת התעופה ולעדכן את יעקב.' };
  }
  if (next.depLocal && p.depLocal && Math.abs(toMin(next.depLocal) - toMin(p.depLocal)) >= 20) {
    return { kind: 'time', newDep: next.depLocal, oldDep: p.depLocal, gate: next.gate,
      title, body: `שעת ההמראה השתנתה ל-${next.depLocal} (במקום ${p.depLocal}).` };
  }
  if (next.gate && next.gate !== p.gate) {
    return { kind: 'gate', gate: next.gate, newDep: next.depLocal || localTime(leg.dep),
      title: `🚪 שער לטיסה ${leg.flightNo}: ${next.gate}`, body: `המראה ב-${next.depLocal || localTime(leg.dep)}.` };
  }
  return null;
}

// The same change, written for Jacob on Telegram.
export function telegramFlightText(leg, a) {
  const base = [['טיסה', leg.flightNo], ['מסלול', legRoute(leg)]];
  if (a.kind === 'cancelled') return lines('❌ הטיסה בוטלה', base);
  if (a.kind === 'time') return lines('⏰ שינוי בשעת ההמראה', [...base, ['המראה חדשה', `<b>${a.newDep}</b>`], ['במקום', a.oldDep], ['שער', a.gate]]);
  return lines('🚪 פורסם שער', [...base, ['שער', `<b>${a.gate}</b>`], ['המראה', a.newDep]]);
}

export const telegramErrorText = (leg, message) => lines('⚠️ בדיקת הטיסות נכשלה', [['טיסה', leg && leg.flightNo], ['מסלול', leg && legRoute(leg)], ['פרטים', message]]);

// Online check-in sites, by the airline code of the booking's first flight.
export const CHECKIN = {
  FZ: 'https://www.flydubai.com/en/flying-with-us/check-in/online-check-in/',
  PR: 'https://www.philippineairlines.com/ph/en/check-in-online.html',
  '5J': 'https://book.cebupacificair.com/Checkin/Retrieve',
  DG: 'https://book.cebupacificair.com/Checkin/Retrieve',
};


// Messages for Jacob on Telegram: { key, at (Date), text }.
// 24h before each flight: check-in with the link and booking code. Flight day morning: when to be at the airport.
export function telegramReminders(trip) {
  const out = [];
  for (const f of trip.flights) {
    // A booking with a connection gets a message per flight.
    const morning = plannedReminders(trip).find((r) => r.key === `morning_${f.date}`);
    f.legs.forEach((leg, i) => {
      const link = CHECKIN[leg.flightNo.slice(0, 2)];
      const part = f.legs.length > 1 ? ` (${i + 1} מתוך ${f.legs.length})` : '';
      out.push({ key: `tg_checkin_${f.date}_${leg.flightNo}`, at: new Date(new Date(leg.dep).getTime() - 24 * 3600e3),
        text: lines(`✅ צ'ק אין פתוח${part}`, [
          ['טיסה', leg.flightNo], ['מסלול', legRoute(leg)], ['תאריך', shortDate(leg.dep.slice(0, 10))],
          ['בשעה', localTime(leg.dep)], ['הזמנה', `<code>${f.booking}</code>`], ["צ'ק אין", link]]) });
      if (morning) {
        out.push({ key: i ? `tg_day_${f.date}_${i + 1}` : `tg_day_${f.date}`, at: zonedTime(morning.date, morning.time, tzOfDeparture(f)),
          text: lines(`✈️ היום טסים${part}`, [
            ['טיסה', leg.flightNo], ['מסלול', legRoute(leg)], ['תאריך', i ? shortDate(leg.dep.slice(0, 10)) : null], ['בשעה', localTime(leg.dep)],
            i ? ['קונקשן ב', leg.from.city || leg.from.code] : ['להיות בשדה עד', `<b>${airportBy(f)}</b>`],
            ['הזמנה', `<code>${f.booking}</code>`]]) });
      }
    });
  }
  return out;
}

// Due now: its time has passed, within a 4-hour grace window, not yet sent.
export function dueTelegram(trip, now, sent = {}) {
  return telegramReminders(trip).filter((r) => !sent[r.key] && now >= r.at && now - r.at < 4 * 3600e3);
}

// A wall-clock time in a zone as a Date (the trip's zones have no DST in November).
const OFFSET = { 'Asia/Jerusalem': '+02:00', 'Asia/Manila': '+08:00' };
const zonedTime = (date, hm, tz) => new Date(`${date}T${hm}:00${OFFSET[tz] || '+00:00'}`);

export const _test = { toMin, fromMin, addDays, shortDate };
