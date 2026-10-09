// Where the trip data comes from: Firebase (Google sign-in + Firestore),
// or data embedded in the page for a preview build.
(function (App) {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const cfg = window.APP_CONFIG || {};
  let fb = null; // loaded Firebase modules + instances

  App.role = null;
  App.user = null;
  App.canEdit = () => App.role === 'traveler' || App.role === 'admin';

  const cacheKey = () => 'trip_cache_' + cfg.tripId;

  async function loadFirebase() {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
    ]);
    const app = appMod.initializeApp(cfg.firebase);
    const auth = authMod.getAuth(app);
    let db;
    try {
      db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
    } catch (e) {
      db = fsMod.getFirestore(app);
    }
    fb = { authMod, fsMod, auth, db };
  }

  function useTrip(data, role, from) {
    App.trip = data;
    App.role = role;
    App.dataSource = from;
    App.render();
  }

  App.backend = {
    async start() {
      // 1. Preview build: data baked into the page.
      if (window.TRIP_DATA) { useTrip(window.TRIP_DATA, 'traveler', 'embedded'); return; }

      // 2. Show the last copy we had straight away (works with no signal).
      const cached = App.store.get(cacheKey(), null);
      if (cached) { App.user = cached.user; useTrip(cached.trip, cached.role, 'cache'); }

      if (!cfg.firebase) { if (!cached) App.showScreen('setup'); return; }

      try { await loadFirebase(); } catch (e) {
        if (!cached) App.showScreen('offline');
        return;
      }
      const { authMod, fsMod, auth, db } = fb;
      authMod.onAuthStateChanged(auth, (user) => {
        if (!user) { App.user = null; App.showScreen('login'); return; }
        App.user = { email: user.email.toLowerCase(), name: user.displayName };
        const tripRef = fsMod.doc(db, 'trips', cfg.tripId);
        fsMod.onSnapshot(tripRef, (snap) => {
          if (!snap.exists()) {
            // Not created yet: the admin creates it from the admin screen.
            if (cfg.adminEmails && cfg.adminEmails.includes(App.user.email)) { App.role = 'admin'; App.showScreen('admin-empty'); } else App.showScreen('no-access');
            return;
          }
          const d = snap.data();
          const role = (d.members || {})[App.user.email] || null;
          if (!role) { App.showScreen('no-access'); return; }
          App.store.set(cacheKey(), { trip: d.data, role, user: App.user });
          useTrip(d.data, role, 'live');
        }, (err) => {
          if (err.code === 'permission-denied') App.showScreen('no-access');
        });
        fsMod.onSnapshot(fsMod.doc(db, 'trips', cfg.tripId, 'status', 'flights'), (snap) => {
          App.flightStatus = snap.exists() ? (snap.data().legs || {}) : {};
          if (App.trip) App.render();
        }, () => { /* no status yet */ });
      });
    },

    async signIn() {
      const { authMod, auth } = fb;
      const provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await authMod.signInWithPopup(auth, provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
          await authMod.signInWithRedirect(auth, provider);
        } else throw e;
      }
    },

    async signOut() {
      localStorage.removeItem(cacheKey());
      if (fb) await fb.authMod.signOut(fb.auth);
      location.hash = '#/today';
      location.reload();
    },

    // Admin only (enforced by Firestore rules): replace trip data and members.
    async save(data, members) {
      const { fsMod, db } = fb;
      await fsMod.setDoc(fsMod.doc(db, 'trips', cfg.tripId), { data, members, updatedAt: fsMod.serverTimestamp() });
    },

    async loadForAdmin() {
      const { fsMod, db } = fb;
      const snap = await fsMod.getDoc(fsMod.doc(db, 'trips', cfg.tripId));
      return snap.exists() ? snap.data() : null;
    },
  };
})(window.App);
