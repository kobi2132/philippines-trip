// Boarding passes: Jacob uploads a screenshot per flight leg and person after the online check-in;
// the travelers open it full screen inside the flight card. Stored in Firestore (trips/{tripId}/passes),
// never in the repo; a copy is kept on the phone so it opens at the airport with no signal.
(function (App) {
  const { esc } = App;
  const CACHE = 'boarding-passes'; // kept by sw.js across versions
  const CACHE_URL = 'passes.json';

  App.passes = {}; // docId -> { flight, leg, flightNo, person, img }

  // "שמוליק ואתי" -> ["שמוליק", "אתי"]
  App.passPeople = () => String((App.trip && App.trip.travelers) || '').split(/\s+ו(?=\S)|,\s*/).map((s) => s.trim()).filter(Boolean);
  const passId = (flightId, leg, person) => `${flightId}-${leg}-${App.passPeople().indexOf(person)}`;
  const passesFor = (flightId, leg) => App.passPeople()
    .map((p) => App.passes[passId(flightId, leg, p)]).filter(Boolean);
  // Travelers and admin only: the agent (viewer) doesn't see them.
  const canSee = () => App.role === 'traveler' || App.role === 'admin';

  // ---------- phone copy (Cache Storage: room for images, unlike localStorage) ----------
  App.loadPassCopy = async () => {
    try {
      const res = await (await caches.open(CACHE)).match(CACHE_URL);
      if (res && !Object.keys(App.passes).length) { App.passes = await res.json(); if (App.trip) App.render(); }
    } catch (e) { /* no copy yet */ }
  };
  App.setPasses = (passes) => {
    App.passes = passes;
    try {
      caches.open(CACHE).then((c) => c.put(CACHE_URL, new Response(JSON.stringify(passes), { headers: { 'Content-Type': 'application/json' } }))).catch(() => {});
    } catch (e) { /* no Cache Storage */ }
  };

  // ---------- inside the flight card ----------
  App.passButtons = (f, i) => {
    if (!canSee()) return '';
    const have = passesFor(f.id, i);
    const open = have.length ? `<button class="btn btn-pass" data-pass-open="${esc(f.id)}" data-leg="${i}">🎫 כרטיס עלייה</button>` : '';
    const add = App.role === 'admin' ? `<button class="link-small pass-add" data-pass-add="${esc(f.id)}" data-leg="${i}">➕ ${have.length ? 'עדכון' : 'הוספת'} כרטיס עלייה</button>` : '';
    return open || add ? `<div class="pass-row">${open}${add}</div>` : '';
  };

  const leg = (flightId, i) => App.trip.flights.find((f) => f.id === flightId).legs[i];

  const viewModal = (flightId, i, personIdx = 0) => {
    const have = passesFor(flightId, i);
    const p = have[Math.min(personIdx, have.length - 1)];
    const l = leg(flightId, i);
    return `
    <div class="modal pass-modal">
      <div class="modal-box pass-box" dir="rtl">
        <div class="pass-head"><b>🎫 <bdi dir="ltr">${esc(l.flightNo)}</bdi> ${esc(l.from.city || l.from.code)} ← ${esc(l.to.city || l.to.code)}</b><button class="pass-close" data-close aria-label="סגירה">✕</button></div>
        ${have.length > 1 ? `<div class="pass-tabs">${have.map((x, k) => `<button class="${x === p ? 'on' : ''}" data-pass-open="${esc(flightId)}" data-leg="${i}" data-person="${k}">${esc(x.person)}</button>`).join('')}</div>` : `<div class="pass-name">${esc(p.person)}</div>`}
        <img class="pass-img" src="${p.img}" alt="כרטיס עלייה של ${esc(p.person)}">
        <p class="muted pass-tip">בשער: מגבירים את בהירות המסך ומראים את הברקוד</p>
      </div>
    </div>`;
  };

  const addModal = (flightId, i) => {
    const l = leg(flightId, i);
    return `
    <div class="modal" data-close>
      <div class="modal-box pass-add-box" dir="rtl">
        <h2>🎫 כרטיס עלייה <bdi dir="ltr">${esc(l.flightNo)}</bdi></h2>
        <p class="muted">צילום מסך של כרטיס העלייה (עם הברקוד), תמונה אחת לכל נוסע.</p>
        ${App.passPeople().map((person) => {
          const has = App.passes[passId(flightId, i, person)];
          return `<div class="pass-person">
            <b>${esc(person)}</b>${has ? ' <span class="muted">✅ יש כרטיס</span>' : ''}
            <div class="btn-row">
              <label class="btn btn-nav">📷 ${has ? 'החלפה' : 'בחירת תמונה'}<input type="file" accept="image/*" hidden data-pass-file="${esc(flightId)}" data-leg="${i}" data-person="${esc(person)}"></label>
              ${has ? `<button class="btn" data-pass-del="${esc(flightId)}" data-leg="${i}" data-person="${esc(person)}">🗑️ מחיקה</button>` : ''}
            </div>
          </div>`;
        }).join('')}
        <p id="pass-msg" class="muted"></p>
        <button class="btn btn-wide" data-close>סגירה</button>
      </div>
    </div>`;
  };

  // A phone screenshot shrunk so it fits one Firestore document (under 1MB) and the barcode stays sharp.
  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = url; });
      for (const [w, q] of [[1080, 0.9], [1080, 0.8], [900, 0.8], [720, 0.75]]) {
        const scale = Math.min(1, w / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', q);
        if (data.length < 900000) return data;
      }
      throw new Error('התמונה גדולה מדי');
    } finally { URL.revokeObjectURL(url); }
  }

  const reopenAdd = (flightId, i) => {
    document.querySelector('.modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', App.iconize(addModal(flightId, i)));
  };

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-pass-open],[data-pass-add],[data-pass-del]');
    if (!t) return;
    e.preventDefault();
    const flightId = t.dataset.passOpen || t.dataset.passAdd || t.dataset.passDel;
    const i = Number(t.dataset.leg);
    if (t.dataset.passOpen) {
      document.querySelector('.modal')?.remove();
      document.body.insertAdjacentHTML('beforeend', App.iconize(viewModal(flightId, i, Number(t.dataset.person || 0))));
    } else if (t.dataset.passAdd) {
      reopenAdd(flightId, i);
    } else if (t.dataset.passDel) {
      t.disabled = true;
      try { await App.backend.deletePass(passId(flightId, i, t.dataset.person)); reopenAdd(flightId, i); App.render(); } catch (err) {
        document.getElementById('pass-msg').textContent = '❌ המחיקה לא הצליחה (' + (err.code || err.message) + ')';
        t.disabled = false;
      }
    }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (!t.dataset.passFile || !t.files[0]) return;
    const flightId = t.dataset.passFile, i = Number(t.dataset.leg), person = t.dataset.person;
    const msg = document.getElementById('pass-msg');
    msg.textContent = '⏳ שומר...';
    try {
      const img = await shrink(t.files[0]);
      await App.backend.savePass(passId(flightId, i, person), { flight: flightId, leg: i, flightNo: leg(flightId, i).flightNo, person, img });
      reopenAdd(flightId, i);
      document.getElementById('pass-msg').textContent = '✅ נשמר. הכרטיס יופיע אצלם בפעם הבאה שיפתחו את האפליקציה עם אינטרנט.';
      App.render();
    } catch (err) {
      msg.textContent = '❌ השמירה לא הצליחה (' + (err.code || err.message) + ')';
    }
  });
})(window.App);
