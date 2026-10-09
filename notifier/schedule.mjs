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

// Legs to poll now. Near departure (6h before until 1h after landing) every 25 min; a day out, every 6h.
export function legsToCheck(trip, now, lastChecked = {}) {
  const t = now.getTime();
  const res = [];
  for (const f of trip.flights) {
    for (const leg of f.legs) {
      const dep = new Date(leg.dep).getTime(), arr = new Date(leg.arr).getTime();
      const key = `${leg.flightNo}_${leg.dep.slice(0, 10)}`;
      const since = t - (lastChecked[key] || 0);
      const near = t >= dep - 6 * 3600e3 && t <= arr + 3600e3;
      const dayOut = t >= dep - 24 * 3600e3 && t < dep - 6 * 3600e3;
      if ((near && since >= 25 * 60e3) || (dayOut && since >= 6 * 3600e3)) res.push({ key, leg });
    }
  }
  return res;
}

// Compare a leg's new status with what we last told them; return a push or null.
export function flightChangeAlert(leg, prev, next) {
  if (!next) return null;
  const p = prev || { status: 'scheduled', depLocal: localTime(leg.dep), gate: null };
  const title = `⚠️ עדכון לטיסה ${leg.flightNo}`;
  if (next.status === 'cancelled' && p.status !== 'cancelled') {
    return { title: `❌ טיסה ${leg.flightNo} בוטלה`, body: 'כדאי לפנות לדלפק חברת התעופה ולעדכן את יעקב.' };
  }
  if (next.depLocal && p.depLocal && Math.abs(toMin(next.depLocal) - toMin(p.depLocal)) >= 20) {
    return { title, body: `שעת ההמראה השתנתה ל-${next.depLocal} (במקום ${p.depLocal}).` };
  }
  if (next.gate && next.gate !== p.gate) {
    return { title: `🚪 שער לטיסה ${leg.flightNo}: ${next.gate}`, body: `המראה ב-${next.depLocal || localTime(leg.dep)}.` };
  }
  return null;
}

export const _test = { toMin, fromMin, addDays, shortDate };
