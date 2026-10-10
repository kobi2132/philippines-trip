// A printable summary of the whole trip (admin → "ייצוא ל-PDF"): the browser's print dialog
// saves it as a PDF. Short tables, one topic per section, so it reads well on paper.
(function (App) {
  const esc = (s) => App.esc(s);
  const d = (s) => `<bdi>${App.shortDate(s)}</bdi>`;
  const t = (iso) => `<bdi>${App.localTime(iso)}</bdi>`;
  const ltr = (s) => s ? `<bdi dir="ltr">${esc(s)}</bdi>` : '';
  const tel = (s) => s ? `<bdi dir="ltr" class="p-nowrap">${esc(s)}</bdi>` : '';

  const section = (title, body) => `<section class="p-sec"><h2>${title}</h2>${body}</section>`;
  const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  const legLine = (l) => `${esc(l.from.city)} ← ${esc(l.to.city)}`;
  const airport = (a) => `${esc(a.name)}${a.terminal ? ` <span class="p-muted">טרמינל ${esc(a.terminal)}</span>` : ''}`;

  const flights = (T) => section('✈️ טיסות', table(['תאריך', 'טיסה', 'יוצאים', 'נוחתים', 'הזמנה'],
    T.flights.flatMap((f) => f.legs.map((l, i) => [
      `${d(App.localDate(l.dep))}<br><span class="p-muted">${App.weekday(App.localDate(l.dep))}</span>`,
      `<b>${ltr(l.flightNo)}</b><br><span class="p-muted">${esc(l.airline)}</span>`,
      `<b>${t(l.dep)}</b> ${airport(l.from)}`,
      `<b>${t(l.arr)}</b>${App.localDate(l.arr) !== App.localDate(l.dep) ? ' <span class="p-muted">(+1)</span>' : ''} ${airport(l.to)}`,
      i === 0 ? `<b>${ltr(f.booking)}</b>` : '<span class="p-muted">אותה הזמנה</span>',
    ])))
    + `<p class="p-note">🧳 כבודה: בטיסות הבינלאומיות ${esc(T.flights[0].baggage)}. בטיסות הפנים ${esc((T.flights.find((f) => !f.international) || {}).baggage || '')}. להיות בשדה 3 שעות לפני טיסה בינלאומית ושעתיים לפני טיסת פנים.</p>`
    + T.flights.filter((f) => f.connection).map((f) => `<p class="p-note">🔁 קונקשן ב${esc(f.connection.airport)} (${esc(f.connection.duration)}): ${esc(f.connection.note)}</p>`).join(''));

  const hotels = (T) => section('🏨 מלונות', table(['תאריכים', 'מלון וכתובת', 'טלפון', 'צ\'ק אין / אאוט', 'הזמנה'],
    T.hotels.map((h) => {
      const tm = App.hotelTimes(h);
      const nights = App.daysBetween(h.checkIn, h.checkOut);
      return [
        `${d(h.checkIn)}–${d(h.checkOut)}<br><span class="p-muted">${nights} ${nights === 1 ? 'לילה' : 'לילות'}</span>`,
        `<b>${ltr(h.name)}</b><br>${ltr(h.address)}`,
        `${h.whatsapp ? `וואטסאפ<br>${tel(h.whatsapp)}` : ''}${h.phone && h.phone !== h.whatsapp ? `<br>טלפון<br>${tel(h.phone)}` : ''}`,
        `אין <b><bdi>${tm.checkInTime}</bdi></b><br>אאוט <b><bdi>${tm.checkOutTime}</bdi></b>`,
        `<b>${ltr(h.booking)}</b><br><span class="p-muted">${ltr(h.room)}</span>`,
      ];
    })));

  const transfers = (T) => section('🚕 הסעות ומעבורות', table(['תאריך', 'מה', 'איך'],
    T.transfers.map((x) => [d(x.date), `<b>${esc(x.title)}</b>${x.duration ? `<br><span class="p-muted">${esc(x.duration)}</span>` : ''}`, esc(x.details)])));

  const days = (T) => section('📅 יום אחר יום', table(['יום', 'איפה', 'מה קורה'],
    T.days.filter((x) => !x.prep).map((x) => {
      const items = [];
      App.flightsOn(x.date).forEach((f) => f.legs.forEach((l) => items.push(`✈️ ${ltr(l.flightNo)} ${legLine(l)} ${t(l.dep)}`)));
      const out = App.hotelCheckingOut(x.date);
      if (out) items.push(`🧳 צ'ק אאוט ${ltr(out.name)}`);
      App.transfersOn(x.date).forEach((tr) => items.push(`🚕 ${esc(tr.title)}`));
      const inn = T.hotels.find((h) => h.checkIn === x.date);
      if (inn) items.push(`🏨 צ'ק אין ${ltr(inn.name)}`);
      (x.attractions || []).map(App.attraction).filter(Boolean).forEach((a) => items.push(`🌴 ${esc(a.name)}`));
      (x.tips || []).forEach((tip) => items.push(`💡 ${esc(tip)}`));
      const p = App.place(x.place);
      return [
        `<b>${d(x.date)}</b> <span class="p-muted">${App.weekday(x.date)}</span><br><span class="p-muted">יום ${App.dayNumber(x.date)}</span>`,
        `<b>${esc(p.name)}</b>${x.title && x.title !== p.name ? `<br><span class="p-muted">${esc(x.title)}</span>` : ''}`,
        items.join('<br>') || '<span class="p-muted">יום חופשי</span>',
      ];
    })));

  const attractions = (T) => {
    const order = [...new Set(T.attractions.map((a) => a.place))];
    return section('🌴 אטרקציות', order.map((k) => `<h3>${esc(App.place(k).name)}</h3><ul>${
      T.attractions.filter((a) => a.place === k).map((a) => `<li><b>${esc(a.name)}</b> <span class="p-muted">${ltr(a.en)}${a.tags && a.tags.duration ? ` · ${esc(a.tags.duration)}` : ''}</span>${a.agentNote ? `<br>💬 עדי: ${esc(a.agentNote)}` : ''}</li>`).join('')
    }</ul>`).join(''));
  };

  const essentials = (T) => {
    const I = T.info;
    const rows = [
      ['🆘 חירום בפיליפינים', `<b>${esc(I.emergencyPhone)}</b>`],
      ['🇮🇱 שגרירות ישראל במנילה', ltr(I.embassyUrl.replace(/^https?:\/\//, ''))],
      I.insurance && I.insurance.company ? ['🛡️ ביטוח', `${esc(I.insurance.company)} · פוליסה ${ltr(I.insurance.policy)}${I.insurance.phone ? ` · ${ltr(I.insurance.phone)}` : ''}`] : null,
      T.contact && T.contact.name ? ['👤 איש קשר', `${esc(T.contact.name)}${T.contact.whatsapp ? ` · ${ltr(T.contact.whatsapp)}` : ''}`] : null,
      ['🕐 שעון', esc(I.timeDiff)],
      ['💵 כסף', `${esc(I.currency.name)} · 100 פזו ≈ ${Math.round(100 * I.currency.approxIls)} ₪`],
      ['🔌 חשמל', esc(I.plug)],
    ].filter(Boolean);
    return section('📌 חשוב לדעת', `<table class="p-kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`);
  };

  const route = (T) => {
    const stays = [];
    T.days.filter((x) => !x.prep && x.place !== 'israel').forEach((x) => {
      const last = stays[stays.length - 1];
      if (last && last.place === x.place) last.to = x.date; else stays.push({ place: x.place, from: x.date, to: x.date });
    });
    return `<p class="p-route">${stays.map((s) => `<span><b>${esc(App.place(s.place).name)}</b> ${d(s.from)}${s.to !== s.from ? `–${d(s.to)}` : ''}</span>`).join(' ← ')}</p>`;
  };

  App.printHtml = () => {
    const T = App.trip;
    return `<div class="p-doc">
      <header class="p-head">
        <h1>${esc(T.title)}</h1>
        <p>${esc(T.travelers)} · ${App.range(T.start, T.end)} ${T.start.slice(0, 4)} · ${App.totalDays()} ימים</p>
        ${route(T)}
      </header>
      ${essentials(T)}${flights(T)}${hotels(T)}${transfers(T)}${days(T)}${attractions(T)}
      <p class="p-foot">הודפס ב-${d(App.fmtDate(new Date()))} מתוך אפליקציית הטיול. השעות הן שעון מקומי בכל מקום.</p>
    </div>`;
  };

  App.printTrip = () => {
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = App.printHtml();
    const prevTitle = document.title;
    document.title = `${App.trip.title} - ${App.trip.travelers}`; // becomes the PDF file name
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); document.title = prevTitle; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 100);
  };
})(window.App);
