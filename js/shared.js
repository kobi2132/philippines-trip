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

  // Every change is saved as just that one field (one tick, one item), never the whole list: two phones
  // changing the same list at the same time, or one of them offline, both keep their changes.
  const save = (patch) => {
    const items = { ...(App.shared.items || {}) };
    for (const [key, changes] of Object.entries(patch.items || {})) {
      items[key] = { ...(items[key] || {}) };
      for (const [id, c] of Object.entries(changes)) items[key][id] = { ...(items[key][id] || {}), ...c };
    }
    App.setShared({ ...App.shared, items, done: { ...(App.shared.done || {}), ...(patch.done || {}) } });
    if (App.backend.saveShared) App.backend.saveShared(patch).catch(() => { /* kept locally; retried by Firestore when online */ });
  };

  // A list = its items from the trip data (or, if the travelers edited it before changes were saved one
  // by one, that saved copy), plus their own changes on top: ticks, added items, deleted items.
  // Items Jacob adds to the trip data later join the list; an item the travelers deleted stays deleted.
  App.getList = (key) => {
    const fromTrip = (App.trip.checklists || {})[key] || [];
    const old = (App.shared.lists || {})[key];
    let base;
    if (old) {
      const texts = new Set(old.map((it) => it.text));
      base = [...old.map((it, i) => ({ ...it, order: i })),
        ...fromTrip.filter((text) => !texts.has(text)).map((text, i) => ({ id: 'src:' + text, text, done: false, order: 1000 + i }))];
    } else {
      const oldTicks = App.store.get('check_' + key, {}); // ticks made on this phone before lists were shared
      base = fromTrip.map((text, i) => ({ id: 'src:' + text, text, done: !!oldTicks[i], order: i }));
    }
    const changes = (App.shared.items || {})[key] || {};
    const byId = new Map(base.map((it) => [it.id, it]));
    for (const [id, c] of Object.entries(changes)) byId.set(id, { id, done: false, ...(byId.get(id) || {}), ...c });
    return [...byId.values()].filter((it) => !it.deleted && it.text).sort((a, b) => a.order - b.order)
      .map(({ id, text, done }) => ({ id, text, done: !!done }));
  };
  const change = (key, id, c) => save({ items: { [key]: { [id]: c } } });

  App.toggleItem = (key, id, done) => change(key, id, { done });
  App.deleteItem = (key, id) => change(key, id, { deleted: true });
  App.addItem = (key, text) => {
    text = text.trim();
    if (text) change(key, 'u' + Date.now().toString(36), { text, done: false, order: Date.now() });
  };

  App.isDone = (id) => {
    const d = App.shared.done || {};
    return id in d ? !!d[id] : !!App.store.get('done', {})[id];
  };
  App.toggleDone = (id) => save({ done: { [id]: !App.isDone(id) } });
})(window.App);
