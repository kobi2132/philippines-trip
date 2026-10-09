// Shared helpers. Every script hangs its exports off window.App.
window.App = window.App || {};

(function (App) {
  const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // "2026-11-14" <-> Date at local noon (avoids DST edge cases when adding days)
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); };
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

  const weekday = (s) => HE_DAYS[parseDate(s).getDay()];
  const shortDate = (s) => { const d = parseDate(s); return `${d.getDate()}.${d.getMonth() + 1}`; };
  // Date ranges read right to left in Hebrew: wrap each date so bidi keeps the order.
  const range = (a, b) => `<bdi>${shortDate(a)}</bdi> עד <bdi>${shortDate(b)}</bdi>`;
  const longDate = (s) => { const d = parseDate(s); return `יום ${weekday(s)}, ${d.getDate()} ב${HE_MONTHS[d.getMonth()]}`; };

  // Flight times are stored as ISO strings with the airport's own offset,
  // e.g. "2026-11-06T10:40:00+02:00". Shown exactly as written (local time there).
  const localTime = (iso) => iso ? iso.slice(11, 16) : '';
  const localDate = (iso) => iso ? iso.slice(0, 10) : '';
  const minusMinutes = (hhmm, mins) => {
    const [h, m] = hhmm.split(':').map(Number);
    let t = h * 60 + m - mins; t = ((t % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };
  const duration = (isoA, isoB) => {
    const mins = Math.round((new Date(isoB) - new Date(isoA)) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h}:${String(m).padStart(2, '0')} שעות` : `${h} שעות`;
  };

  // "Now", overridable for previewing: ?date=2026-11-14 (or ?now=2026-11-14T08:00)
  let nowOverride = null;
  try {
    const p = new URLSearchParams(location.search);
    const v = p.get('now') || (p.get('date') ? p.get('date') + 'T09:00' : null);
    if (v) sessionStorage.setItem('nowOverride', v);
    if (p.get('date') === 'real') sessionStorage.removeItem('nowOverride');
    nowOverride = sessionStorage.getItem('nowOverride');
  } catch (e) { /* storage blocked: no preview mode */ }
  const now = () => nowOverride ? new Date(nowOverride) : new Date();
  const today = () => fmtDate(now());
  const isPreview = () => !!nowOverride;

  // Navigation links open Google Maps with a route from the current location.
  const mapsUrl = (query, mode) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=${mode}`;
  const navButtons = (query) => query ? `
    <div class="btn-row">
      <a class="btn btn-nav" href="${mapsUrl(query, 'driving')}" target="_blank" rel="noopener">🚕 ניווט ברכב</a>
      <a class="btn btn-nav" href="${mapsUrl(query, 'walking')}" target="_blank" rel="noopener">🚶 ניווט ברגל</a>
    </div>` : '';

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } },
  };

  Object.assign(App, {
    esc, parseDate, fmtDate, addDays, daysBetween, weekday, shortDate, range, longDate,
    localTime, localDate, minusMinutes, duration, now, today, isPreview, mapsUrl, navButtons, store,
  });
})(window.App);
