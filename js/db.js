// Tiny IndexedDB wrapper. Everything is stored on this device only.
const DB = (() => {
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open("stage", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("chars", { keyPath: "id" });
        const chats = d.createObjectStore("chats", { keyPath: "id" });
        chats.createIndex("charId", "charId");
        d.createObjectStore("kv");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      const req = fn(s);
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  }
  return {
    all: (store) => tx(store, "readonly", s => s.getAll()),
    get: (store, key) => tx(store, "readonly", s => s.get(key)),
    put: (store, val, key) => tx(store, "readwrite", s => key === undefined ? s.put(val) : s.put(val, key)),
    del: (store, key) => tx(store, "readwrite", s => s.delete(key)),
    clear: (store) => tx(store, "readwrite", s => s.clear()),
    byIndex: (store, index, value) => tx(store, "readonly", s => s.index(index).getAll(value)),
  };
})();

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
