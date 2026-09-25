import { emptyLibrary, type Library } from './model';

const DATABASE = 'contexter';
const STORE = 'documents';
const HANDLE_STORE = 'folderHandles';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFolderHandle(handle: FileSystemDirectoryHandle | undefined): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(HANDLE_STORE, 'readwrite');
      if (handle) tx.objectStore(HANDLE_STORE).put(handle, 'notebooks');
      else tx.objectStore(HANDLE_STORE).delete('notebooks');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Ordnerzugriff konnte nicht gespeichert werden.'));
    });
  } finally { database.close(); }
}

export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const database = await openDatabase();
  try {
    const tx = database.transaction(HANDLE_STORE, 'readonly');
    return await new Promise((resolve, reject) => {
      const request = tx.objectStore(HANDLE_STORE).get('notebooks');
      request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
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
