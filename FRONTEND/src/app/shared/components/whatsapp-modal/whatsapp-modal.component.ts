import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Prestamo } from '../../../features/loans/models/loan.model';
import { AuthService } from '../../../core/services/auth.service';

export type TipoMensajeWsp = 'RECORDATORIO' | 'VENCIDO' | 'COMPROBANTE';

@Component({
  selector: 'app-whatsapp-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whatsapp-modal.component.html',
  styleUrl: './whatsapp-modal.component.css'
})
export class WhatsappModalComponent implements OnInit {
  private authService = inject(AuthService);

  @Input({ required: true }) prestamo!: Prestamo;
  @Input() tipoInicial: TipoMensajeWsp = 'RECORDATORIO';
  @Output() cerrar = new EventEmitter<void>();

  tipoActual = signal<TipoMensajeWsp>('RECORDATORIO');
  telefonoDestino = signal<string>('');
  mensajeTexto = signal<string>('');
  copiadoExito = signal<boolean>(false);
  errorTelefono = signal<string | null>(null);

  estaMesCubierto(): boolean {
    if (this.prestamo.estado === 'PAGADO') return true;
    if (!this.prestamo.fecha_proximo_pago) return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const proximo = new Date(this.prestamo.fecha_proximo_pago);
    proximo.setHours(0, 0, 0, 0);
    return proximo.getTime() > hoy.getTime();
  }

  ngOnInit(): void {
    const cubierto = this.estaMesCubierto();
    // Si el mes ya está cubierto, se bloquea recordatorio/vencido y se preselecciona comprobante
    const tipoDefecto = cubierto ? 'COMPROBANTE' : this.tipoInicial;
    this.tipoActual.set(tipoDefecto);
    this.telefonoDestino.set(this.prestamo.telefono || '');
    this.actualizarMensaje(tipoDefecto);
  }

  cambiarTipo(tipo: TipoMensajeWsp): void {
    // Si el mes ya está cubierto, bloquear opciones de cobranza
    if (this.estaMesCubierto() && (tipo === 'RECORDATORIO' || tipo === 'VENCIDO')) {
      return;
    }
    this.tipoActual.set(tipo);
    this.actualizarMensaje(tipo);
  }

  actualizarMensaje(tipo: TipoMensajeWsp): void {
    const p = this.prestamo;
    const remitente = this.authService.currentUser()?.nombre || 'ANOTAO';
    const cliente = p.cliente.trim();
    
    const fechaCobro = p.fecha_proximo_pago
      ? new Date(p.fecha_proximo_pago).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : `Día ${p.dia_pago_mes}`;

    const montoCobro = p.modalidad === 'A_MESES'
      ? p.cuota_mensual.toFixed(2)
      : p.interes_mensual_estimado.toFixed(2);

    const modalidadNombre = p.modalidad === 'A_MESES' ? 'la cuota mensual' : 'el interés mensual';
    const saldo = p.saldo_pendiente.toFixed(2);

    let texto = '';

    if (tipo === 'RECORDATORIO') {
      texto = `Hola ${cliente}, te saluda ${remitente}. 👋\n\nTe recuerdo cordialmente que la fecha de cobro de ${modalidadNombre} (S/ ${montoCobro}) es el ${fechaCobro}.\nSaldo pendiente: S/ ${saldo}.\n\nCualquier consulta me avisas. ¡Muchas gracias!`;
    } else if (tipo === 'VENCIDO') {
      texto = `Estimado(a) ${cliente}, te saluda ${remitente}. ⚠️\n\nTe escribo para recordarte que el pago de ${modalidadNombre} por S/ ${montoCobro} venció el día ${fechaCobro} y figura pendiente.\n\nPor favor coordinemos para regularizarlo a la brevedad. Quedo atento(a) a tu respuesta. ¡Muchas gracias!`;
    } else {
      // COMPROBANTE
      const ultimoMov = p.movimientos && p.movimientos.length > 0 ? p.movimientos[0] : null;
      const montoPagado = ultimoMov ? ultimoMov.monto.toFixed(2) : montoCobro;
      const detalle = ultimoMov ? ultimoMov.detalle : (p.estado === 'PAGADO' ? 'Cancelación total de la deuda' : 'Pago de cuota/interés');
      const estadoTexto = p.estado === 'PAGADO' ? '✅ Cancelado en su totalidad' : `⏳ Saldo pendiente restante: S/ ${saldo}`;

      texto = `Hola ${cliente}, te saluda ${remitente}. ✅\n\nConfirmamos la recepción de tu pago por S/ ${montoPagado}.\n📋 Detalle: ${detalle}\n💰 ${estadoTexto}.\n\n¡Muchas gracias por tu pago y puntualidad!`;
    }

    this.mensajeTexto.set(texto);
  }

  enviarWhatsApp(): void {
    this.errorTelefono.set(null);
    const tel = this.telefonoDestino().trim();
    const limpio = tel.replace(/\D/g, '');

    if (!limpio) {
      this.errorTelefono.set('Por favor ingresa un número de teléfono celular para enviar el mensaje.');
      return;
    }

    const numeroFinal = limpio.length === 9 ? `51${limpio}` : limpio;
    const mensajeCodificado = encodeURIComponent(this.mensajeTexto());
    const url = `https://wa.me/${numeroFinal}?text=${mensajeCodificado}`;

    window.open(url, '_blank');
    this.cerrar.emit();
  }

  copiarTexto(): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(this.mensajeTexto()).then(() => {
        this.copiadoExito.set(true);
        setTimeout(() => this.copiadoExito.set(false), 2000);
      });
    }
  }
}
