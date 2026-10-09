// Things the travelers change together: the two checklists (items and ticks) and the
// "we did it" marks on attractions. Kept on the server so every phone sees the same
// state and nothing is lost if a phone is cleared; a local copy shows it offline.
(function (App) {
  const cacheKey = () => 'shared_' + ((window.APP_CONFIG || {}).tripId || 'trip');

  App.shared = App.store.get(cacheKey(), null) || {};
  App.editList = null; // the checklist currently in edit mode

  // Called by the backend whenever the server copy changes.
  App.setShared = (data) => {
    App.shared = data || {};
    App.store.set(cacheKey(), App.shared);
  };

  const save = (patch) => {
    App.setShared({
      ...App.shared,
      ...patch,
      lists: { ...(App.shared.lists || {}), ...(patch.lists || {}) },
      done: { ...(App.shared.done || {}), ...(patch.done || {}) },
    });
    if (App.backend.saveShared) App.backend.saveShared(patch).catch(() => { /* kept locally; retried by Firestore when online */ });
  };

  // Before the first edit, a list is the one from the trip data plus any ticks made on this phone before lists were shared.
  App.getList = (key) => {
    const own = (App.shared.lists || {})[key];
    if (own) return own;
    const oldTicks = App.store.get('check_' + key, {});
    return ((App.trip.checklists || {})[key] || []).map((text, i) => ({ id: 'i' + i, text, done: !!oldTicks[i] }));
  };
  const setList = (key, items) => save({ lists: { [key]: items } });

  App.toggleItem = (key, id, done) => setList(key, App.getList(key).map((it) => it.id === id ? { ...it, done } : it));
  App.deleteItem = (key, id) => setList(key, App.getList(key).filter((it) => it.id !== id));
  App.addItem = (key, text) => {
    text = text.trim();
    if (text) setList(key, [...App.getList(key), { id: Date.now().toString(36), text, done: false }]);
  };

  App.isDone = (id) => {
    const d = App.shared.done || {};
    return id in d ? !!d[id] : !!App.store.get('done', {})[id];
  };
  App.toggleDone = (id) => save({ done: { [id]: !App.isDone(id) } });
})(window.App);
