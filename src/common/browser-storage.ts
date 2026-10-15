/**
 * Minimal typed wrapper over IndexedDB with schema versioning.
 * Used by the browser build for session-persisted storage.
 */
export class BrowserStorage {
  private db: IDBDatabase | null = null;
  private readonly name: string;
  private readonly version: number;

  constructor(name = 'terraform-blockly-editor', version = 1) {
    this.name = name;
    this.version = version;
  }

  async open(stores: string[]): Promise<void> {
    if (this.db) {
      return;
    }
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB unavailable');
    }
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      request.onupgradeneeded = () => {
        for (const store of stores) {
          if (!request.result.objectStoreNames.contains(store)) {
            request.result.createObjectStore(store);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    });
  }

  async put(store: string, key: string, value: unknown): Promise<void> {
    const db = this.requireDb();
    await this.run(db, store, objectStore => objectStore.put(value, key));
  }

  async get<T>(store: string, key: string): Promise<T | null> {
    const db = this.requireDb();
    const request = await this.run<IDBRequest>(db, store, objectStore => objectStore.get(key));
    return (request.result as T) ?? null;
  }

  async list<T>(store: string): Promise<T[]> {
    const db = this.requireDb();
    const request = await this.run<IDBRequest>(db, store, objectStore => objectStore.getAll());
    return (request.result as T[]) ?? [];
  }

  async delete(store: string, key: string): Promise<void> {
    const db = this.requireDb();
    await this.run(db, store, objectStore => objectStore.delete(key));
  }

  private requireDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('IndexedDB not opened');
    }
    return this.db;
  }

  /**
   * Runs an operation inside a transaction and resolves with the operation's
   * request once the transaction has fully committed. Resolving on the
   * transaction (not just the request) guarantees callers never observe
   * uncommitted or missing data.
   */
  private run<T>(
    db: IDBDatabase,
    store: string,
    operation: (objectStore: IDBObjectStore) => IDBRequest
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      let request: IDBRequest;
      tx.oncomplete = () => resolve(request as T);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      try {
        request = operation(tx.objectStore(store));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}
