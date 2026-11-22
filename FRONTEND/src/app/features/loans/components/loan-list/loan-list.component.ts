import { Component, EventEmitter, inject, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoanService } from '../../services/loan.service';
import { Prestamo, MovimientoPrestamo } from '../../models/loan.model';
import { WhatsappModalComponent, TipoMensajeWsp } from '../../../../shared/components/whatsapp-modal/whatsapp-modal.component';

@Component({
  selector: 'app-loan-list',
  standalone: true,
  imports: [CommonModule, FormsModule, WhatsappModalComponent],
  templateUrl: './loan-list.component.html',
  styleUrl: './loan-list.component.css'
})
export class LoanListComponent implements OnInit {
  loanService = inject(LoanService);
  busqueda = signal<string>('');

  @Output() abrirModal = new EventEmitter<void>();
  @Output() irAResumen = new EventEmitter<void>();

  prestamoSeleccionado = signal<Prestamo | null>(null);
  accionActiva = signal<string | null>(null);
  mensajeError = signal<string | null>(null);
  modalWhatsAppActivo = signal<boolean>(false);
  tipoWhatsApp = signal<TipoMensajeWsp>('RECORDATORIO');

  montoInteresInput = 0;
  montoAmpliarInput = 0;
  montoAbonoInput = 0;
  movimientosCargados = signal<MovimientoPrestamo[]>([]);

  ngOnInit() {
    this.loanService.cargarPrestamos('PENDIENTE').subscribe();
    this.loanService.cargarResumen().subscribe();
  }

  prestamosFiltrados(): Prestamo[] {
    const query = this.busqueda().toLowerCase().trim();
    // Excluir préstamos ya pagados para mantener la pantalla libre de historial
    const lista = this.loanService.prestamos().filter(p => p.estado !== 'PAGADO');
    if (!query) return lista;
    return lista.filter(p => 
      p.cliente.toLowerCase().includes(query) || 
      (p.telefono && p.telefono.includes(query))
    );
  }

  pendientesCount(): number {
    return this.loanService.resumen()?.cantidad_pendientes || 0;
  }

  pagadosCount(): number {
    return this.loanService.resumen()?.cantidad_pagados || 0;
  }

  formatearFechaCorta(fechaStr?: string): string {
    if (!fechaStr) return '';
    try {
      const d = new Date(fechaStr);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const anio = d.getFullYear();
      return `${dia}/${mes}/${anio}`;
    } catch {
      return '';
    }
  }

  calcularProximaFecha(fechaStr?: string, diaAncla?: number): string {
    if (!fechaStr) return '';
    try {
      const d = new Date(fechaStr);
      const ancla = diaAncla || d.getDate();
      let year = d.getFullYear();
      let month = d.getMonth() + 1; // siguiente mes (0-indexed)
      if (month > 11) {
        month = 0;
        year += 1;
      }
      const maxDias = new Date(year, month + 1, 0).getDate();
      const targetDay = Math.min(ancla, maxDias);
      const dia = String(targetDay).padStart(2, '0');
      const mes = String(month + 1).padStart(2, '0');
      return `${dia}/${mes}/${year}`;
    } catch {
      return '';
    }
  }

  getEstadoCiclo(p: Prestamo): { texto: string; clase: string; icono: string } {
    if (!p.fecha_proximo_pago) {
      return { texto: 'Al día', clase: 'ciclo-aldia', icono: '🟢' };
    }
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const proximo = new Date(p.fecha_proximo_pago);
    proximo.setHours(0, 0, 0, 0);

    // Si la fecha ya venció
    if (proximo.getTime() < hoy.getTime()) {
      return {
        texto: `Cobro Vencido (${this.formatearFechaCorta(p.fecha_proximo_pago)})`,
        clase: 'ciclo-vencido',
        icono: '🔴'
      };
    }

    // Si pagó adelantado (más de 32 días en el futuro respecto a hoy)
    const diasDiferencia = Math.round((proximo.getTime() - hoy.getTime()) / (1000 * 3600 * 24));
    if (diasDiferencia > 32) {
      return {
        texto: `Adelantado (Cubierto hasta ${this.formatearFechaCorta(p.fecha_proximo_pago)})`,
        clase: 'ciclo-adelantado',
        icono: '⚡'
      };
    }

    return {
      texto: `Próximo Cobro: ${this.formatearFechaCorta(p.fecha_proximo_pago)}`,
      clase: 'ciclo-aldia',
      icono: '📅'
    };
  }

