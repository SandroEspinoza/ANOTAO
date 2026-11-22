import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OfflineDbService } from './offline-db.service';
import { SyncActionType, SyncQueueItem } from '../models/sync.model';
import { Prestamo } from '../../features/loans/models/loan.model';

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  private http = inject(HttpClient);
  private offlineDb = inject(OfflineDbService);
  private apiUrl = `${environment.apiUrl}/prestamos`;

  isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  isSyncing = signal<boolean>(false);
  pendingCount = signal<number>(0);
  lastSync = signal<Date | null>(null);
  syncMessage = signal<string | null>(null);
  syncError = signal<string | null>(null);

  // Notificador para que LoanService refresque la UI al terminar sincronización
  sincronizacionCompletada$ = new Subject<void>();

  constructor() {
    this.iniciarMonitoreoRed();
    this.actualizarContador();
  }

  private iniciarMonitoreoRed(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline.set(true);
      this.syncMessage.set('Conexión reestablecida. Sincronizando datos...');
      this.sincronizar();
    });

    window.addEventListener('offline', () => {
      this.isOnline.set(false);
      this.syncMessage.set('Modo sin conexión activo.');
    });
  }

  async actualizarContador(): Promise<number> {
    try {
      const cola = await this.offlineDb.obtenerColaSync();
      this.pendingCount.set(cola.length);
      return cola.length;
    } catch {
      return 0;
    }
  }

  async encolarAccion(
    action: SyncActionType,
    payload?: any,
    prestamoId?: number,
    clientTempId?: number
  ): Promise<SyncQueueItem> {
    const queueId = 'sync_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const item: SyncQueueItem = {
      queueId,
      action,
      prestamoId,
      clientTempId,
      payload,
      timestamp: new Date().toISOString(),
      status: 'PENDING'
    };

    await this.offlineDb.agregarColaSync(item);
    await this.actualizarContador();

    // Si hay internet, intentar sincronizar de inmediato
    if (this.isOnline()) {
      this.sincronizar();
    }

    return item;
  }

  async sincronizar(): Promise<void> {
    if (this.isSyncing() || !this.isOnline()) {
      return;
    }

    const cola = await this.offlineDb.obtenerColaSync();
    if (cola.length === 0) {
      this.pendingCount.set(0);
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);
    this.syncMessage.set(`Sincronizando ${cola.length} movimiento(s)...`);

    // Mapeo de IDs temporales locales -> IDs reales del servidor
    const tempIdMap: Record<number, number> = {};

    try {
      for (const item of cola) {
        // Resolver ID si era temporal
        const idReal = item.prestamoId && item.prestamoId < 0
          ? (tempIdMap[item.prestamoId] || item.prestamoId)
          : item.prestamoId;

        switch (item.action) {
          case 'CREAR_PRESTAMO': {
            try {
              const res = await firstValueFrom(this.http.post<Prestamo>(this.apiUrl, item.payload));
              if (item.clientTempId && res && res.id) {
                tempIdMap[item.clientTempId] = res.id;
                // Eliminar el temporal de IndexedDB y guardar el nuevo real
                await this.offlineDb.eliminarPrestamoLocal(item.clientTempId);
                await this.offlineDb.guardarPrestamoIndividual(res);
              }
              await this.offlineDb.eliminarItemColaSync(item.queueId);
            } catch (err: any) {
              console.error('Error al sincronizar creación:', err);
              // Si falla por validación permanente, lo removemos para no trancar la cola
              if (err.status >= 400 && err.status < 500) {
                await this.offlineDb.eliminarItemColaSync(item.queueId);
              } else {
                throw err;
              }
            }
            break;
          }

          case 'PAGAR_INTERES': {
            try {
              if (idReal && idReal > 0) {
                const body = item.payload ? item.payload : {};
                await firstValueFrom(this.http.post(`${this.apiUrl}/${idReal}/pagar-interes`, body));
              }
              await this.offlineDb.eliminarItemColaSync(item.queueId);
            } catch (err: any) {
              console.error('Error al sincronizar pago de interés:', err);
              if (err.status >= 400 && err.status < 500) {
                await this.offlineDb.eliminarItemColaSync(item.queueId);
              } else {
                throw err;
              }
            }
            break;
          }

          case 'PAGAR_CUOTA': {
            try {
              if (idReal && idReal > 0) {
                await firstValueFrom(this.http.post(`${this.apiUrl}/${idReal}/pagar-cuota`, {}));
              }
              await this.offlineDb.eliminarItemColaSync(item.queueId);
            } catch (err: any) {
              console.error('Error al sincronizar pago de cuota:', err);
              if (err.status >= 400 && err.status < 500) {
                await this.offlineDb.eliminarItemColaSync(item.queueId);
              } else {
                throw err;
              }
            }
            break;
          }

          case 'AMPLIAR_PRESTAMO': {
            try {
              if (idReal && idReal > 0) {
                await firstValueFrom(this.http.post(`${this.apiUrl}/${idReal}/ampliar`, item.payload));
              }
              await this.offlineDb.eliminarItemColaSync(item.queueId);
            } catch (err: any) {
              console.error('Error al sincronizar ampliación:', err);
              if (err.status >= 400 && err.status < 500) {
                await this.offlineDb.eliminarItemColaSync(item.queueId);
              } else {
                throw err;
              }
            }
            break;
          }

          case 'REGISTRAR_ABONO': {
            try {
              if (idReal && idReal > 0) {
                await firstValueFrom(this.http.post(`${this.apiUrl}/${idReal}/abono`, item.payload));
              }
              await this.offlineDb.eliminarItemColaSync(item.queueId);
            } catch (err: any) {
              console.error('Error al sincronizar abono:', err);
              if (err.status >= 400 && err.status < 500) {
                await this.offlineDb.eliminarItemColaSync(item.queueId);
              } else {
                throw err;
              }
            }
            break;
          }

          case 'MARCAR_PAGADO': {
            try {
              if (idReal && idReal > 0) {
                await firstValueFrom(this.http.put(`${this.apiUrl}/${idReal}/pagar-todo`, {}));
              }
              await this.offlineDb.eliminarItemColaSync(item.queueId);
            } catch (err: any) {
              console.error('Error al sincronizar liquidación:', err);
              if (err.status >= 400 && err.status < 500) {
                await this.offlineDb.eliminarItemColaSync(item.queueId);
              } else {
                throw err;
              }
            }
            break;
          }

          case 'ELIMINAR_PRESTAMO': {
            try {
              if (idReal && idReal > 0) {
                await firstValueFrom(this.http.delete(`${this.apiUrl}/${idReal}`));
              }
              await this.offlineDb.eliminarItemColaSync(item.queueId);
            } catch (err: any) {
              console.error('Error al sincronizar eliminación:', err);
              if (err.status >= 400 && err.status < 500) {
                await this.offlineDb.eliminarItemColaSync(item.queueId);
              } else {
                throw err;
              }
            }
            break;
          }
        }
      }

      this.lastSync.set(new Date());
      this.syncMessage.set('¡Todo sincronizado con éxito!');
      setTimeout(() => this.syncMessage.set(null), 3000);
      this.sincronizacionCompletada$.next();
    } catch (err: any) {
      this.syncError.set('Error en la sincronización. Se reintentará automáticamente.');
      console.warn('Fallo temporal de sincronización:', err);
    } finally {
      this.isSyncing.set(false);
      await this.actualizarContador();
    }
  }

  sincronizarAhora(): void {
    if (this.isOnline()) {
      this.sincronizar();
    }
  }
}
