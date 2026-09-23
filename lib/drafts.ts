// مسودات بلا اتصال — PRD §7 · AC-17. في المتصفح فقط (IndexedDB).
// المسودة تحمل clientDraftId الذي يولّده الجهاز؛ الخادم لا يُنشئ بها إلا شكوى واحدة مهما تكرر الإرسال.
// «النطاق» يفصل مسودة الزائر عن مسودة كل حساب على نفس الجهاز.

export type DraftFile = { id: string; name: string; type: string; size: number; blob: Blob };

export type ComplaintDraft = {
  clientDraftId: string;
  scope: string;
  fields: Record<string, string | boolean>;
  files: DraftFile[];
  /** queued = ضغط «إرسال» بلا اتصال، فتُرسل تلقائيًا عند عودته */
  status: 'editing' | 'queued';
  updatedAt: number;
};

const DB_NAME = 'rafah-drafts';
const STORE = 'complaints';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'clientDraftId' });
      store.createIndex('scope', 'scope');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const draftsAvailable = () => typeof indexedDB !== 'undefined';

/** أحدث مسودة لهذا النطاق، أو null */
export async function loadDraft(scope: string): Promise<ComplaintDraft | null> {
  if (!draftsAvailable()) return null;
  const all = await run<ComplaintDraft[]>('readonly', (s) => s.index('scope').getAll(scope));
  return all.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

export async function saveDraft(draft: ComplaintDraft): Promise<void> {
  if (!draftsAvailable()) return;
  await run('readwrite', (s) => s.put({ ...draft, updatedAt: Date.now() }));
}

export async function deleteDraft(clientDraftId: string): Promise<void> {
  if (!draftsAvailable()) return;
  await run('readwrite', (s) => s.delete(clientDraftId));
}
