import { Injectable } from '@angular/core';
import { Prestamo } from '../../features/loans/models/loan.model';
import { SyncQueueItem } from '../models/sync.model';

const DB_NAME = 'anotao_offline_db';
const DB_VERSION = 1;
const STORE_PRESTAMOS = 'prestamos';
const STORE_SYNC_QUEUE = 'sync_queue';
const STORE_METADATA = 'metadata';

@Injectable({
  providedIn: 'root'
})
export class OfflineDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB no está disponible en este entorno'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_PRESTAMOS)) {
          db.createObjectStore(STORE_PRESTAMOS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
          db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'queueId' });
        }

        if (!db.objectStoreNames.contains(STORE_METADATA)) {
          db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // ==========================================
  // OPERACIONES DE PRÉSTAMOS
  // ==========================================

  async guardarPrestamos(prestamos: Prestamo[]): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_PRESTAMOS], 'readwrite');
      const store = tx.objectStore(STORE_PRESTAMOS);

      // Conservamos cualquier préstamo temporal offline que aún no se haya sincronizado
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const existentes: Prestamo[] = getAllReq.result || [];
        const temporales = existentes.filter(p => p.id < 0);

        store.clear();

        for (const p of prestamos) {
          store.put(p);
        }
        for (const temp of temporales) {
          store.put(temp);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async obtenerPrestamos(): Promise<Prestamo[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_PRESTAMOS], 'readonly');
      const store = tx.objectStore(STORE_PRESTAMOS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async guardarPrestamoIndividual(prestamo: Prestamo): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_PRESTAMOS], 'readwrite');
      const store = tx.objectStore(STORE_PRESTAMOS);
      store.put(prestamo);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async eliminarPrestamoLocal(id: number): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_PRESTAMOS], 'readwrite');
      const store = tx.objectStore(STORE_PRESTAMOS);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==========================================
  // COLA DE SINCRONIZACIÓN (SYNC QUEUE)
  // ==========================================

  async agregarColaSync(item: SyncQueueItem): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SYNC_QUEUE], 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async obtenerColaSync(): Promise<SyncQueueItem[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SYNC_QUEUE], 'readonly');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items: SyncQueueItem[] = req.result || [];
        // Orden cronológico (FIFO)
        items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async eliminarItemColaSync(queueId: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SYNC_QUEUE], 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      store.delete(queueId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async limpiarColaSync(): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SYNC_QUEUE], 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==========================================
  // METADATOS Y RESUMEN
  // ==========================================

  async guardarMetadato(key: string, valor: any): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_METADATA], 'readwrite');
      const store = tx.objectStore(STORE_METADATA);
      store.put({ key, valor, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async obtenerMetadato<T = any>(key: string): Promise<T | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_METADATA], 'readonly');
      const store = tx.objectStore(STORE_METADATA);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.valor : null);
      req.onerror = () => reject(req.error);
    });
  }
}
