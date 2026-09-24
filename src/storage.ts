import { emptyLibrary, type Library } from './model';

const DATABASE = 'contexter';
const STORE = 'documents';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction<T>(database: IDBDatabase, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    let value: T;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Speichervorgang abgebrochen'));
  });
}

export async function loadLibrary(): Promise<Library> {
  const database = await openDatabase();
  try {
    const stored = await transaction<Library | undefined>(database, 'readonly', store => store.get('library'));
    if (!stored) return emptyLibrary();
    if (stored.schemaVersion !== 1 || !Array.isArray(stored.notebooks) || !Array.isArray(stored.sources)) {
      throw new Error('Unbekanntes Bibliotheksformat. Vorhandene Daten wurden nicht verändert.');
    }
    return stored;
  } finally {
    database.close();
  }
}

export async function saveLibrary(library: Library): Promise<void> {
  const database = await openDatabase();
  try {
    await transaction<IDBValidKey>(database, 'readwrite', store => store.put(library, 'library'));
  } finally {
    database.close();
  }
}
