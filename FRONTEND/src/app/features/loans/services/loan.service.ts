import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, tap, catchError, of, from, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { OfflineDbService } from '../../../core/services/offline-db.service';
import { SyncService } from '../../../core/services/sync.service';
import {
  Prestamo,
  PrestamoCreate,
  ResumenPrestamos,
  PagoInteresRequest,
  PrestamoSobrePrestamoRequest,
  AbonoRequest,
  MovimientoPrestamo
} from '../models/loan.model';

@Injectable({
  providedIn: 'root'
})
export class LoanService {
  private http = inject(HttpClient);
  private offlineDb = inject(OfflineDbService);
  private syncService = inject(SyncService);
  private apiUrl = `${environment.apiUrl}/prestamos`;

  prestamos = signal<Prestamo[]>([]);
  resumen = signal<ResumenPrestamos | null>(null);
  cargando = signal<boolean>(false);
  error = signal<string | null>(null);

  constructor() {
    // Al completar cualquier sincronización en segundo plano, refrescar la lista y el resumen
    this.syncService.sincronizacionCompletada$.subscribe(() => {
      this.cargarPrestamos('TODOS').subscribe();
      this.cargarResumen().subscribe();
    });

    // Cargar caché local inmediato desde IndexedDB al iniciar la app
    this.cargarDesdeCacheLocal();
  }

  private async cargarDesdeCacheLocal(): Promise<void> {
    try {
      const locales = await this.offlineDb.obtenerPrestamos();
      if (locales && locales.length > 0) {
        this.prestamos.set(locales);
      }
      const resumenLocal = await this.offlineDb.obtenerMetadato<ResumenPrestamos>('resumen');
      if (resumenLocal) {
        this.resumen.set(resumenLocal);
      } else if (locales.length > 0) {
        this.recalcularResumenLocal(locales);
      }
    } catch (e) {
      console.warn('No se pudo leer la base de datos local:', e);
    }
  }

  cargarPrestamos(estado: string = 'PENDIENTE', silencioso: boolean = false): Observable<Prestamo[]> {
    if (!silencioso && this.prestamos().length === 0) {
      this.cargando.set(true);
    }
    this.error.set(null);

    // Si no hay internet, devolver los préstamos locales de inmediato
    if (!this.syncService.isOnline()) {
      return from(this.offlineDb.obtenerPrestamos()).pipe(
        tap((locales) => {
          const filtrados = this.filtrarPorEstado(locales, estado);
          this.prestamos.set(filtrados);
          this.recalcularResumenLocal(locales);
          this.cargando.set(false);
        })
      );
    }

    let params = new HttpParams();
    if (estado && estado !== 'TODOS') {
      params = params.set('estado', estado);
    }

    return this.http.get<Prestamo[]>(this.apiUrl, { params }).pipe(
      tap({
        next: (data) => {
          this.prestamos.set(data);
          this.cargando.set(false);
          // Respaldar en IndexedDB para disponibilidad offline
          this.offlineDb.guardarPrestamos(data);
        },
        error: async (err) => {
          console.warn('Error de conexión con el servidor. Cargando modo local:', err);
          const locales = await this.offlineDb.obtenerPrestamos();
          this.prestamos.set(this.filtrarPorEstado(locales, estado));
          this.recalcularResumenLocal(locales);
          this.cargando.set(false);
        }
      })
    );
  }

  obtenerListado(estado?: string): Observable<Prestamo[]> {
    if (!this.syncService.isOnline()) {
      return from(this.offlineDb.obtenerPrestamos()).pipe(
        map((locales) => this.filtrarPorEstado(locales, estado))
      );
    }

    let params = new HttpParams();
    if (estado && estado !== 'TODOS') {
      params = params.set('estado', estado);
    }
    return this.http.get<Prestamo[]>(this.apiUrl, { params }).pipe(
      catchError(() => {
        return from(this.offlineDb.obtenerPrestamos()).pipe(
          map((locales) => this.filtrarPorEstado(locales, estado))
        );
      })
    );
  }

