// Peso ⇄ shekel ⇄ dollar converter: a round button that floats above the tab bar on every screen.
(function (App) {
  const { esc } = App;
  const RATE_KEY = 'fx_php_ils';

  // Live rate (open.er-api.com, free, no key), refreshed at most every 12 hours;
  // falls back to the approximate rate from the trip data when offline.
  App.fxRate = () => {
    const live = App.store.get(RATE_KEY, null);
    return live ? live.rate : App.trip.info.currency.approxIls;
  };
  // Dollars per peso: live, else trip data's approxUsd, else a built-in rough rate.
  App.fxUsdRate = () => {
    const live = App.store.get(RATE_KEY, null);
    return (live && live.usd) || App.trip.info.currency.approxUsd || 0.017;
  };
  App.fxRateDate = () => (App.store.get(RATE_KEY, null) || {}).date || null;

  App.refreshFxRate = async () => {
    const live = App.store.get(RATE_KEY, null);
    if (live && live.usd && Date.now() - live.t < 12 * 3600e3) return;
    try {
      const j = await (await fetch('https://open.er-api.com/v6/latest/PHP')).json();
      if (j.result === 'success' && j.rates && j.rates.ILS) {
        App.store.set(RATE_KEY, { t: Date.now(), rate: j.rates.ILS, usd: j.rates.USD || null, date: App.fmtDate(new Date(j.time_last_update_unix * 1000)) });
      }
    } catch (e) { /* offline: keep the last or approximate rate */ }
  };

  const fmt = (n) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('he-IL');

  App.fxButton = () => '<button class="fx-fab" data-fx aria-label="המרת כספים">💱</button>';

  App.fxModal = () => {
    const rate = App.fxRate();
    const usd = App.fxUsdRate();
    const date = App.fxRateDate();
    const rows = [100, 500].map((p) => `<tr><td><bdi>${p.toLocaleString('he-IL')}</bdi> פזו</td><td><b>${fmt(p * rate)}</b> ₪</td><td><b>${fmt(p * usd)}</b> $</td></tr>`).join('');
    return `
    <div class="modal fx-modal" data-close>
      <div class="modal-box fx-box" dir="rtl">
        <div class="hero-emoji">💱</div>
        <h2>המרת כספים</h2>
        <label class="fx-field"><span>פזו</span><input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" id="fx-php" placeholder="0"></label>
        <label class="fx-field"><span>שקלים ₪</span><input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" id="fx-ils" placeholder="0"></label>
        <label class="fx-field"><span>דולר $</span><input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" id="fx-usd" placeholder="0"></label>
        <table class="fx-table">${rows}</table>
        <p class="muted">${date ? `שער מעודכן ל-<bdi>${App.shortDate(date)}</bdi>` : 'שער משוער'}: 100 פזו ≈ ${fmt(100 * rate)} ₪ ≈ ${fmt(100 * usd)} $</p>
        <button class="btn btn-wide" data-close>סגירה</button>
      </div>
    </div>`;
  };

  document.addEventListener('input', (e) => {
    // Pesos per one unit of each field; typing in one field fills the other two.
    const per = { 'fx-php': 1, 'fx-ils': 1 / App.fxRate(), 'fx-usd': 1 / App.fxUsdRate() };
    if (!(e.target.id in per)) return;
    e.target.value = e.target.value.replace(/\D/g, '');
    const php = e.target.value ? Number(e.target.value) * per[e.target.id] : null;
    Object.keys(per).forEach((id) => {
      if (id === e.target.id) return;
      const v = php === null ? '' : php / per[id];
      document.getElementById(id).value = v === '' ? '' : (id === 'fx-php' ? Math.round(v) : fmt(v).replace(/,/g, ''));
    });
  });

  // The on-screen keyboard covers the bottom of the screen: keep the converter in the part still visible.
  const fitToKeyboard = () => {
    const m = document.querySelector('.fx-modal');
    const vv = window.visualViewport;
    if (!m || !vv) return;
    m.style.top = vv.offsetTop + 'px';
    m.style.height = vv.height + 'px';
    m.style.bottom = 'auto';
  };
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', fitToKeyboard);
    visualViewport.addEventListener('scroll', fitToKeyboard);
  }
  App.fitFxModal = fitToKeyboard;
})(window.App);
