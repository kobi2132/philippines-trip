// Screens. Each view returns an HTML string; App.render puts it on the page.
(function (App) {
  const { esc } = App;

  // ---------- small pieces ----------

  const copyBtn = (text) => `<button class="copy" data-copy="${esc(text)}" aria-label="העתקה">📋 העתק</button>`;

  const estimatedMark = (on) => on ? '<span class="est" title="שעה משוערת, תתעדכן">משוער</span>' : '';

  const STATUS = {
    scheduled: { label: 'בזמן', cls: 'ok', icon: '✅' },
    ontime: { label: 'בזמן', cls: 'ok', icon: '✅' },
    delayed: { label: 'עיכוב', cls: 'warn', icon: '⏰' },
    boarding: { label: 'עלייה למטוס', cls: 'ok', icon: '🚶' },
    departed: { label: 'המריאה', cls: 'ok', icon: '🛫' },
    landed: { label: 'נחתה', cls: 'ok', icon: '🛬' },
    cancelled: { label: 'בוטלה', cls: 'bad', icon: '❌' },
  };

  const minutesAgo = (iso) => {
    const m = Math.round((App.now() - new Date(iso)) / 60000);
    return m < 1 ? 'עכשיו' : m < 60 ? `לפני ${m} דק'` : `לפני ${Math.round(m / 60)} שע'`;
  };

  const statusBar = (leg) => {
    const s = App.legStatus(leg);
    if (!s) return '';
    const st = STATUS[s.status] || { label: s.status, cls: 'ok', icon: 'ℹ️' };
    const changed = s.depLocal && s.depLocal !== App.localTime(leg.dep);
    return `<div class="status status-${st.cls}">
      <span>${st.icon} ${esc(st.label)}${changed ? ` · המראה חדשה <b>${esc(s.depLocal)}</b> <s>${App.localTime(leg.dep)}</s>` : ''}</span>
      ${s.updatedAt ? `<small>עודכן ${minutesAgo(s.updatedAt)}</small>` : ''}
    </div>`;
  };

  const airportLine = (ap, label) => `
    <div class="ap">
      <div class="ap-code">${esc(ap.code)}</div>
      <div class="ap-name">${esc(ap.name)}</div>
      <div class="ap-term">${ap.terminal ? `טרמינל ${esc(ap.terminal)}` : label}</div>
    </div>`;

  const legBlock = (leg) => {
    const s = App.legStatus(leg) || {};
    const nextDay = App.localDate(leg.arr) !== App.localDate(leg.dep);
    return `
    <div class="leg">
      ${statusBar(leg)}
      <div class="leg-head"><span class="fno">✈️ ${esc(leg.flightNo)}${leg.flightNoEstimated ? ' ' + estimatedMark(true) : ''}</span><span class="airline">${esc(leg.airline)}</span></div>
      <div class="leg-route">
        <div class="leg-end">
          <div class="time">${App.localTime(leg.dep)}</div>
          ${airportLine(leg.from, '')}
        </div>
        <div class="leg-mid"><span>${App.duration(leg.dep, leg.arr)}</span><div class="dash"></div></div>
        <div class="leg-end">
          <div class="time">${App.localTime(leg.arr)}${nextDay ? '<sup>+1</sup>' : ''} ${estimatedMark(leg.arrEstimated)}</div>
          ${airportLine(leg.to, '')}
        </div>
      </div>
      <div class="facts">
        <div class="fact"><span>🚪 שער</span><b>${s.gate ? esc(s.gate) : 'יפורסם בשדה'}</b></div>
        <div class="fact"><span>🎫 בורדינג</span><b>${s.boarding ? esc(s.boarding) : App.minusMinutes(App.localTime(leg.dep), 45) + ' בערך'}</b></div>
        <div class="fact"><span>🔒 נסגר</span><b>${App.minusMinutes(App.localTime(leg.dep), 20)} בערך</b></div>
      </div>
      <a class="link-small" href="https://www.flightradar24.com/data/flights/${esc(leg.flightNo.toLowerCase())}" target="_blank" rel="noopener">📡 מעקב חי אחרי הטיסה</a>
    </div>`;
  };

  // Online check-in is done with the airline of the first flight in the booking.
  const CHECKIN = {
    FZ: ['flydubai', 'https://www.flydubai.com/en/flying-with-us/check-in/online-check-in/'],
    PR: ['Philippine Airlines', 'https://www.philippineairlines.com/ph/en/check-in-online.html'],
    '5J': ['Cebu Pacific', 'https://book.cebupacificair.com/Checkin/Retrieve'],
    DG: ['Cebu Pacific', 'https://book.cebupacificair.com/Checkin/Retrieve'],
  };
  const checkinBtn = (f) => {
    const c = CHECKIN[f.legs[0].flightNo.slice(0, 2)];
    return c ? `<a class="copy checkin" href="${c[1]}" target="_blank" rel="noopener" aria-label="צ'ק אין באתר ${c[0]}">✅ צ'ק אין</a>` : '';
  };

  const flightCard = (f, opts = {}) => {
    const legs = f.legs.map(legBlock);
    const conn = f.connection ? `
      <div class="connection">
        <div class="conn-title">🔁 קונקשן ב${esc(f.connection.airport)} · ${esc(f.connection.duration)}</div>
        <div class="conn-term ${f.connection.terminalChange ? 'warn' : ''}">${f.connection.terminalChange ? '⚠️ צריך להחליף טרמינל' : '👍 אותו טרמינל'}</div>
        <p>${esc(f.connection.note)}</p>
      </div>` : '';
    const body = legs.length > 1 ? `${legs[0]}${conn}${legs.slice(1).join('')}` : legs.join('');
    return `
    <section class="card card-flight">
      <div class="card-title"><span class="ico ico-blue">✈️</span><h3>${esc(f.title)}</h3></div>
      ${opts.showAirportBy ? `<div class="big-callout">🕐 להיות בשדה התעופה עד <b>${App.airportBy(f)}</b><small>${f.international ? '3 שעות לפני טיסה בינלאומית' : 'שעתיים לפני טיסת פנים'}</small></div>` : ''}
      ${body}
      ${f.arrivalTransfer ? `<p class="note">🔀 ${esc(f.arrivalTransfer)}</p>` : ''}
      <details class="more"><summary>🧳 כבודה</summary><p>${esc(f.baggage)}</p><p>${esc(f.carryOn)}</p></details>
      <div class="booking booking-flight"><div class="booking-id"><span>צ'ק אין ומספר הזמנה</span><b class="code">${esc(f.booking)}</b></div><div class="booking-btns">${checkinBtn(f)}${copyBtn(f.booking)}</div></div>
    </section>`;
  };

  const TRANSFER_ICONS = { taxi: ['🚕', 'ico-purple'], ferry: ['⛴️', 'ico-teal'], bus: ['🚌', 'ico-purple'] };

  const transferCard = (t) => {
    const [icon, cls] = TRANSFER_ICONS[t.type] || ['🚗', 'ico-purple'];
    const hotel = t.toHotel ? App.hotelById(t.toHotel) : null;
    return `
    <section class="card">
      <div class="card-title"><span class="ico ${cls}">${icon}</span><h3>${esc(t.title)}</h3></div>
      ${t.time ? `<div class="big-callout">${esc(t.timeLabel || 'שעה')} <b>${esc(t.time)}</b></div>` : ''}
      ${t.duration ? `<p>⏱️ ${esc(t.duration)}</p>` : ''}
      <p>${esc(t.details)}</p>
      ${hotel ? `<p>📍 יעד: <b>${esc(hotel.name)}</b>, ${esc(hotel.address)}</p><button class="btn btn-show" data-show-hotel="${hotel.id}">🪧 הראה לנהג</button>` : ''}
      ${t.grab ? '<p class="note">🟢 אפשר להזמין מונית באפליקציית Grab</p>' : ''}
      ${(t.links || []).map((l) => `<a class="link-small" href="${esc(l.url)}" target="_blank" rel="noopener">🔗 ${esc(l.label)}</a>`).join('')}
      ${App.navButtons(t.navTo || (hotel && `${hotel.name}, ${hotel.address}`))}
    </section>`;
  };

  const hotelCard = (h, mode) => {
    const p = App.place(h.place);
    const tm = App.hotelTimes(h);
    const nights = App.daysBetween(h.checkIn, h.checkOut);
    const banner = mode === 'checkout'
      ? `<div class="big-callout warn">🧳 צ'ק אאוט היום עד <b>${tm.checkOutTime}</b> ${estimatedMark(tm.estimated)}</div>`
      : mode === 'checkin' ? `<div class="big-callout">🛎️ צ'ק אין מ-<b>${tm.checkInTime}</b> ${estimatedMark(tm.estimated)}</div>` : '';
    return `
    <section class="card card-hotel" style="--accent:${p.color}">
      <div class="card-title"><span class="ico ico-orange">🏨</span><h3>${esc(h.name)}</h3></div>
      ${mode === 'tonight' ? '<div class="tag">🌙 כאן ישנים הלילה</div>' : ''}
      ${banner}
      <p class="muted">📍 ${esc(h.city)} · ${esc(h.address)}</p>
      <div class="facts">
        <div class="fact"><span>📅 תאריכים</span><b>${App.range(h.checkIn, h.checkOut)}</b><small>${nights} ${nights === 1 ? 'לילה' : 'לילות'}</small></div>
        <div class="fact"><span>🛎️ צ'ק אין</span><b>${tm.checkInTime}</b></div>
        <div class="fact"><span>🧳 צ'ק אאוט</span><b>${tm.checkOutTime}</b></div>
      </div>
      <div class="booking"><span>מספר הזמנה</span>${/\d/.test(h.booking) ? `<b class="code">${esc(h.booking)}</b>${copyBtn(h.booking)}` : `<b>${esc(h.booking)}</b>`}</div>
      <p>🛏️ ${esc(h.room)}</p>
      ${h.phone ? `<a class="btn" href="tel:${esc(h.phone)}">📞 התקשר למלון</a>` : ''}
      <button class="btn btn-show" data-show-hotel="${h.id}">🪧 הראה לנהג</button>
      ${App.navButtons(`${h.name}, ${h.address}`)}
    </section>`;
  };

  const attractionCard = (a, compact) => {
    const t = a.tags || {};
    const done = (App.store.get('done', {}))[a.id];
    return `
    <section class="card card-attr ${done ? 'is-done' : ''}">
      <div class="card-title"><span class="ico ico-green">${t.water ? '🏝️' : '🧭'}</span><h3>${esc(a.name)}</h3>${a.mustSee ? '<span class="must">⭐ חובה</span>' : ''}</div>
      <div class="en">${esc(a.en)}</div>
      ${compact ? '' : `<p>${esc(a.desc)}</p>`}
      <div class="chips">
        ${t.duration ? `<span class="chip">⏱️ ${esc(t.duration)}</span>` : ''}
        ${t.difficulty ? `<span class="chip">💪 ${esc(t.difficulty)}</span>` : ''}
        ${t.water ? '<span class="chip">🏊 מים</span>' : ''}
      </div>
      ${a.agentNote ? `<p class="agent">💬 עדי: "${esc(a.agentNote)}"</p>` : ''}
      ${compact ? `<a class="link-small" href="#/attractions/${a.place}">לפרטים ←</a>` : `
        ${App.navButtons(a.mapQuery)}
        ${App.canEdit() ? `<button class="btn btn-done" data-done="${a.id}">${done ? '✅ עשינו!' : '☐ סמנו שעשינו'}</button>` : ''}`}
    </section>`;
  };

  const checklist = (key, items) => {
    const state = App.store.get('check_' + key, {});
    const disabled = App.canEdit() ? '' : 'disabled';
    return `<ul class="checklist">${items.map((it, i) => `
      <li><label><input type="checkbox" data-check="${key}" data-i="${i}" ${state[i] ? 'checked' : ''} ${disabled}><span>${esc(it)}</span></label></li>`).join('')}</ul>`;
  };

  const weatherSlot = (date, placeKey) => placeKey ? `<div class="weather" data-weather="${date}|${placeKey}"></div>` : '';

  const previewBanner = () => App.isPreview()
    ? `<div class="preview-banner">👁️ מצב תצוגה: "היום" הוא ${App.shortDate(App.today())} <a href="?date=real">חזרה לתאריך האמיתי</a></div>` : '';

  const viewerBanner = () => App.role === 'viewer' ? '<div class="preview-banner">👀 מצב צפייה</div>' : '';

  const pushCard = (compact) => {
    if (!App.pushAvailable()) return '';
    if (App.pushOn()) return compact ? '' : '<p>✅ ההתראות פעילות בטלפון הזה.</p>';
    if (Notification.permission === 'denied') return compact ? '' : '<p class="muted">ההתראות חסומות. אפשר להפעיל אותן בהגדרות של Chrome לאתר הזה.</p>';
    if (compact && App.store.get('push_dismissed', false)) return '';
    return `<div class="push-card">${compact ? '<button class="card-x" data-dismiss="push_dismissed" aria-label="סגירה">✕</button>' : ''}<p>🔔 ${compact ? 'רוצים תזכורת כל בוקר ועדכונים על הטיסות?' : 'תזכורת כל בוקר, ערב לפני טיסה, והודעה מיד כשטיסה משתנה.'}</p>
      <button class="btn btn-wide" data-push>🔔 הפעלת התראות</button><p class="muted" id="push-msg"></p></div>`;
  };

  const noteBanner = () => App.trip.updatedNote ? `<div class="msg-banner">💌 ${esc(App.trip.updatedNote)}</div>` : '';

  // ---------- screens ----------

  const dayNav = (date) => {
    const T = App.trip;
    const first = App.addDays(T.start, -1), last = T.end;
    const prev = date > first ? App.addDays(date, -1) : null;
    const next = date < last ? App.addDays(date, 1) : null;
    return `
    <nav class="day-nav">
      <a class="arrow ${prev ? '' : 'off'}" href="${prev ? '#/day/' + prev : '#'}" aria-label="יום קודם">→</a>
      ${date === App.today()
        ? '<span class="today-btn is-today">היום 📍</span>'
        : '<a class="today-btn" href="#/today">↩️ חזרה להיום</a>'}
      <a class="arrow ${next ? '' : 'off'}" href="${next ? '#/day/' + next : '#'}" aria-label="יום הבא">←</a>
    </nav>`;
  };

  const dayView = (date) => {
    const T = App.trip;
    const info = App.dayInfo(date);
    const p = info.place ? App.place(info.place) : null;
    const isToday = date === App.today();
    const n = App.dayNumber(date);
    const flights = App.flightsOn(date);
    const transfers = App.transfersOn(date);
    const out = App.hotelCheckingOut(date);
    const tonight = App.hotelForNight(date);
    const attrs = (info.attractions || []).map(App.attraction).filter(Boolean);

    let html = '';
    html += `
      <header class="day-head" style="--accent:${p ? p.color : '#2563eb'}">
        <div class="day-count">${n >= 1 && n <= App.totalDays() ? `יום ${n} מתוך ${App.totalDays()}` : ''}</div>
        <h1>${p ? esc(p.name) : ''}${info.title ? ` <span>· ${esc(info.title)}</span>` : ''}</h1>
        <div class="day-date">${App.longDate(date)}</div>
        ${weatherSlot(date, info.place)}
      </header>
      <div class="day-mini" style="--accent:${p ? p.color : '#2563eb'}" aria-hidden="true"><div>
        <b>${p ? esc(p.name) : ''}</b>
        <span><bdi>${App.weekday(date)} ${App.shortDate(date)}</bdi>${n >= 1 && n <= App.totalDays() ? ` · יום ${n}/${App.totalDays()}` : ''}</span>
      </div></div>`;
    html += dayNav(date);
    if (info.prep) return html + eveContent();

    // Order: leave hotel → get to airport → fly → transfers → tonight's hotel → things to do
    if (out && (!tonight || out.id !== tonight.id)) html += hotelCard(out, 'checkout');
    const pre = transfers.filter((t) => t.navTo && !t.toHotel);
    const post = transfers.filter((t) => !(t.navTo && !t.toHotel));
    pre.forEach((t) => { html += transferCard(t); });
    flights.forEach((f) => { html += flightCard(f, { showAirportBy: true }); });
    post.forEach((t) => { html += transferCard(t); });
    if (tonight) html += hotelCard(tonight, tonight.checkIn === date ? 'checkin' : 'tonight');
    if (attrs.length) {
      html += `<h2 class="section-h">🌴 מה אפשר לעשות היום</h2>`;
      attrs.forEach((a) => { html += attractionCard(a, true); });
    }
    (info.tips || []).forEach((tip) => { html += `<div class="tip">💡 ${esc(tip)}</div>`; });
    if (date === T.end) html += afterContent();
    return html;
  };

  const eveContent = () => {
    const f = App.trip.flights[0];
    return `
      <section class="card hero-card">
        <h2>מתרגשים? 🎒 הגיע הזמן לארוז!</h2>
        <div class="big-callout">🕐 מחר צריך להיות בנתב"ג עד <b>${App.airportBy(f)}</b></div>
      </section>
      <section class="card"><div class="card-title"><span class="ico ico-orange">🧳</span><h3>רשימת אריזה</h3></div>${checklist('packing', App.trip.checklists.packing)}</section>
      ${flightCard(f)}`;
  };

  const afterContent = () => `
    <section class="card hero-card">
      <h2>ברוכים השבים! 🏡</h2>
      <p>${App.totalDays()} ימים, ${App.trip.flights.reduce((s, f) => s + f.legs.length, 0)} טיסות, ${App.trip.hotels.length} מלונות. איזה טיול!</p>
    </section>`;

  const beforeView = () => {
    const T = App.trip;
    const days = App.daysBetween(App.today(), T.start);
    return `
      <header class="hero">
        <div class="hero-emoji">🌴✈️🏝️</div>
        <h1>${esc(T.travelers)}</h1>
        <p>${esc(T.title)} בעוד</p>
        <div class="countdown"><b>${days}</b><span>${days === 1 ? 'יום' : 'ימים'}</span></div>
        <p class="muted">המראה ב${App.longDate(T.start)}, ${App.localTime(T.flights[0].legs[0].dep)}</p>
      </header>
      <a class="btn btn-wide" href="#/day/${T.start}">👀 להציץ ביום הראשון</a>
      <section class="card"><div class="card-title"><span class="ico ico-blue">📝</span><h3>מה עוד צריך לעשות לפני הטיול</h3></div>${checklist('before', T.checklists.before)}</section>`;
  };

  const todayView = () => {
    const ph = App.phase();
    const T = App.trip;
    if (ph === 'before') return App.installCard(true) + pushCard(true) + beforeView();
    if (ph === 'after') return `${afterContent()}<a class="btn btn-wide" href="#/day/${T.end}">לדפדף בימי הטיול</a>`;
    return App.installCard(true) + pushCard(true) + dayView(App.today());
  };

  // Collapsed card for the flights / hotels lists: a short summary that opens to the full card.
  // Only one card per list is open at a time (main.js closes the others); the one the user
  // opened last is remembered across re-renders, otherwise `openByDefault` is open.
  App.openFold = App.openFold || {};
  const fold = (group, id, openByDefault, summary, full, style = '') => {
    const open = group in App.openFold ? App.openFold[group] === id : openByDefault;
    return `<details class="card fold" data-fold="${group}" data-id="${esc(id)}" ${open ? 'open' : ''} ${style}>
      <summary>${summary}<span class="fold-btn"></span></summary>
      ${full}
    </details>`;
  };

  const flightSummary = (f) => {
    const first = f.legs[0], last = f.legs[f.legs.length - 1];
    const nextDay = App.localDate(last.arr) !== App.localDate(first.dep);
    const problem = f.legs.map(App.legStatus).find((s) => s && (s.status === 'delayed' || s.status === 'cancelled'));
    return `<div class="card-title"><span class="ico ico-blue">✈️</span><h3>${esc(f.title)}</h3></div>
      <div class="fold-line"><span>📅 ${App.weekday(f.date)} <bdi>${App.shortDate(f.date)}</bdi></span>
        <span>🛫 <b>${App.localTime(first.dep)}</b></span>
        <span>🛬 <b>${App.localTime(last.arr)}</b>${nextDay ? '<sup>+1</sup>' : ''}</span></div>
      ${problem ? `<div class="fold-alert">${problem.status === 'cancelled' ? '❌ בוטלה' : '⏰ יש עיכוב'}, פתחו לפרטים</div>` : ''}`;
  };

  const hotelSummary = (h) => {
    const nights = App.daysBetween(h.checkIn, h.checkOut);
    return `<div class="card-title"><span class="ico ico-orange">🏨</span><h3>${esc(h.name)}</h3></div>
      <div class="fold-line"><span>📍 ${esc(h.city)}</span><span>📅 ${App.range(h.checkIn, h.checkOut)}</span>
        <span>🌙 ${nights} ${nights === 1 ? 'לילה' : 'לילות'}</span></div>`;
  };

  const flightsView = () => {
    const next = App.nextFlight();
    return `<h1 class="page-h">✈️ טיסות</h1>
      ${App.trip.flights.map((f) => {
        const isNext = next && next.id === f.id;
        return `
        <div class="list-date ${isNext ? 'is-next' : ''} ${App.localDate(f.legs[f.legs.length - 1].arr) < App.today() ? 'is-past' : ''}">
          ${isNext ? '<span class="tag">הטיסה הבאה</span>' : ''}
          ${fold('flights', f.id, isNext, flightSummary(f), flightCard(f, { showAirportBy: true }))}
        </div>`;
      }).join('')}`;
  };

  const hotelsView = () => {
    const tonight = App.hotelForNight(App.today());
    // Default open: tonight's hotel, or the next one before the trip.
    const current = tonight || App.trip.hotels.find((h) => h.checkOut >= App.today());
    return `<h1 class="page-h">🏨 מלונות</h1>
      ${App.trip.hotels.map((h) => `<div class="${h.checkOut < App.today() ? 'is-past' : ''}">${fold('hotels', h.id, current && current.id === h.id,
        hotelSummary(h), hotelCard(h, tonight && tonight.id === h.id ? 'tonight' : ''), `style="--accent:${App.place(h.place).color}"`)}</div>`).join('')}
      ${App.trip.hotelDefaults.timesEstimated ? '<p class="muted center">שעות צ\'ק אין ואאוט הן השעות המקובלות ויעודכנו לפי המלון.</p>' : ''}`;
  };

  const attractionsView = (placeKey) => {
    const T = App.trip;
    const order = [...new Set(T.attractions.map((a) => a.place))];
    const current = App.dayInfo(App.today()).place;
    const sel = placeKey || (order.includes(current) ? current : order[0]);
    return `<h1 class="page-h">🌴 אטרקציות</h1>
      <div class="tabs">${order.map((k) => `<a class="tab ${k === sel ? 'on' : ''}" href="#/attractions/${k}" style="--accent:${App.place(k).color}">${esc(App.place(k).name)}</a>`).join('')}</div>
      ${T.attractions.filter((a) => a.place === sel).map((a) => attractionCard(a)).join('')}`;
  };

  const routeView = () => {
    const T = App.trip;
    // Stays = consecutive days in the same place.
    const stays = [];
    T.days.filter((d) => !d.prep).forEach((d) => {
      const last = stays[stays.length - 1];
      if (last && last.place === d.place) { last.to = d.date; last.n++; } else stays.push({ place: d.place, from: d.date, to: d.date, n: 1 });
    });
    const today = App.today();
    return `<h1 class="page-h">🗺️ המסלול</h1>
      ${App.routeMap()}
      <ol class="timeline">${stays.map((s, i) => {
        const p = App.place(s.place);
        const here = today >= s.from && today <= s.to;
        return `<li class="${here ? 'here' : ''} ${s.to < today ? 'past' : ''}" style="--accent:${p.color}">
          <a href="#/day/${s.from}">
            <span class="dot">${i + 1}</span>
            <span class="tl-body"><b>${esc(p.name)}</b> <small>${esc(p.en)}</small><br>
            <span class="muted">${s.to !== s.from ? App.range(s.from, s.to) : App.shortDate(s.from)} · ${s.n} ${s.n === 1 ? 'יום' : 'ימים'}</span></span>
            ${here ? '<span class="tag">📍 אתם כאן</span>' : ''}
          </a></li>`;
      }).join('')}</ol>`;
  };

  const infoView = () => {
    const T = App.trip, I = T.info;
    const wa = T.contact.whatsapp ? `https://wa.me/${T.contact.whatsapp.replace(/\D/g, '')}` : null;
    return `<h1 class="page-h">ℹ️ מידע חשוב</h1>
      ${wa ? `<a class="btn btn-wide btn-wa" href="${wa}" target="_blank" rel="noopener">💬 וואטסאפ ל${esc(T.contact.name)}</a>` : ''}
      ${App.canInstall() ? `<section class="card"><div class="card-title"><span class="ico ico-teal">📲</span><h3>התקנה במסך הבית</h3></div>${App.installCard(false)}</section>` : ''}
      ${App.pushAvailable() ? `<section class="card"><div class="card-title"><span class="ico ico-orange">🔔</span><h3>התראות</h3></div>${pushCard(false)}</section>` : ''}
      <section class="card"><div class="card-title"><span class="ico ico-red">🆘</span><h3>חירום</h3></div>
        <a class="btn" href="tel:${esc(I.emergencyPhone)}">📞 חירום בפיליפינים: ${esc(I.emergencyPhone)}</a>
        <a class="link-small" href="${esc(I.embassyUrl)}" target="_blank" rel="noopener">🇮🇱 שגרירות ישראל במנילה</a></section>
      <section class="card"><div class="card-title"><span class="ico ico-blue">🛡️</span><h3>ביטוח</h3></div>
        ${I.insurance.company ? `<p><b>${esc(I.insurance.company)}</b></p><div class="booking"><span>פוליסה</span><b class="code">${esc(I.insurance.policy)}</b>${copyBtn(I.insurance.policy)}</div>${I.insurance.phone ? `<a class="btn" href="tel:${esc(I.insurance.phone)}">📞 מוקד הביטוח</a>` : ''}` : `<p class="muted">${esc(I.insurance.note)}</p>`}</section>
      <section class="card"><div class="card-title"><span class="ico ico-green">💵</span><h3>כסף</h3></div>
        <p>המטבע: ${esc(I.currency.name)} (${esc(I.currency.code)})</p>
        <label class="calc">💱 <input type="number" inputmode="decimal" id="php" placeholder="פזו"> פזו ≈ <b id="ils">0</b> ₪</label>
        <p class="muted">שער משוער: 100 פזו ≈ ${Math.round(I.currency.approxIls * 100)} ₪</p></section>
      <section class="card"><div class="card-title"><span class="ico ico-purple">🕐</span><h3>שעון ושקעים</h3></div>
        <p>${esc(I.timeDiff)}</p><p>🔌 ${esc(I.plug)}</p></section>
      <section class="card"><div class="card-title"><span class="ico ico-blue">📝</span><h3>לפני הטיול</h3></div>${checklist('before', T.checklists.before)}</section>
      <section class="card"><div class="card-title"><span class="ico ico-orange">🧳</span><h3>רשימת אריזה</h3></div>${checklist('packing', T.checklists.packing)}</section>
      <div class="text-size"><span>גודל טקסט</span><button data-font="-1">א-</button><button data-font="1">א+</button><button class="font-reset" data-font="0">ברירת מחדל</button></div>
      ${App.user ? `<p class="muted center">מחוברים בתור ${esc(App.user.email)} · <a href="#" data-signout>התנתקות</a></p>` : ''}
      ${App.role === 'admin' ? '<a class="btn btn-wide" href="#/admin">⚙️ ניהול נתונים</a>' : ''}`;
  };

  const showHotelModal = (h) => `
    <div class="modal" data-close>
      <div class="modal-box">
        <p class="muted">Please take us to:</p>
        <div class="driver-name">${esc(h.name)}</div>
        <div class="driver-addr">${esc(h.address)}</div>
        <button class="btn btn-wide" data-close>סגירה</button>
      </div>
    </div>`;

  Object.assign(App.views = {}, {
    today: todayView, day: dayView, flights: flightsView, hotels: hotelsView,
    attractions: attractionsView, route: routeView, info: infoView,
  });
  Object.assign(App, { showHotelModal, previewBanner, viewerBanner, noteBanner });
})(window.App);