  cargarResumen(): Observable<ResumenPrestamos> {
    if (!this.syncService.isOnline()) {
      return from(this.obtenerOCalcularResumenOffline());
    }

    return this.http.get<ResumenPrestamos>(`${this.apiUrl}/resumen`).pipe(
      tap({
        next: (data) => {
          this.resumen.set(data);
          this.offlineDb.guardarMetadato('resumen', data);
        },
        error: async () => {
          const locales = await this.offlineDb.obtenerPrestamos();
          this.recalcularResumenLocal(locales);
        }
      })
    );
  }

  private async obtenerOCalcularResumenOffline(): Promise<ResumenPrestamos> {
    const resumen = await this.offlineDb.obtenerMetadato<ResumenPrestamos>('resumen');
    if (resumen) {
      this.resumen.set(resumen);
      return resumen;
    }
    const locales = await this.offlineDb.obtenerPrestamos();
    return this.recalcularResumenLocal(locales);
  }

  crearPrestamo(datos: PrestamoCreate): Observable<Prestamo> {
    // Si no hay red, creamos el préstamo en modo Offline de inmediato
    if (!this.syncService.isOnline()) {
      return from(this.crearPrestamoOffline(datos));
    }

    return this.http.post<Prestamo>(this.apiUrl, datos).pipe(
      tap((creado) => {
        this.offlineDb.guardarPrestamoIndividual(creado);
        this.cargarPrestamos('PENDIENTE', true).subscribe();
        this.cargarResumen().subscribe();
      }),
      catchError((err: HttpErrorResponse) => {
        // Si falló por falta de red (status 0), guardar offline
        if (err.status === 0) {
          return from(this.crearPrestamoOffline(datos));
        }
        throw err;
      })
    );
  }

  private async crearPrestamoOffline(datos: PrestamoCreate): Promise<Prestamo> {
    const tempId = -Date.now();
    const diaPago = datos.fecha_prestamo
      ? new Date(datos.fecha_prestamo).getUTCDate()
      : new Date().getUTCDate();

    let montoTotal = datos.monto_prestado;
    let cuotaMensual = 0;
    const interesEstimado = Math.round((datos.monto_prestado * (datos.interes_porcentaje / 100)) * 100) / 100;

    if (datos.modalidad === 'A_MESES' && datos.plazo_meses) {
      const interesTotal = interesEstimado * datos.plazo_meses;
      montoTotal = Math.round((datos.monto_prestado + interesTotal) * 100) / 100;
      cuotaMensual = Math.round((montoTotal / datos.plazo_meses) * 100) / 100;
    }

    const movInicial: MovimientoPrestamo = {
      id: -Date.now(),
      prestamo_id: tempId,
      tipo: 'CREACION',
      monto: datos.monto_prestado,
      detalle: `Préstamo registrado sin conexión a ${datos.cliente}`,
      fecha: new Date().toISOString()
    };

    const nuevo: Prestamo = {
      id: tempId,
      cliente: datos.cliente.trim(),
      telefono: datos.telefono?.trim() || undefined,
      monto_prestado: datos.monto_prestado,
      interes_porcentaje: datos.interes_porcentaje,
      modalidad: datos.modalidad,
      plazo_meses: datos.plazo_meses,
      cuotas_pagadas: 0,
      meses_pagados: 0,
      cuota_mensual: cuotaMensual,
      interes_mensual_estimado: interesEstimado,
      monto_total: montoTotal,
      monto_pagado: 0,
      saldo_pendiente: montoTotal,
      intereses_cobrados: 0,
      estado: 'PENDIENTE',
      fecha_prestamo: datos.fecha_prestamo || new Date().toISOString(),
      dia_pago_mes: diaPago,
      movimientos: [movInicial],
      cronograma_meses: []
    };

    await this.offlineDb.guardarPrestamoIndividual(nuevo);
    await this.syncService.encolarAccion('CREAR_PRESTAMO', datos, undefined, tempId);

    // Actualizar señales en memoria
    this.prestamos.update(list => [nuevo, ...list]);
    this.recalcularResumenLocal(this.prestamos());

    return nuevo;
  }

