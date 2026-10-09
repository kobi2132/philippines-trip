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
    fillWeather();
  };

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

  function adminView(empty) {
    setTimeout(async () => {
      const cur = await App.backend.loadForAdmin().catch(() => null);
      document.getElementById('admin-data').value = JSON.stringify(cur ? cur.data : App.trip || {}, null, 2);
      document.getElementById('admin-members').value = JSON.stringify(cur ? cur.members : { [App.user.email]: 'admin' }, null, 2);
    });
    return `<h1 class="page-h">⚙️ ניהול נתונים</h1>
      ${empty ? '<p>הטיול עוד לא קיים במסד הנתונים. הדביקו את trip.json ושמרו.</p>' : ''}
      <p class="muted">משתמשים: admin (הכל), traveler (צפייה + סימונים), viewer (צפייה בלבד).</p>
      <label class="admin-label">משתמשים<textarea id="admin-members" rows="6" dir="ltr"></textarea></label>
      <label class="admin-label">נתוני הטיול (trip.json)<textarea id="admin-data" rows="18" dir="ltr"></textarea></label>
      <button class="btn btn-wide" data-admin-save>💾 שמירה</button>
      <p id="admin-msg" class="muted"></p>`;
  }

  async function adminSave() {
    const msg = document.getElementById('admin-msg');
    try {
      const data = JSON.parse(document.getElementById('admin-data').value);
      const members = JSON.parse(document.getElementById('admin-members').value);
      const lower = Object.fromEntries(Object.entries(members).map(([k, v]) => [k.trim().toLowerCase(), v]));
      await App.backend.save(data, lower);
      msg.textContent = '✅ נשמר. ההורים יראו את העדכון בפתיחה הבאה.';
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

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-copy],[data-check],[data-done],[data-show-hotel],[data-close],[data-font],[data-signin],[data-signout],[data-admin-save],.arrow.off');
    if (!t) return;
    if (t.matches('.arrow.off')) { e.preventDefault(); return; }
    if (t.dataset.copy) {
      try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = '✅ הועתק'; } catch (err) { t.textContent = t.dataset.copy; }
      setTimeout(() => { t.textContent = '📋 העתק'; }, 2000);
    } else if (t.dataset.done) {
      const done = App.store.get('done', {}); done[t.dataset.done] = !done[t.dataset.done]; App.store.set('done', done); App.render();
    } else if (t.dataset.showHotel) {
      document.body.insertAdjacentHTML('beforeend', App.showHotelModal(App.hotelById(t.dataset.showHotel)));
    } else if (t.hasAttribute('data-close')) {
      if (e.target === t || t.tagName === 'BUTTON') document.querySelector('.modal')?.remove();
    } else if (t.dataset.font) {
      const size = Math.min(26, Math.max(16, (App.store.get('font', 19)) + Number(t.dataset.font) * 2));
      App.store.set('font', size); document.documentElement.style.fontSize = size + 'px';
    } else if (t.hasAttribute('data-signin')) {
      try { await App.backend.signIn(); } catch (err) { document.getElementById('login-err').textContent = 'הכניסה לא הצליחה, נסו שוב (' + err.code + ')'; }
    } else if (t.hasAttribute('data-signout')) {
      e.preventDefault(); App.backend.signOut();
    } else if (t.hasAttribute('data-admin-save')) {
      adminSave();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.check) {
      const key = 'check_' + t.dataset.check;
      const s = App.store.get(key, {}); s[t.dataset.i] = t.checked; App.store.set(key, s);
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'php') {
      document.getElementById('ils').textContent = Math.round((Number(e.target.value) || 0) * App.trip.info.currency.approxIls);
    }
  });

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

  // ---------- boot ----------

  document.documentElement.style.fontSize = App.store.get('font', 19) + 'px';
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.TRIP_DATA) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  App.backend.start();
})(window.App);
