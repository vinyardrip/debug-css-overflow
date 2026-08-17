/**
 * Test setup: guarantee a working `localStorage`.
 *
 * Node >= 26 ships an experimental `localStorage` global that is unusable
 * without `--localstorage-file` (it returns `undefined` and warns). It also
 * shadows jsdom's window Storage inside vitest's environment, which does not
 * re-expose jsdom's `localStorage` on the global. Provide a small in-memory
 * Storage so the detector tests can exercise persistence.
 *
 * In the isolated (VM) jsdom path the real jsdom Storage is already available
 * and this shim is skipped.
 */
if (
  typeof globalThis.localStorage === "undefined" ||
  typeof globalThis.localStorage.getItem !== "function"
) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}
