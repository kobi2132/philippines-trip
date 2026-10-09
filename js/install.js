// "Install the app" card: one tap on Android, short how-to on iPhone.
(function (App) {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isSamsung = /SamsungBrowser/.test(ua);
  const isIOSOtherBrowser = isIOS && /CriOS|FxiOS|EdgiOS/.test(ua);

  let deferred = null; // Chrome's install prompt, saved for our own button
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (App.trip) App.render();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    App.store.set('installed', true);
    if (App.trip) App.render();
  });

  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // Phones and tablets only, never inside the installed app or a preview file.
  App.canInstall = () => !installed() && (isIOS || isAndroid) && location.protocol === 'https:';

  App.installCard = (compact) => {
    if (!App.canInstall()) return '';
    if (compact && App.store.get('install_dismissed', false)) return '';
    const text = isIOS
      ? 'מוסיפים את האפליקציה למסך הבית, והיא נפתחת כמו כל אפליקציה, במסך מלא.'
      : 'מתקינים את האפליקציה בלחיצה אחת, והיא נפתחת מהמסך הראשי כמו כל אפליקציה.';
    const btn = deferred
      ? '<button class="btn btn-wide" data-install>📲 התקנת האפליקציה</button>'
      : '<button class="btn btn-wide" data-install-help>📲 איך מתקינים?</button>';
    return `<div class="push-card install-card">
      ${compact ? '<button class="card-x" data-dismiss="install_dismissed" aria-label="סגירה">✕</button>' : ''}
      <p>📲 ${text}</p>${btn}</div>`;
  };

  const steps = () => {
    if (isIOS && isIOSOtherBrowser) return [
      'לוחצים על כפתור השיתוף <b>⬆️</b> (ריבוע עם חץ למעלה), ליד שורת הכתובת.',
      'גוללים ובוחרים <b>"הוספה למסך הבית"</b> <bdi>(Add to Home Screen)</bdi>.',
      'לוחצים <b>"הוסף"</b> <bdi>(Add)</bdi> למעלה.',
    ];
    if (isIOS) return [
      'בספארי לוחצים על כפתור השיתוף <b>⬆️</b> (ריבוע עם חץ למעלה) בתחתית המסך. אם לא רואים אותו, לוחצים קודם על <b>⋯</b>.',
      'גוללים ובוחרים <b>"הוספה למסך הבית"</b> <bdi>(Add to Home Screen)</bdi>.',
      'לוחצים <b>"הוסף"</b> <bdi>(Add)</bdi> למעלה.',
    ];
    if (isSamsung) return [
      'לוחצים על <b>☰</b> בתחתית המסך.',
      'בוחרים <b>"הוספת דף ל"</b> ← <b>"מסך הבית"</b>.',
    ];
    return [
      'לוחצים על <b>⋮</b> בפינה העליונה.',
      'בוחרים <b>"התקנת אפליקציה"</b> <bdi>(Install app)</bdi> או <b>"הוספה למסך הבית"</b>.',
      'מאשרים <b>"התקנה"</b>.',
    ];
  };

  App.installHelpModal = () => `
    <div class="modal" data-close>
      <div class="modal-box install-help" dir="rtl">
        <div class="hero-emoji">📲</div>
        <h2>איך מתקינים</h2>
        <ol>${steps().map((s) => `<li>${s}</li>`).join('')}</ol>
        <p class="muted">אחרי זה האפליקציה מופיעה עם אייקון במסך הבית.</p>
        <button class="btn btn-wide" data-close>הבנתי</button>
      </div>
    </div>`;

  App.promptInstall = async () => {
    if (!deferred) { document.body.insertAdjacentHTML('beforeend', App.installHelpModal()); return; }
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === 'accepted') App.store.set('installed', true);
    App.render();
  };
})(window.App);