  pagarInteres(id: number, monto?: number): Observable<Prestamo> {
    const body: PagoInteresRequest = monto ? { monto } : {};

    if (!this.syncService.isOnline() || id < 0) {
      return from(this.pagarInteresOffline(id, monto));
    }

    return this.http.post<Prestamo>(`${this.apiUrl}/${id}/pagar-interes`, body).pipe(
      tap((actualizado) => {
        this.offlineDb.guardarPrestamoIndividual(actualizado);
        this.actualizarPrestamoEnMemoria(actualizado);
        this.cargarPrestamos('PENDIENTE', true).subscribe();
        this.cargarResumen().subscribe();
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 0) {
          return from(this.pagarInteresOffline(id, monto));
        }
        throw err;
      })
    );
  }

  private async pagarInteresOffline(id: number, monto?: number): Promise<Prestamo> {
    const list = this.prestamos();
    const prestamo = list.find(p => p.id === id);
    if (!prestamo) throw new Error('Préstamo no encontrado');

    const montoCobrado = monto ?? prestamo.interes_mensual_estimado;
    const nuevoIntereses = Math.round((prestamo.intereses_cobrados + montoCobrado) * 100) / 100;
    const nuevoTotalCobrado = Math.round((prestamo.monto_pagado + montoCobrado) * 100) / 100;
    const nuevoMeses = prestamo.meses_pagados + 1;

    const mov: MovimientoPrestamo = {
      id: -Date.now(),
      prestamo_id: id,
      tipo: 'PAGO_INTERES_MES',
      monto: montoCobrado,
      detalle: `Pago de interés mes ${nuevoMeses} (S/ ${montoCobrado.toFixed(2)}) - Guardado sin conexión`,
      fecha: new Date().toISOString()
    };

    const actualizado: Prestamo = {
      ...prestamo,
      meses_pagados: nuevoMeses,
      intereses_cobrados: nuevoIntereses,
      monto_pagado: nuevoTotalCobrado,
      fecha_ultimo_pago: new Date().toISOString(),
      movimientos: [mov, ...(prestamo.movimientos || [])]
    };

    await this.offlineDb.guardarPrestamoIndividual(actualizado);
    await this.syncService.encolarAccion('PAGAR_INTERES', { monto: montoCobrado }, id);

    this.prestamos.update(arr => arr.map(p => p.id === id ? actualizado : p));
    this.recalcularResumenLocal(this.prestamos());

    return actualizado;
  }

  pagarCuota(id: number): Observable<Prestamo> {
    if (!this.syncService.isOnline() || id < 0) {
      return from(this.pagarCuotaOffline(id));
    }

    return this.http.post<Prestamo>(`${this.apiUrl}/${id}/pagar-cuota`, {}).pipe(
      tap((actualizado) => {
        this.offlineDb.guardarPrestamoIndividual(actualizado);
        this.actualizarPrestamoEnMemoria(actualizado);
        this.cargarPrestamos('PENDIENTE', true).subscribe();
        this.cargarResumen().subscribe();
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 0) {
          return from(this.pagarCuotaOffline(id));
        }
        throw err;
      })
    );
  }

  private async pagarCuotaOffline(id: number): Promise<Prestamo> {
    const list = this.prestamos();
    const prestamo = list.find(p => p.id === id);
    if (!prestamo) throw new Error('Préstamo no encontrado');

    const nuevaCuota = prestamo.cuotas_pagadas + 1;
    const nuevoMontoPagado = Math.round((prestamo.monto_pagado + prestamo.cuota_mensual) * 100) / 100;
    const nuevoSaldo = Math.max(0, Math.round((prestamo.saldo_pendiente - prestamo.cuota_mensual) * 100) / 100);
    const estaPagado = nuevoSaldo === 0 || (prestamo.plazo_meses && nuevaCuota >= prestamo.plazo_meses);

    const mov: MovimientoPrestamo = {
      id: -Date.now(),
      prestamo_id: id,
      tipo: 'PAGO_CUOTA',
      monto: prestamo.cuota_mensual,
      detalle: `Pago de cuota ${nuevaCuota}/${prestamo.plazo_meses} (S/ ${prestamo.cuota_mensual.toFixed(2)}) - Guardado sin conexión`,
      fecha: new Date().toISOString()
    };

    const actualizado: Prestamo = {
      ...prestamo,
      cuotas_pagadas: nuevaCuota,
      monto_pagado: nuevoMontoPagado,
      saldo_pendiente: nuevoSaldo,
      estado: estaPagado ? 'PAGADO' : 'PENDIENTE',
      fecha_ultimo_pago: new Date().toISOString(),
      movimientos: [mov, ...(prestamo.movimientos || [])]
    };

    await this.offlineDb.guardarPrestamoIndividual(actualizado);
    await this.syncService.encolarAccion('PAGAR_CUOTA', {}, id);

    this.prestamos.update(arr => arr.map(p => p.id === id ? actualizado : p));
    this.recalcularResumenLocal(this.prestamos());

    return actualizado;
  }

  ampliarPrestamo(id: number, monto_adicional: number): Observable<Prestamo> {
    const body: PrestamoSobrePrestamoRequest = { monto_adicional };

    if (!this.syncService.isOnline() || id < 0) {
      return from(this.ampliarPrestamoOffline(id, monto_adicional));
    }

    return this.http.post<Prestamo>(`${this.apiUrl}/${id}/ampliar`, body).pipe(
      tap((actualizado) => {
        this.offlineDb.guardarPrestamoIndividual(actualizado);
        this.actualizarPrestamoEnMemoria(actualizado);
        this.cargarPrestamos('PENDIENTE', true).subscribe();
        this.cargarResumen().subscribe();
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 0) {
          return from(this.ampliarPrestamoOffline(id, monto_adicional));
        }
        throw err;
      })
    );
  }

  private async ampliarPrestamoOffline(id: number, monto_adicional: number): Promise<Prestamo> {
    const list = this.prestamos();
    const prestamo = list.find(p => p.id === id);
    if (!prestamo) throw new Error('Préstamo no encontrado');

    const nuevoCapital = Math.round((prestamo.monto_prestado + monto_adicional) * 100) / 100;
    const nuevoSaldo = Math.round((prestamo.saldo_pendiente + monto_adicional) * 100) / 100;
    const nuevoInteresMensual = Math.round((nuevoCapital * (prestamo.interes_porcentaje / 100)) * 100) / 100;

    const mov: MovimientoPrestamo = {
      id: -Date.now(),
      prestamo_id: id,
      tipo: 'PRESTAMO_SOBRE_PRESTAMO',
      monto: monto_adicional,
      detalle: `Ampliación de préstamo: +S/ ${monto_adicional.toFixed(2)} - Guardado sin conexión`,
      fecha: new Date().toISOString()
    };

    const actualizado: Prestamo = {
      ...prestamo,
      monto_prestado: nuevoCapital,
      saldo_pendiente: nuevoSaldo,
      interes_mensual_estimado: nuevoInteresMensual,
      movimientos: [mov, ...(prestamo.movimientos || [])]
    };

    await this.offlineDb.guardarPrestamoIndividual(actualizado);
    await this.syncService.encolarAccion('AMPLIAR_PRESTAMO', { monto_adicional }, id);

    this.prestamos.update(arr => arr.map(p => p.id === id ? actualizado : p));
    this.recalcularResumenLocal(this.prestamos());

    return actualizado;
  }

  registrarAbono(id: number, monto: number): Observable<Prestamo> {
    const body: AbonoRequest = { monto };

    if (!this.syncService.isOnline() || id < 0) {
      return from(this.registrarAbonoOffline(id, monto));
    }

    return this.http.post<Prestamo>(`${this.apiUrl}/${id}/abono`, body).pipe(
      tap((actualizado) => {
        this.offlineDb.guardarPrestamoIndividual(actualizado);
        this.actualizarPrestamoEnMemoria(actualizado);
        this.cargarPrestamos('PENDIENTE', true).subscribe();
        this.cargarResumen().subscribe();
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 0) {
          return from(this.registrarAbonoOffline(id, monto));
        }
        throw err;
      })
    );
  }

  private async registrarAbonoOffline(id: number, monto: number): Promise<Prestamo> {
    const list = this.prestamos();
    const prestamo = list.find(p => p.id === id);
    if (!prestamo) throw new Error('Préstamo no encontrado');

    const nuevoSaldo = Math.max(0, Math.round((prestamo.saldo_pendiente - monto) * 100) / 100);
    const nuevoMontoPagado = Math.round((prestamo.monto_pagado + monto) * 100) / 100;
    const nuevoCapital = Math.max(0, Math.round((prestamo.monto_prestado - monto) * 100) / 100);
    const nuevoInteres = Math.round((nuevoCapital * (prestamo.interes_porcentaje / 100)) * 100) / 100;
    const estaPagado = nuevoSaldo === 0;

    const mov: MovimientoPrestamo = {
      id: -Date.now(),
      prestamo_id: id,
      tipo: 'ABONO_CAPITAL',
      monto: monto,
      detalle: `Abono al capital: S/ ${monto.toFixed(2)} - Guardado sin conexión`,
      fecha: new Date().toISOString()
    };

    const actualizado: Prestamo = {
      ...prestamo,
      saldo_pendiente: nuevoSaldo,
      monto_prestado: nuevoCapital,
      monto_pagado: nuevoMontoPagado,
      interes_mensual_estimado: nuevoInteres,
      estado: estaPagado ? 'PAGADO' : 'PENDIENTE',
      fecha_ultimo_pago: new Date().toISOString(),
      movimientos: [mov, ...(prestamo.movimientos || [])]
    };

    await this.offlineDb.guardarPrestamoIndividual(actualizado);
    await this.syncService.encolarAccion('REGISTRAR_ABONO', { monto }, id);

    this.prestamos.update(arr => arr.map(p => p.id === id ? actualizado : p));
    this.recalcularResumenLocal(this.prestamos());

    return actualizado;
  }

  marcarPagado(id: number): Observable<Prestamo> {
    if (!this.syncService.isOnline() || id < 0) {
      return from(this.marcarPagadoOffline(id));
    }

    return this.http.put<Prestamo>(`${this.apiUrl}/${id}/pagar-todo`, {}).pipe(
      tap((actualizado) => {
        this.offlineDb.guardarPrestamoIndividual(actualizado);
        this.actualizarPrestamoEnMemoria(actualizado);
        this.cargarPrestamos('PENDIENTE', true).subscribe();
        this.cargarResumen().subscribe();
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 0) {
          return from(this.marcarPagadoOffline(id));
        }
        throw err;
      })
    );
  }

  private async marcarPagadoOffline(id: number): Promise<Prestamo> {
    const list = this.prestamos();
    const prestamo = list.find(p => p.id === id);
    if (!prestamo) throw new Error('Préstamo no encontrado');

    const montoLiquidar = prestamo.saldo_pendiente;
    const nuevoMontoPagado = Math.round((prestamo.monto_pagado + montoLiquidar) * 100) / 100;

    const mov: MovimientoPrestamo = {
      id: -Date.now(),
      prestamo_id: id,
      tipo: 'PAGO_TOTAL',
      monto: montoLiquidar,
      detalle: `Cancelación total de la deuda por S/ ${montoLiquidar.toFixed(2)} - Guardado sin conexión`,
      fecha: new Date().toISOString()
    };

    const actualizado: Prestamo = {
      ...prestamo,
      saldo_pendiente: 0,
      monto_pagado: nuevoMontoPagado,
      estado: 'PAGADO',
      fecha_ultimo_pago: new Date().toISOString(),
      movimientos: [mov, ...(prestamo.movimientos || [])]
    };

    await this.offlineDb.guardarPrestamoIndividual(actualizado);
    await this.syncService.encolarAccion('MARCAR_PAGADO', {}, id);

    this.prestamos.update(arr => arr.map(p => p.id === id ? actualizado : p));
    this.recalcularResumenLocal(this.prestamos());

    return actualizado;
  }

  private actualizarPrestamoEnMemoria(actualizado: Prestamo) {
    const list = this.prestamos();
    const idx = list.findIndex(p => p.id === actualizado.id);
    if (idx !== -1) {
      const copia = [...list];
      copia[idx] = actualizado;
      this.prestamos.set(copia);
    }
  }

  private removerPrestamoEnMemoria(id: number) {
    const list = this.prestamos();
    this.prestamos.set(list.filter(p => p.id !== id));
  }

  eliminarPrestamo(id: number): Observable<any> {
    if (!this.syncService.isOnline() || id < 0) {
      return from(this.eliminarPrestamoOffline(id));
    }

    return this.http.delete(`${this.apiUrl}/${id}`).pipe(
      tap(async () => {
        await this.offlineDb.eliminarPrestamoLocal(id);
        this.removerPrestamoEnMemoria(id);
        this.cargarPrestamos('PENDIENTE', true).subscribe();
        this.cargarResumen().subscribe();
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 0) {
          return from(this.eliminarPrestamoOffline(id));
        }
        throw err;
      })
    );
  }

  private async eliminarPrestamoOffline(id: number): Promise<boolean> {
    await this.offlineDb.eliminarPrestamoLocal(id);
    if (id > 0) {
      await this.syncService.encolarAccion('ELIMINAR_PRESTAMO', {}, id);
    }
    this.prestamos.update(list => list.filter(p => p.id !== id));
    this.recalcularResumenLocal(this.prestamos());
    return true;
  }

  obtenerPrestamo(id: number): Observable<Prestamo> {
    const local = this.prestamos().find(p => p.id === id);
    if (local && !this.syncService.isOnline()) {
      return of(local);
    }
    return this.http.get<Prestamo>(`${this.apiUrl}/${id}`).pipe(
      catchError(() => {
        if (local) return of(local);
        throw new Error('Préstamo no encontrado');
      })
    );
  }

  private filtrarPorEstado(prestamos: Prestamo[], estado?: string): Prestamo[] {
    if (!estado || estado === 'TODOS') return prestamos;
    return prestamos.filter(p => p.estado === estado);
  }

  private recalcularResumenLocal(prestamos: Prestamo[]): ResumenPrestamos {
    const totalPrestado = prestamos.reduce((sum, p) => sum + (p.monto_prestado || 0), 0);
    const totalCobrado = prestamos.reduce((sum, p) => sum + (p.monto_pagado || 0), 0);
    const totalPendiente = prestamos
      .filter(p => p.estado === 'PENDIENTE')
      .reduce((sum, p) => sum + (p.saldo_pendiente || 0), 0);
    const totalIntereses = prestamos.reduce((sum, p) => sum + (p.intereses_cobrados || 0), 0);
    const cantPendientes = prestamos.filter(p => p.estado === 'PENDIENTE').length;
    const cantPagados = prestamos.filter(p => p.estado === 'PAGADO').length;

    const resumen: ResumenPrestamos = {
      total_prestado: Math.round(totalPrestado * 100) / 100,
      total_cobrado: Math.round(totalCobrado * 100) / 100,
      total_pendiente: Math.round(totalPendiente * 100) / 100,
      total_intereses_cobrados: Math.round(totalIntereses * 100) / 100,
      cantidad_prestamos: prestamos.length,
      cantidad_pendientes: cantPendientes,
      cantidad_pagados: cantPagados
    };

    this.resumen.set(resumen);
    this.offlineDb.guardarMetadato('resumen', resumen);
    return resumen;
  }
}
