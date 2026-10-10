// Router, rendering, and the event handlers shared by all screens.
(function (App) {
  const { esc } = App;
  const main = () => document.getElementById('main');
  const tabbar = () => document.getElementById('tabbar');

  const TABS = [
    ['today', '🏠', 'היום'], ['flights', '✈️', 'טיסות'], ['hotels', '🏨', 'מלונות'],
    ['attractions', '🌴', 'אטרקציות'], ['route', '🗺️', 'מסלול'], ['info', 'ℹ️', 'מידע'],
  ];

  const route = () => (location.hash.replace(/^#\/?/, '') || 'today').split('/');

  App.render = () => {
    if (!App.trip) return;
    const [name, arg] = route();
    // Background updates must not wipe what the admin is in the middle of editing.
    if (name === 'admin' && document.getElementById('admin-members')) return;
    let html;
    if (name === 'day' && arg) html = App.views.day(arg);
    else if (name === 'attractions') html = App.views.attractions(arg);
    else if (name === 'admin' && App.role === 'admin') html = adminView();
    else html = (App.views[name] || App.views.today)();
    main().innerHTML = App.previewBanner() + App.viewerBanner() + (name === 'today' ? App.noteBanner() : '') + html;
    const active = name === 'day' ? 'today' : name;
    tabbar().hidden = false;
    tabbar().innerHTML = TABS.map(([k, ico, label]) =>
      `<a href="#/${k}" class="${k === active ? 'on' : ''}"><span class="tab-ico">${ico}</span><span>${label}</span></a>`).join('');
    if (!document.querySelector('.fx-fab')) { document.body.insertAdjacentHTML('beforeend', App.fxButton()); App.refreshFxRate(); }
    fillWeather();
    onScroll();
  };

  // When the day header scrolls away, a slim date + place bar takes its place at the top.
  // A gap between the on and off points keeps the bar from flickering: the arrows row
  // shrinks when the bar appears, which shifts the page by a few pixels.
  let headGone = false;
  const onScroll = () => {
    const head = document.querySelector('.day-head');
    const bottom = head ? head.getBoundingClientRect().bottom : Infinity;
    if (!headGone && bottom < -30) headGone = true;
    else if (headGone && bottom > 30) headGone = false;
    document.body.classList.toggle('head-gone', headGone);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Flights / hotels lists: opening one card closes the others in the same list.
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches || !d.matches('details[data-fold]')) return;
    const group = d.dataset.fold;
    if (d.open) {
      App.openFold[group] = d.dataset.id;
      document.querySelectorAll(`details[data-fold="${group}"][open]`).forEach((o) => { if (o !== d) o.open = false; });
      setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } else if (App.openFold[group] === d.dataset.id) {
      App.openFold[group] = null;
    }
  }, true);

  // ---------- full-screen states (before the trip data is available) ----------

  const SCREENS = {
    login: () => `
      <div class="center-screen">
        <div class="hero-emoji">🌴✈️🏝️</div>
        <h1>הטיול לפיליפינים</h1>
        <p>נכנסים פעם אחת עם חשבון הגוגל, ומשם הכל שמור בטלפון.</p>
        <button class="btn btn-wide btn-google" data-signin>🔑 כניסה עם Google</button>
        <p class="muted" id="login-err"></p>
      </div>`,
    'no-access': () => `
      <div class="center-screen">
        <div class="hero-emoji">🔒</div>
        <h1>אין גישה לחשבון הזה</h1>
        <p>נכנסתם בתור <b>${esc(App.user && App.user.email)}</b>. בקשו מיעקב להוסיף אותו, או התחברו עם חשבון אחר.</p>
        <button class="btn btn-wide" data-signout>החלפת חשבון</button>
      </div>`,
    setup: () => `
      <div class="center-screen">
        <div class="hero-emoji">🛠️</div>
        <h1>האפליקציה עוד לא מחוברת</h1>
        <p>צריך להשלים את חיבור Firebase בקובץ js/config.js.</p>
      </div>`,
    offline: () => `
      <div class="center-screen">
        <div class="hero-emoji">📶</div>
        <h1>אין חיבור לאינטרנט</h1>
        <p>בפעם הראשונה צריך אינטרנט כדי להיכנס. אחרי זה האפליקציה עובדת גם בלי.</p>
        <button class="btn btn-wide" onclick="location.reload()">לנסות שוב</button>
      </div>`,
    'admin-empty': () => adminView(true),
  };

  App.showScreen = (name) => {
    tabbar().hidden = true;
    main().innerHTML = SCREENS[name]();
  };

  // ---------- admin ----------

  const ROLES = [['traveler', 'מטייל'], ['viewer', 'צופה'], ['admin', 'מנהל']];
  const memberRow = (email = '', role = 'viewer') => `
    <div class="member-row">
      <input type="email" class="m-email" dir="ltr" placeholder="name@gmail.com" value="${esc(email)}">
      <select class="m-role">${ROLES.map(([k, l]) => `<option value="${k}" ${k === role ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="li-del" data-member-del aria-label="הסרה">🗑️</button>
    </div>`;
  let pendingRow = null; // the user row waiting for "are you sure?"
  const fillMembers = (members) => {
    document.getElementById('admin-members').innerHTML = Object.entries(members || {}).map(([e, r]) => memberRow(e, r)).join('');
  };
  const readMembers = () => {
    const out = {};
    for (const row of document.querySelectorAll('#admin-members .member-row')) { // not the header row
      const email = row.querySelector('.m-email').value.trim().toLowerCase();
      if (!email) continue;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('כתובת מייל לא תקינה: ' + email);
      out[email] = row.querySelector('.m-role').value;
    }
    return out;
  };

  // The trip data as readable sections; the raw text stays one tap away for full edits.
  const dataSummary = (d) => {
    const sec = (title, items) => `<details class="admin-sec"><summary>${title} <span class="muted">(${items.length})</span></summary><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul></details>`;
    const sd = (s) => s ? `<bdi>${App.shortDate(s)}</bdi>` : '';
    const legs = (f) => (f.legs || []).map((l) => `<bdi dir="ltr">${esc(l.flightNo)} ${esc(l.from.code)}→${esc(l.to.code)} ${App.localTime(l.dep)}</bdi>`).join(' · ');
    return `
      <div class="admin-general">
        <p><b>${esc(d.title)}</b></p>
        <p>מטיילים: ${esc(d.travelers)}</p>
        <p>תאריכים: ${d.start && d.end ? App.range(d.start, d.end) : ''}</p>
        ${d.contact ? `<p>איש קשר: ${esc(d.contact.name)}${d.contact.whatsapp ? ` · <bdi>${esc(d.contact.whatsapp)}</bdi>` : ''}</p>` : ''}
      </div>
      ${sec('✈️ טיסות', (d.flights || []).map((f) => `${sd(f.date)} ${esc(f.title)}<br><span class="muted">${legs(f)} · הזמנה <bdi>${esc(f.booking)}</bdi></span>`))}
      ${sec('🏨 מלונות', (d.hotels || []).map((h) => `${sd(h.checkIn)}–${sd(h.checkOut)} <b>${esc(h.name)}</b>, ${esc(h.city)}<br><span class="muted">${esc(h.room || '')} · הזמנה <bdi>${esc(h.booking)}</bdi></span>`))}
      ${sec('🚕 הסעות ומעבורות', (d.transfers || []).map((t) => `${sd(t.date)} ${esc(t.title)}`))}
      ${sec('📅 ימים', (d.days || []).map((x) => `${sd(x.date)} ${esc(x.title)}`))}
      ${sec('🌴 אטרקציות', (d.attractions || []).map((a) => `${esc(a.name)} <span class="muted">(${esc((d.places || {})[a.place]?.name || a.place)})</span>`))}`;
  };
  const showSummary = () => {
    const el = document.getElementById('admin-summary');
    try { el.innerHTML = dataSummary(JSON.parse(document.getElementById('admin-data').value)); } catch (e) { el.innerHTML = '<p class="muted">❌ יש טעות בעריכה המתקדמת: ' + esc(e.message) + '</p>'; }
  };

  function adminView(empty) {
    setTimeout(async () => {
      const cur = await App.backend.loadForAdmin().catch(() => null);
      document.getElementById('admin-data').value = JSON.stringify(cur ? cur.data : App.trip || {}, null, 2);
      fillMembers(cur ? cur.members : { [App.user.email]: 'admin' });
      showSummary();
    });
    return `<h1 class="page-h">⚙️ ניהול נתונים</h1>
      ${empty ? '<p>הטיול עוד לא קיים במסד הנתונים. טענו קובץ ושמרו.</p>' : ''}
      <section class="card"><div class="card-title"><span class="ico ico-blue">👥</span><h3>משתמשים</h3></div>
        <div class="admin-help muted"><p>המשתמשים נכנסים עם חשבון גוגל.</p><p>סוגי הרשאות:</p><p>מטייל: צפייה ועריכה. צופה: צפייה. מנהל: הכל</p></div>
        <div class="member-row member-head"><span>מייל משתמש</span><span>תפקיד</span><span>הסרה</span></div>
        <div id="admin-members"></div>
        <button class="btn" data-member-add>➕ הוספת משתמש</button>
      </section>
      <section class="card"><div class="card-title"><span class="ico ico-green">🗂️</span><h3>נתוני הטיול</h3></div>
        <div id="admin-summary"></div>
        <details class="admin-sec admin-raw"><summary>🛠️ עריכה מתקדמת</summary>
          <p class="muted">כל נתוני הטיול כטקסט. משנים רק אם יודעים מה עושים.</p>
          <textarea id="admin-data" rows="18" dir="ltr"></textarea>
          <label class="btn admin-file">📂 טעינה מקובץ<input type="file" accept=".json,application/json" id="admin-file" hidden></label>
        </details>
      </section>
      <button class="btn btn-wide" data-admin-save>💾 שמירה</button>
      <p id="admin-msg" class="muted"></p>`;
  }

  async function adminSave() {
    const msg = document.getElementById('admin-msg');
    try {
      const data = JSON.parse(document.getElementById('admin-data').value);
      const members = readMembers();
      if (!Object.keys(members).length) throw new Error('צריך לפחות משתמש אחד');
      await App.backend.save(data, members);
      msg.textContent = '✅ נשמר. כולם יראו את העדכון בפתיחה הבאה.';
    } catch (e) {
      msg.textContent = '❌ ' + e.message;
    }
  }

  // ---------- weather (Open-Meteo, no key; only within its 16-day window) ----------

  const WMO = (c) => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 82 ? '🌦️' : '⛈️';

  async function fillWeather() {
    for (const el of document.querySelectorAll('[data-weather]')) {
      const [date, placeKey] = el.dataset.weather.split('|');
      const ahead = App.daysBetween(App.fmtDate(new Date()), date);
      if (ahead < 0 || ahead > 15) continue;
      const p = App.place(placeKey);
      const key = `wx_${placeKey}_${date}`;
      let w = App.store.get(key, null);
      if (!w || Date.now() - w.t > 3 * 3600e3) {
        try {
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${date}&end_date=${date}`);
          const j = await r.json();
          w = { t: Date.now(), code: j.daily.weather_code[0], max: Math.round(j.daily.temperature_2m_max[0]), min: Math.round(j.daily.temperature_2m_min[0]), rain: j.daily.precipitation_probability_max[0] };
          App.store.set(key, w);
        } catch (e) { if (!w) continue; }
      }
      el.innerHTML = `<span class="wx-ico">${WMO(w.code)}</span> ${w.max}°/${w.min}° · 💧 ${w.rain ?? 0}% גשם`;
    }
  }

  // ---------- events ----------

  // What the browser reports about notifications, so a screenshot tells us why they fail.
  const pushDiagnostics = async (result) => {
    let query = '?';
    try { query = (await navigator.permissions.query({ name: 'notifications' })).state; } catch (e) { query = 'err'; }
    const ua = navigator.userAgent.match(/(Chrome|SamsungBrowser|Firefox|Version)\/[\d.]+/g) || [];
    const info = [
      'result=' + result, 'perm=' + Notification.permission, 'query=' + query,
      'secure=' + window.isSecureContext, 'proto=' + location.protocol,
      'standalone=' + matchMedia('(display-mode: standalone)').matches,
      'sw=' + !!(navigator.serviceWorker && navigator.serviceWorker.controller), 'push=' + ('PushManager' in window),
      'top=' + (window.top === window), ua.join(' '),
    ];
    return `<span class="diag" dir="ltr">${App.esc(info.join(' · '))}</span>`;
  };

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-install],[data-install-help],[data-dismiss],[data-push],[data-copy],[data-check],[data-done],[data-show-hotel],[data-close],[data-font],[data-signin],[data-signout],[data-admin-save],[data-fx],[data-list-edit],[data-list-add],[data-list-del],[data-member-add],[data-member-del],[data-member-confirm],.arrow.off');
    if (!t) return;
    if (t.matches('.arrow.off')) { e.preventDefault(); return; }
    if (t.hasAttribute('data-fx')) {
      document.body.insertAdjacentHTML('beforeend', App.fxModal());
      App.fitFxModal();
      document.getElementById('fx-php').focus();
    } else if (t.hasAttribute('data-install')) {
      App.promptInstall();
    } else if (t.hasAttribute('data-install-help')) {
      document.body.insertAdjacentHTML('beforeend', App.installHelpModal());
    } else if (t.dataset.dismiss) {
      App.store.set(t.dataset.dismiss, true); App.render();
    } else if (t.hasAttribute('data-push')) {
      t.disabled = true;
      try {
        const res = await App.backend.enablePush();
        if (res === 'granted') App.render();
        else document.getElementById('push-msg').innerHTML = res === 'denied'
          // Chrome answers "denied" without asking when the site or Chrome itself is blocked.
          ? 'הטלפון חוסם התראות מהאתר הזה. כדי לפתוח: לוחצים על הסמל שמשמאל לכתובת האתר ← הרשאות ← התראות ← לאפשר. אם זה לא עוזר: הגדרות הטלפון ← אפליקציות ← Chrome ← התראות ← לאפשר.'
          : 'חלון האישור נסגר בלי תשובה. לוחצים שוב ובוחרים "אישור".';
        if (res !== 'granted') document.getElementById('push-msg').insertAdjacentHTML('beforeend', await pushDiagnostics(res));
      } catch (err) {
        document.getElementById('push-msg').textContent = 'לא הצלחנו להפעיל התראות (' + (err.code || err.message) + ')';
        document.getElementById('push-msg').insertAdjacentHTML('beforeend', await pushDiagnostics('error'));
      }
      t.disabled = false;
    } else if (t.dataset.copy) {
      try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = '✅ הועתק'; } catch (err) { t.textContent = t.dataset.copy; }
      setTimeout(() => { t.textContent = '📋 העתק'; }, 2000);
    } else if (t.dataset.done) {
      e.preventDefault(); // the tick sits inside a card's fold header: don't open/close the card
      App.toggleDone(t.dataset.done); App.render();
    } else if (t.dataset.listEdit) {
      App.editList = App.editList === t.dataset.listEdit ? null : t.dataset.listEdit; App.render();
    } else if (t.dataset.listAdd) {
      addListItem(t.dataset.listAdd);
    } else if (t.dataset.listDel) {
      App.deleteItem(t.dataset.listDel, t.dataset.id); App.render();
    } else if (t.dataset.showHotel) {
      document.body.insertAdjacentHTML('beforeend', App.showHotelModal(App.hotelById(t.dataset.showHotel)));
    } else if (t.hasAttribute('data-close')) {
      if (e.target === t || t.tagName === 'BUTTON') document.querySelector('.modal')?.remove();
    } else if (t.dataset.font) {
      const step = Number(t.dataset.font);
      const size = step === 0 ? 16 : Math.min(24, Math.max(14, App.store.get('font2', 16) + step * 2));
      App.store.set('font2', size); document.documentElement.style.fontSize = size + 'px';
    } else if (t.hasAttribute('data-signin')) {
      try { await App.backend.signIn(); } catch (err) { document.getElementById('login-err').textContent = 'הכניסה לא הצליחה, נסו שוב (' + err.code + ')'; }
    } else if (t.hasAttribute('data-signout')) {
      e.preventDefault(); App.backend.signOut();
    } else if (t.hasAttribute('data-member-add')) {
      document.getElementById('admin-members').insertAdjacentHTML('beforeend', memberRow());
      document.querySelector('.member-row:last-child .m-email').focus();
    } else if (t.hasAttribute('data-member-del')) {
      pendingRow = t.closest('.member-row');
      const email = pendingRow.querySelector('.m-email').value.trim();
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal" data-close><div class="modal-box confirm-box" dir="rtl">
          <h2>בטוח?</h2>
          <p>להסיר את <bdi>${esc(email || 'המשתמש')}</bdi>${email ? '' : ' הריק'}? השינוי נשמר רק אחרי לחיצה על 💾 שמירה.</p>
          <div class="btn-row"><button class="btn btn-danger" data-member-confirm>🗑️ מחיקה</button><button class="btn" data-close>ביטול</button></div>
        </div></div>`);
    } else if (t.hasAttribute('data-member-confirm')) {
      pendingRow?.remove(); pendingRow = null;
      document.querySelector('.modal')?.remove();
    } else if (t.hasAttribute('data-admin-save')) {
      adminSave();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.check) App.toggleItem(t.dataset.check, t.dataset.id, t.checked);
  });

  // Add the typed item and keep the box open for the next one.
  function addListItem(key) {
    const input = document.getElementById('add-' + key);
    App.addItem(key, input.value);
    App.render();
    document.getElementById('add-' + key)?.focus();
  }
  document.addEventListener('input', (e) => { if (e.target.id === 'admin-data') showSummary(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.list-add input')) addListItem(e.target.id.slice(4));
  });

  // Admin: load a trip.json, or an import file shaped { members, data }.
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'admin-file' || !e.target.files[0]) return;
    try {
      const j = JSON.parse(await e.target.files[0].text());
      const data = j.data || j;
      document.getElementById('admin-data').value = JSON.stringify(data, null, 2);
      if (j.members) fillMembers(j.members);
      showSummary();
      document.getElementById('admin-msg').textContent = '📂 הקובץ נטען. בדקו ולחצו שמירה.';
    } catch (err) {
      document.getElementById('admin-msg').textContent = '❌ הקובץ לא תקין: ' + err.message;
    }
  });

  // Live "now there / now at home" line on the info screen.
  App.clocks = () => {
    const t = (tz) => new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    return `עכשיו בפיליפינים <b><bdi>${t('Asia/Manila')}</bdi></b> · בישראל <b><bdi>${t(App.trip.homeTz)}</bdi></b>`;
  };
  setInterval(() => document.querySelectorAll('[data-clocks]').forEach((el) => { el.innerHTML = App.clocks(); }), 30 * 1000);

  window.addEventListener('hashchange', () => { App.render(); window.scrollTo(0, 0); });

  // Swipe left/right on a day to move between days (RTL: swipe right = next day).
  let sx = null, sy = null;
  document.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (sx === null || !document.querySelector('.day-nav')) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const arrows = document.querySelectorAll('.day-nav .arrow');
    const target = dx > 0 ? arrows[1] : arrows[0]; // swipe right → next (left arrow)
    if (target && !target.classList.contains('off')) location.hash = target.getAttribute('href');
  }, { passive: true });

  // ---------- new version available ----------

  // Pages stamps index.html and version.json with the commit; a mismatch means a newer version is live.
  const myVersion = document.querySelector('meta[name="app-version"]')?.content || 'dev';
  async function checkForUpdate() {
    if (myVersion === 'dev' || document.getElementById('update-bar')) return;
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      const { v } = await res.json();
      if (v && v !== myVersion) {
        document.body.insertAdjacentHTML('beforeend', `
          <div id="update-bar" class="update-bar" role="status">
            <span>✨ גרסה חדשה מוכנה</span>
            <button class="btn" onclick="location.reload()">🔄 עדכון</button>
          </div>`);
      }
    } catch (e) { /* offline: try again later */ }
  }
  setTimeout(checkForUpdate, 3000);
  setInterval(checkForUpdate, 20 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });

  // ---------- boot ----------

  document.documentElement.style.fontSize = App.store.get('font2', 16) + 'px';
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.TRIP_DATA) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  App.backend.start();
})(window.App);
