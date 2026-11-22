import { Component, EventEmitter, inject, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoanService } from '../loans/services/loan.service';
import { Prestamo, MovimientoPrestamo } from '../loans/models/loan.model';
import { WhatsappModalComponent, TipoMensajeWsp } from '../../shared/components/whatsapp-modal/whatsapp-modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, WhatsappModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  loanService = inject(LoanService);

  @Output() irAPrestamos = new EventEmitter<void>();

  todosPrestamos = signal<Prestamo[]>([]);
  filtroVista = signal<'PAGADO' | 'PENDIENTE' | 'TODOS'>('PAGADO');
  busquedaHistorial = signal<string>('');
  cargandoDatos = signal<boolean>(false);

  prestamoSeleccionado = signal<Prestamo | null>(null);
  movimientosCargados = signal<MovimientoPrestamo[]>([]);
  modalHistorialActivo = signal<boolean>(false);
  modalCronogramaActivo = signal<boolean>(false);
  modalWhatsAppActivo = signal<boolean>(false);
  tipoWhatsApp = signal<TipoMensajeWsp>('RECORDATORIO');

  ngOnInit() {
    this.cargarDatos();
  }

  cargarDatos() {
    this.cargandoDatos.set(true);
    this.loanService.cargarResumen().subscribe({
      error: () => this.cargandoDatos.set(false)
    });

    this.loanService.obtenerListado().subscribe({
      next: (data) => {
        this.todosPrestamos.set(data || []);
        this.cargandoDatos.set(false);
      },
      error: () => {
        this.cargandoDatos.set(false);
      }
    });
  }

  prestamosCancelados(): Prestamo[] {
    return this.todosPrestamos().filter(p => p.estado === 'PAGADO');
  }

  prestamosActivos(): Prestamo[] {
    return this.todosPrestamos().filter(p => p.estado !== 'PAGADO');
  }

  listaFiltrada(): Prestamo[] {
    const q = this.busquedaHistorial().toLowerCase().trim();
    let lista: Prestamo[];

    if (this.filtroVista() === 'PAGADO') {
      lista = this.prestamosCancelados();
    } else if (this.filtroVista() === 'PENDIENTE') {
      lista = this.prestamosActivos();
    } else {
      lista = this.todosPrestamos();
    }

    if (!q) return lista;
    return lista.filter(p =>
      p.cliente.toLowerCase().includes(q) ||
      (p.telefono && p.telefono.includes(q))
    );
  }

  calcularTasa(cobrado: number, prestado: number): number {
    if (!prestado || prestado <= 0) return 0;
    return Math.min(100, (cobrado / prestado) * 100);
  }

  obtenerInicial(nombre: string): string {
    return nombre ? nombre.trim().charAt(0).toUpperCase() : 'A';
  }

  formatearWhatsApp(tel: string): string {
    const limpio = tel.replace(/\D/g, '');
    const num = limpio.length === 9 ? `51${limpio}` : limpio;
    return `https://wa.me/${num}`;
  }

  abrirDetalleHistorial(p: Prestamo) {
    this.prestamoSeleccionado.set(p);
    this.modalHistorialActivo.set(true);
    this.modalCronogramaActivo.set(false);
    this.modalWhatsAppActivo.set(false);
    this.loanService.obtenerPrestamo(p.id).subscribe({
      next: (full) => {
        this.prestamoSeleccionado.set(full);
        this.movimientosCargados.set(full.movimientos || []);
      },
      error: () => {
        this.movimientosCargados.set(p.movimientos || []);
      }
    });
  }

  cerrarDetalleHistorial() {
    this.modalHistorialActivo.set(false);
    this.prestamoSeleccionado.set(null);
    this.movimientosCargados.set([]);
  }

  abrirCronograma(p: Prestamo) {
    this.prestamoSeleccionado.set(p);
    this.modalCronogramaActivo.set(true);
    this.modalHistorialActivo.set(false);
    this.modalWhatsAppActivo.set(false);
    this.loanService.obtenerPrestamo(p.id).subscribe({
      next: (full) => {
        this.prestamoSeleccionado.set(full);
      }
    });
  }

  cerrarCronograma() {
    this.modalCronogramaActivo.set(false);
    this.prestamoSeleccionado.set(null);
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

  abrirModalWhatsApp(p: Prestamo, tipo?: TipoMensajeWsp) {
    this.prestamoSeleccionado.set(p);
    this.modalWhatsAppActivo.set(true);
    this.modalHistorialActivo.set(false);
    this.modalCronogramaActivo.set(false);
    const tipoFinal = tipo || (this.estaMesCubierto(p) ? 'COMPROBANTE' : 'RECORDATORIO');
    this.tipoWhatsApp.set(tipoFinal);
  }

  cerrarModalWhatsApp() {
    this.modalWhatsAppActivo.set(false);
    this.prestamoSeleccionado.set(null);
  }

  eliminarPrestamoCancelado(p: Prestamo) {
    const texto = p.estado === 'PAGADO' 
      ? `¿Estás seguro de eliminar permanentemente el préstamo cancelado de ${p.cliente} del historial? Esta acción no se puede deshacer.`
      : `¿Estás seguro de eliminar el préstamo de ${p.cliente}?`;

    if (confirm(texto)) {
      this.loanService.eliminarPrestamo(p.id).subscribe({
        next: () => {
          this.cerrarDetalleHistorial();
          this.cargarDatos();
        },
        error: (err) => {
          console.error('Error al eliminar préstamo:', err);
        }
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
      case 'PAGO_TOTAL': return 'Liquidación Total';
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
