// Peso ⇄ shekel converter: a round button that floats above the tab bar on every screen.
(function (App) {
  const { esc } = App;
  const RATE_KEY = 'fx_php_ils';

  // Live rate (open.er-api.com, free, no key), refreshed at most every 12 hours;
  // falls back to the approximate rate from the trip data when offline.
  App.fxRate = () => {
    const live = App.store.get(RATE_KEY, null);
    return live ? live.rate : App.trip.info.currency.approxIls;
  };
  App.fxRateDate = () => (App.store.get(RATE_KEY, null) || {}).date || null;

  App.refreshFxRate = async () => {
    const live = App.store.get(RATE_KEY, null);
    if (live && Date.now() - live.t < 12 * 3600e3) return;
    try {
      const j = await (await fetch('https://open.er-api.com/v6/latest/PHP')).json();
      if (j.result === 'success' && j.rates && j.rates.ILS) {
        App.store.set(RATE_KEY, { t: Date.now(), rate: j.rates.ILS, date: App.fmtDate(new Date(j.time_last_update_unix * 1000)) });
      }
    } catch (e) { /* offline: keep the last or approximate rate */ }
  };

  const fmt = (n) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('he-IL');

  App.fxButton = () => '<button class="fx-fab" data-fx aria-label="המרת כספים">💱</button>';

  App.fxModal = () => {
    const rate = App.fxRate();
    const date = App.fxRateDate();
    const rows = [100, 500, 1000, 5000].map((p) => `<tr><td><bdi>${p.toLocaleString('he-IL')}</bdi> פזו</td><td><b>${fmt(p * rate)}</b> ₪</td></tr>`).join('');
    return `
    <div class="modal fx-modal" data-close>
      <div class="modal-box fx-box" dir="rtl">
        <h2>💱 המרת כספים</h2>
        <label class="fx-field"><span>פזו</span><input type="number" inputmode="decimal" id="fx-php" placeholder="0"></label>
        <label class="fx-field"><span>שקלים ₪</span><input type="number" inputmode="decimal" id="fx-ils" placeholder="0"></label>
        <table class="fx-table">${rows}</table>
        <p class="muted">${date ? `שער מעודכן ל-<bdi>${App.shortDate(date)}</bdi>` : 'שער משוער'}: 100 פזו ≈ ${fmt(100 * rate)} ₪</p>
        <button class="btn btn-wide" data-close>סגירה</button>
      </div>
    </div>`;
  };

  document.addEventListener('input', (e) => {
    const rate = App.fxRate();
    if (e.target.id === 'fx-php') document.getElementById('fx-ils').value = e.target.value ? fmt(Number(e.target.value) * rate).replace(/,/g, '') : '';
    if (e.target.id === 'fx-ils') document.getElementById('fx-php').value = e.target.value ? Math.round(Number(e.target.value) / rate) : '';
  });
})(window.App);