  calcularNuevoCapitalTrasAbono(): number {
    const p = this.prestamoSeleccionado();
    if (!p) return 0;
    return Math.max(0, p.saldo_pendiente - (this.montoAbonoInput || 0));
  }

  calcularNuevoInteresTrasAbono(): number {
    const p = this.prestamoSeleccionado();
    if (!p) return 0;
    const capital = this.calcularNuevoCapitalTrasAbono();
    return (capital * p.interes_porcentaje) / 100.0;
  }

  obtenerInicial(nombre: string): string {
    return nombre ? nombre.trim().charAt(0).toUpperCase() : 'A';
  }

  formatearWhatsApp(tel: string): string {
    const limpio = tel.replace(/\D/g, '');
    const num = limpio.length === 9 ? `51${limpio}` : limpio;
    return `https://wa.me/${num}`;
  }

  calcularPorcentaje(pagado: number, total: number): number {
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.round((pagado / total) * 100));
  }

  maxVal(min: number, val: number): number {
    return Math.max(min, val);
  }

  minVal(max: number, val: number): number {
    return Math.min(max, val);
  }

  estaMesCubierto(p: Prestamo): boolean {
    if (p.estado === 'PAGADO') return true;
    if (!p.fecha_proximo_pago) return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const proximo = new Date(p.fecha_proximo_pago);
    proximo.setHours(0, 0, 0, 0);
    return proximo.getTime() > hoy.getTime();
  }

  abrirModalWhatsApp(prestamo: Prestamo, tipo?: TipoMensajeWsp) {
    this.prestamoSeleccionado.set(prestamo);
    const tipoFinal = tipo || (this.estaMesCubierto(prestamo) ? 'COMPROBANTE' : 'RECORDATORIO');
    this.tipoWhatsApp.set(tipoFinal);
    this.modalWhatsAppActivo.set(true);
  }

  cerrarModalWhatsApp() {
    this.modalWhatsAppActivo.set(false);
  }

  abrirModalInteres(prestamo: Prestamo) {
    this.prestamoSeleccionado.set(prestamo);
    this.montoInteresInput = prestamo.interes_mensual_estimado;
    this.accionActiva.set('PAGAR_INTERES');
  }

  abrirModalCuota(prestamo: Prestamo) {
    this.prestamoSeleccionado.set(prestamo);
    this.accionActiva.set('PAGAR_CUOTA');
  }

  abrirModalAmpliar(prestamo: Prestamo) {
    this.prestamoSeleccionado.set(prestamo);
    this.montoAmpliarInput = 50;
    this.accionActiva.set('AMPLIAR');
  }

  abrirModalAbono(prestamo: Prestamo) {
    this.prestamoSeleccionado.set(prestamo);
    this.montoAbonoInput = Math.min(20, prestamo.saldo_pendiente);
    this.accionActiva.set('ABONAR');
  }

  abrirModalPagarTodo(prestamo: Prestamo) {
    this.prestamoSeleccionado.set(prestamo);
    this.accionActiva.set('PAGAR_TODO');
  }

  abrirModalCronograma(prestamo: Prestamo) {
    this.prestamoSeleccionado.set(prestamo);
    this.accionActiva.set('CRONOGRAMA');
    this.loanService.obtenerPrestamo(prestamo.id).subscribe({
      next: (full) => {
        this.prestamoSeleccionado.set(full);
      }
    });
  }

  abrirModalHistorial(prestamo: Prestamo) {
    this.prestamoSeleccionado.set(prestamo);
    this.loanService.obtenerPrestamo(prestamo.id).subscribe({
      next: (full) => {
        this.movimientosCargados.set(full.movimientos || []);
        this.accionActiva.set('HISTORIAL');
      },
      error: () => {
        this.movimientosCargados.set(prestamo.movimientos || []);
        this.accionActiva.set('HISTORIAL');
      }
    });
  }

  cerrarModalesAccion() {
    this.prestamoSeleccionado.set(null);
    this.accionActiva.set(null);
    this.movimientosCargados.set([]);
  }

  calcularNuevoInteresLibre(): number {
    const p = this.prestamoSeleccionado();
    if (!p) return 0;
    const nuevoCapital = p.saldo_pendiente + (this.montoAmpliarInput || 0);
    return (nuevoCapital * p.interes_porcentaje) / 100.0;
  }

  calcularNuevaCuotaMeses(): number {
    const p = this.prestamoSeleccionado();
    if (!p) return 0;
    const mesesRestantes = Math.max(1, (p.plazo_meses || 1) - p.cuotas_pagadas);
    const intAdicional = (this.montoAmpliarInput || 0) * (p.interes_porcentaje / 100.0) * mesesRestantes;
    const nuevoSaldo = p.saldo_pendiente + (this.montoAmpliarInput || 0) + intAdicional;
    return nuevoSaldo / mesesRestantes;
  }

  mostrarError(err: any, fallback: string) {
    const detalle = err.error?.detail || err.message;
    if (!detalle || err.status === 0) {
      this.mensajeError.set('No se pudo conectar con el servidor backend (FastAPI en http://127.0.0.1:8000).');
    } else {
      this.mensajeError.set(detalle || fallback);
    }
  }

  confirmarPagoInteres() {
    const p = this.prestamoSeleccionado();
    if (!p) return;
    this.loanService.pagarInteres(p.id, this.montoInteresInput).subscribe({
      next: () => this.cerrarModalesAccion(),
      error: (err) => this.mostrarError(err, 'Error al registrar pago de interés')
    });
  }

  confirmarPagoCuota() {
    const p = this.prestamoSeleccionado();
    if (!p) return;
    this.loanService.pagarCuota(p.id).subscribe({
      next: () => this.cerrarModalesAccion(),
      error: (err) => this.mostrarError(err, 'Error al registrar pago de cuota')
    });
  }

  confirmarAmpliacion() {
    const p = this.prestamoSeleccionado();
    if (!p || this.montoAmpliarInput <= 0) return;
    this.loanService.ampliarPrestamo(p.id, this.montoAmpliarInput).subscribe({
      next: () => this.cerrarModalesAccion(),
      error: (err) => this.mostrarError(err, 'Error al ampliar el préstamo')
    });
  }

  confirmarAbono() {
    const p = this.prestamoSeleccionado();
    if (!p || this.montoAbonoInput <= 0) return;
    if (this.montoAbonoInput > p.saldo_pendiente) {
      this.mostrarError(
        null,
        `No es posible abonar S/ ${this.montoAbonoInput.toFixed(2)}. El monto no puede superar el capital adeudado actual de S/ ${p.saldo_pendiente.toFixed(2)}.`
      );
      return;
    }
    this.loanService.registrarAbono(p.id, this.montoAbonoInput).subscribe({
      next: () => this.cerrarModalesAccion(),
      error: (err) => this.mostrarError(err, 'Error al registrar abono')
    });
  }

  confirmarPagarTodo() {
    const p = this.prestamoSeleccionado();
    if (!p) return;
    this.loanService.marcarPagado(p.id).subscribe({
      next: () => this.cerrarModalesAccion(),
      error: (err) => this.mostrarError(err, 'Error al cancelar la deuda')
    });
  }

  eliminar(prestamo: Prestamo) {
    if (confirm(`¿Deseas eliminar definitivamente el préstamo de ${prestamo.cliente}?`)) {
      this.cerrarModalesAccion();
      this.loanService.eliminarPrestamo(prestamo.id).subscribe({
        error: (err) => this.mostrarError(err, 'Error al eliminar el préstamo')
      });
    }
  }

  formatearTipo(tipo: string): string {
    switch (tipo) {
      case 'CREACION': return 'Préstamo Inicial';
      case 'PAGO_INTERES_MES': return 'Interés del Mes';
      case 'PAGO_CUOTA': return 'Cuota Mensual';
      case 'ABONO_CAPITAL': return 'Abono Capital';
      case 'PRESTAMO_SOBRE_PRESTAMO': return 'Préstamo Adicional';
      case 'PAGO_TOTAL': return 'Cancelación Total';
      default: return tipo;
    }
  }

  getTipoIcono(tipo: string): string {
    switch (tipo) {
      case 'CREACION': return '💰';
      case 'PAGO_INTERES_MES': return '📅';
      case 'PAGO_CUOTA': return '🗓️';
      case 'ABONO_CAPITAL': return '💵';
      case 'PRESTAMO_SOBRE_PRESTAMO': return '➕';
      case 'PAGO_TOTAL': return '✅';
      default: return '📌';
    }
  }

  getTipoClase(tipo: string): string {
    switch (tipo) {
      case 'CREACION': return 'tl-creacion';
      case 'PAGO_INTERES_MES': return 'tl-interes';
      case 'PAGO_CUOTA': return 'tl-cuota';
      case 'ABONO_CAPITAL': return 'tl-abono';
      case 'PRESTAMO_SOBRE_PRESTAMO': return 'tl-ampliar';
      case 'PAGO_TOTAL': return 'tl-total';
      default: return '';
    }
  }
}
