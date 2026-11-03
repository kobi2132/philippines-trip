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
        <div class="pass-zoom-btns"><button class="btn btn-nav" data-pass-zoom="in">+ הגדלה</button><button class="btn" data-pass-zoom="turn">↻ סיבוב</button><button class="btn" data-pass-zoom="reset">גודל רגיל</button></div>
        <div class="pass-zoom"><img class="pass-img" src="${p.img}" alt="כרטיס עלייה של ${esc(p.person)}" draggable="false"></div>
        <p class="muted pass-tip">צביטה או הקשה כפולה מגדילות. בשער: מגבירים את בהירות המסך.</p>
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

  // ---------- zoom on the pass only (the app itself has zoom turned off) ----------
  // The pass fills the screen below the buttons. Pinch with two fingers, drag with one when zoomed,
  // double-tap, or the buttons; "סיבוב" turns it 90° so a long barcode runs along the phone's length.
  const MAX = 8;
  let rot = 0; // kept when switching between the travelers' tabs
  let z = null; // { box, img, s: zoom over "fit", x, y: top-left of the pass in the box, rot: 0 | 90 }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  // Size of the pass as shown (turned or not), in image pixels, and the scale that fits it in the box.
  const dims = () => {
    const iw = z.img.naturalWidth || 1, ih = z.img.naturalHeight || 1;
    const [cw, ch] = z.rot ? [ih, iw] : [iw, ih];
    return { iw, ih, cw, ch, fit: Math.min(z.box.clientWidth / cw, z.box.clientHeight / ch) };
  };
  const scale = () => dims().fit * z.s;
  // Smaller than the box: centered. Bigger: its edges can't be dragged inside the box.
  const place = (pos, size, room) => (size <= room ? (room - size) / 2 : clamp(pos, room - size, 0));
  const apply = () => {
    const { ih, cw, ch, fit } = dims();
    z.s = clamp(z.s, 1, MAX);
    const S = fit * z.s;
    z.x = place(z.x, cw * S, z.box.clientWidth); z.y = place(z.y, ch * S, z.box.clientHeight);
    z.img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${S})${z.rot ? ` translate(${ih}px, 0) rotate(90deg)` : ''}`;
    z.box.classList.toggle('zoomed', z.s > 1);
  };
  // Zoom to s keeping the point (px, py) of the box where it is.
  const zoomAt = (s, px, py) => {
    const S0 = scale(), cx = (px - z.x) / S0, cy = (py - z.y) / S0;
    z.s = clamp(s, 1, MAX);
    const S = scale(); z.x = px - cx * S; z.y = py - cy * S; apply();
  };
  const reset = () => { z.s = 1; z.x = 0; z.y = 0; apply(); };
  // Turning: the pass's width now runs along the screen's height (a long barcode gets the whole length),
  // centered on the part that was in the middle of the screen. Turning back shows the whole pass.
  const turn = () => {
    if (z.rot) { z.rot = rot = 0; reset(); return; }
    const w = z.box.clientWidth, h = z.box.clientHeight, S0 = scale();
    const a = (w / 2 - z.x) / S0, b = (h / 2 - z.y) / S0; // image point in the middle
    z.rot = rot = 90;
    const { iw, ih, fit } = dims();
    z.s = clamp(h / iw / fit, 1, MAX);
    const S = scale();
    z.x = w / 2 - (ih - b) * S; z.y = h / 2 - a * S; apply();
  };
  const zoomFor = (el) => {
    const box = el.closest('.pass-modal')?.querySelector('.pass-zoom');
    if (!box) return null;
    if (!z || z.box !== box) z = { box, img: box.querySelector('img'), s: 1, x: 0, y: 0, rot: 0 };
    return z;
  };
  // Fit the pass as soon as the modal opens and the image is ready, and again when the phone turns.
  const fitNew = () => {
    const box = document.querySelector('.pass-modal .pass-zoom');
    if (!box) return;
    zoomFor(box);
    const turned = rot;
    box.closest('.pass-box').querySelector('[data-pass-zoom="turn"]').classList.toggle('on', !!turned);
    const show = () => { z.rot = 0; reset(); if (turned) turn(); };
    if (z.img.complete) show(); else z.img.addEventListener('load', show, { once: true });
  };
  window.addEventListener('resize', () => { if (z && z.box.isConnected) apply(); });

  let touch = null, lastTap = null;
  const pt = (t, r) => [t.clientX - r.left, t.clientY - r.top];
  document.addEventListener('touchstart', (e) => {
    const box = e.target.closest('.pass-zoom');
    if (!box || !zoomFor(box)) return;
    e.preventDefault(); // the pass area is all ours: no page scroll, no browser gestures
    const r = box.getBoundingClientRect();
    if (e.touches.length === 2) {
      const [a, b] = [pt(e.touches[0], r), pt(e.touches[1], r)];
      touch = { pinch: true, d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s: z.s, S: scale(), x: z.x, y: z.y };
    } else if (e.touches.length === 1) {
      touch = { pinch: false, start: pt(e.touches[0], r), x: z.x, y: z.y, moved: false };
    }
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!touch || !z || !e.target.closest('.pass-zoom')) return;
    e.preventDefault();
    const r = z.box.getBoundingClientRect();
    if (touch.pinch && e.touches.length === 2) {
      const [a, b] = [pt(e.touches[0], r), pt(e.touches[1], r)];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // The point that was under the fingers stays under them.
      const cx = (touch.m[0] - touch.x) / touch.S, cy = (touch.m[1] - touch.y) / touch.S;
      z.s = clamp(touch.s * d / touch.d, 1, MAX);
      const S = scale(); z.x = m[0] - cx * S; z.y = m[1] - cy * S; apply();
    } else if (!touch.pinch && e.touches.length === 1) {
      const p = pt(e.touches[0], r);
      if (Math.hypot(p[0] - touch.start[0], p[1] - touch.start[1]) > 10) touch.moved = true;
      if (z.s > 1) { z.x = touch.x + p[0] - touch.start[0]; z.y = touch.y + p[1] - touch.start[1]; apply(); }
    }
  }, { passive: false });
  document.addEventListener('touchend', (e) => {
    if (!touch || !z) return;
    if (!touch.pinch && !touch.moved && e.touches.length === 0) {
      const now = Date.now(), p = touch.start;
      if (lastTap && now - lastTap.t < 350 && Math.hypot(p[0] - lastTap.p[0], p[1] - lastTap.p[1]) < 40) {
        if (z.s > 1) reset(); else zoomAt(2.5, p[0], p[1]);
        lastTap = null;
      } else lastTap = { t: now, p };
    }
    if (e.touches.length === 0) touch = null;
  }, { passive: false });
  // Computer: double click.
  document.addEventListener('dblclick', (e) => {
    const box = e.target.closest('.pass-zoom');
    if (!box || !zoomFor(box)) return;
    const r = box.getBoundingClientRect();
    if (z.s > 1) reset(); else zoomAt(2.5, e.clientX - r.left, e.clientY - r.top);
  });

  document.addEventListener('click', async (e) => {
    const zb = e.target.closest('[data-pass-zoom]');
    if (zb && zoomFor(zb)) {
      const how = zb.dataset.passZoom;
      if (how === 'in') zoomAt(z.s * 1.6, z.box.clientWidth / 2, z.box.clientHeight / 2);
      else if (how === 'turn') { turn(); zb.classList.toggle('on', !!z.rot); }
      else reset();
      return;
    }
    const t = e.target.closest('[data-pass-open],[data-pass-add],[data-pass-del]');
    if (!t) return;
    e.preventDefault();
    const flightId = t.dataset.passOpen || t.dataset.passAdd || t.dataset.passDel;
    const i = Number(t.dataset.leg);
    if (t.dataset.passOpen) {
      if (t.dataset.person === undefined) rot = 0; // opened from the flight card, not a tab
      document.querySelector('.modal')?.remove();
      document.body.insertAdjacentHTML('beforeend', App.iconize(viewModal(flightId, i, Number(t.dataset.person || 0))));
      fitNew();
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
