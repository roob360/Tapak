// Simpanan di perangkat (IndexedDB): 'files' = data proyek, 'pdfs' = byte PDF.
let dbp = null;
const open = () => (dbp ??= new Promise((res, rej) => {
  const rq = indexedDB.open('tapak-pkp', 1);
  rq.onupgradeneeded = () => { rq.result.createObjectStore('files', { keyPath: 'id' }); rq.result.createObjectStore('pdfs'); };
  rq.onsuccess = () => res(rq.result);
  rq.onerror = () => rej(rq.error);
}));
async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(stores, mode);
    const rq = fn(t);
    t.oncomplete = () => res(rq?.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
export const listFiles = () => tx('files', 'readonly', (t) => t.objectStore('files').getAll());
export const getFile = (id) => tx('files', 'readonly', (t) => t.objectStore('files').get(id));
export const getPdf = (id) => tx('pdfs', 'readonly', (t) => t.objectStore('pdfs').get(id));
export const putFile = (file) => tx('files', 'readwrite', (t) => t.objectStore('files').put(file));
/** Data dan PDF ditulis dalam satu transaksi supaya tidak pernah berbeda versi. */
export const putBoth = (file, pdf) => tx(['files', 'pdfs'], 'readwrite', (t) => { t.objectStore('pdfs').put(pdf, file.id); t.objectStore('files').put(file); });
export const removeFile = (id) => tx(['files', 'pdfs'], 'readwrite', (t) => { t.objectStore('pdfs').delete(id); t.objectStore('files').delete(id); });
