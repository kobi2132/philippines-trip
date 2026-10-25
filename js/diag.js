// Freeze recorder: notes every moment the screen stopped answering for a second or more, with
// what the app was doing just before. Kept on this phone only; the admin screen shows and copies it.
(function (App) {
  const KEY = 'diag_freezes';
  const MAX = 20;
  const crumbs = []; // the last things that happened: [ms since start, text]
  const frames = []; // the browser's own reports of long frames and slow taps
  const now = () => performance.now();
  const r = Math.round;

  const mark = (text) => {
    crumbs.push([r(now()), text]);
    if (crumbs.length > 250) crumbs.shift();
  };

  const save = (entry) => {
    const list = App.store.get(KEY, []);
    list.push(entry);
    App.store.set(KEY, list.slice(-MAX));
  };

  // What happened between `from` and `to` (ms since start), plus the 3 seconds before it.
  const record = (kind, from, to) => {
    const heap = performance.memory ? r(performance.memory.usedJSHeapSize / 1048576) + 'MB' : null;
    const vv = window.visualViewport;
    save({
      at: new Date(Date.now() - (now() - from)).toISOString(), kind, ms: r(to - from), page: location.hash, heap,
      openFor: r(from / 1000) + 's', zoom: vv ? +vv.scale.toFixed(2) : null, y: r(scrollY), nodes: document.getElementsByTagName('*').length,
      crumbs: crumbs.filter(([t]) => t >= from - 3000 && t <= to + 500).map(([t, s]) => `${r(t - from)} ${s}`),
      frames: frames.filter((f) => f.end >= from - 1000 && f.start <= to + 500).map((f) => ({ ...f, start: r(f.start - from), end: r(f.end - from) })),
    });
  };

  // 1. The page's own code stuck: a 250ms timer that comes back late means nothing could run.
  let last = now();
  let hiddenAt = -Infinity;
  setInterval(() => {
    const t = now();
    const gap = t - last;
    last = t;
    // A phone that slept or an app in the background also stops timers: not a freeze.
    if (gap > 1000 && document.visibilityState === 'visible' && t - hiddenAt > gap + 1000) {
      // Let late reports about the same moment arrive first.
      setTimeout(() => record('stuck', t - gap, t), 1500);
    }
  }, 250);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Infinity;
    else hiddenAt = now();
    mark('visible=' + document.visibilityState);
  });

  // 2. The screen stopped being drawn: the app still runs, but no new picture reaches the screen.
  // After every touch, page change and scroll we ask for the next frame; one that takes over a second is a freeze.
  let wantedAt = null;
  const wantFrame = () => {
    if (wantedAt !== null) return;
    wantedAt = now();
    requestAnimationFrame(() => {
      const t = now();
      if (t - wantedAt > 1000 && document.visibilityState === 'visible' && hiddenAt < wantedAt) {
        const from = wantedAt;
        mark(`frames back after ${r(t - from)}ms`);
        setTimeout(() => record('no-frames', from, t), 1500);
      }
      wantedAt = null;
    });
  };
  window.addEventListener('hashchange', () => { mark('page ' + location.hash); wantFrame(); });
  // Where the finger went: a swipe from the screen's edge can be taken by Android as "back".
  let tx = 0, ty = 0, tt = 0;
  document.addEventListener('touchstart', (e) => {
    const p = e.touches[0];
    tx = p.clientX; ty = p.clientY; tt = now();
    mark(`touch x=${r(tx)}/${innerWidth} y=${r(ty)}${e.touches.length > 1 ? ' fingers=' + e.touches.length : ''}`);
    wantFrame();
  }, { passive: true, capture: true });
  document.addEventListener('touchend', (e) => {
    const p = e.changedTouches[0];
    mark(`lift dx=${r(p.clientX - tx)} dy=${r(p.clientY - ty)} ${r(now() - tt)}ms`);
    wantFrame();
  }, { passive: true, capture: true });
  document.addEventListener('touchcancel', () => mark('touch-cancel'), { passive: true, capture: true });
  window.addEventListener('focus', () => mark('focus'));
  window.addEventListener('blur', () => mark('blur'));
  window.addEventListener('pageshow', () => mark('pageshow'));
  window.addEventListener('pagehide', () => mark('pagehide'));
  window.addEventListener('resize', () => mark(`resize ${innerWidth}x${innerHeight}`));
  if (window.visualViewport) visualViewport.addEventListener('resize', () => mark('zoom ' + visualViewport.scale.toFixed(2)));
  let scrolls = 0;
  window.addEventListener('scroll', () => {
    wantFrame();
    if (!scrolls++) setTimeout(() => { mark(`scroll x${scrolls} y=${r(scrollY)}`); scrolls = 0; }, 500);
  }, { passive: true });

  // 3. The browser's own reports: long frames with the script that ran, slow taps and swipes.
  const observe = (type, opts, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, ...opts }); } catch (e) { /* not on this phone */ } };
  const keep = (f) => { frames.push(f); if (frames.length > 40) frames.shift(); };
  observe('long-animation-frame', {}, (e) => {
    if (e.duration < 300) return;
    keep({ type: 'frame', start: e.startTime, end: e.startTime + e.duration, ms: r(e.duration), block: r(e.blockingDuration || 0),
      layout: r(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
      scripts: (e.scripts || []).filter((s) => s.duration > 30).map((s) => `${r(s.duration)}ms ${s.invoker || ''} ${(s.sourceURL || '').split('/').pop()}:${s.sourceFunctionName || ''} layout=${r(s.forcedStyleAndLayoutDuration || 0)}`) });
  });
  observe('event', { durationThreshold: 300 }, (e) => {
    keep({ type: 'input ' + e.name, start: e.startTime, end: e.startTime + e.duration, ms: r(e.duration),
      wait: r(e.processingStart - e.startTime), run: r(e.processingEnd - e.processingStart) });
  });
  observe('longtask', {}, (e) => {
    if (e.duration >= 300) keep({ type: 'task', start: e.startTime, end: e.startTime + e.duration, ms: r(e.duration) });
  });

  // 4. Network calls: which ones were open around a freeze.
  if (window.fetch) {
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input && input.url || input).replace(/^https?:\/\//, '').split('?')[0].slice(0, 60);
      const t = now();
      mark('net ' + url);
      return orig(input, init).then(
        (res) => { mark(`net done ${r(now() - t)}ms ${res.status} ${url}`); return res; },
        (err) => { mark(`net fail ${r(now() - t)}ms ${url}`); throw err; });
    };
  }

  App.diag = {
    mark,
    list: () => App.store.get(KEY, []),
    clear: () => App.store.set(KEY, []),
  };
})(window.App);
