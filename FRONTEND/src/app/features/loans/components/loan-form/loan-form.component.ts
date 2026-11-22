import { Component, EventEmitter, inject, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoanService } from '../../services/loan.service';
import { PrestamoCreate } from '../../models/loan.model';

export interface CicloPreviewItem {
  numero: number;
  fechaStr: string;
  mesNombre: string;
  dia: number;
  ajusteFinMes: boolean;
  notaAjuste?: string;
}

export function calcularFechaCobroTS(fechaStr: string, mesesASumar: number): CicloPreviewItem {
  const partes = fechaStr.split('-');
  const anio = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10) - 1; // 0 a 11
  const diaAncla = parseInt(partes[2], 10);

  const totalMonths = anio * 12 + mes + mesesASumar;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;

  // Días que tiene el mes de destino
  const maxDias = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(diaAncla, maxDias);
  const ajusteFinMes = diaAncla > maxDias;

  const nombresMeses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  let notaAjuste: string | undefined;
  if (ajusteFinMes) {
    notaAjuste = `Ajustado al día ${targetDay} (fin de mes)`;
  } else if (diaAncla >= 29) {
    notaAjuste = `Día ${targetDay} (mantiene día original)`;
  }

  const dd = String(targetDay).padStart(2, '0');
  const mm = String(targetMonth + 1).padStart(2, '0');
  const fechaFormateada = `${dd}/${mm}/${targetYear}`;
  const mesNombre = `${nombresMeses[targetMonth]} ${targetYear}`;

  return {
    numero: mesesASumar,
    fechaStr: fechaFormateada,
    mesNombre,
    dia: targetDay,
    ajusteFinMes,
    notaAjuste
  };
}

@Component({
  selector: 'app-loan-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './loan-form.component.html',
  styleUrl: './loan-form.component.css'
})
export class LoanFormComponent {
  private loanService = inject(LoanService);

  @Output() cerrar = new EventEmitter<void>();

  guardando = signal<boolean>(false);
  mensajeError = signal<string | null>(null);

  form: PrestamoCreate = {
    cliente: '',
    telefono: '',
    monto_prestado: 100,
    interes_porcentaje: 10.0,
    modalidad: 'MENSUAL_LIBRE',
    plazo_meses: 3,
    fecha_prestamo: new Date().toISOString().substring(0, 10)
  };

  seleccionarHoy() {
    this.form.fecha_prestamo = new Date().toISOString().substring(0, 10);
  }

  seleccionarAyer() {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    this.form.fecha_prestamo = ayer.toISOString().substring(0, 10);
  }

  calcularProximoCobro(): string {
    if (!this.form.fecha_prestamo) return '';
    try {
      const item = calcularFechaCobroTS(this.form.fecha_prestamo, 1);
      return item.fechaStr;
    } catch {
      return '';
    }
  }

  obtenerDiaPago(): number {
    if (!this.form.fecha_prestamo) return new Date().getDate();
    try {
      const partes = this.form.fecha_prestamo.split('-');
      return parseInt(partes[2], 10) || new Date().getDate();
    } catch {
      return new Date().getDate();
    }
  }

  cambiarMonto(delta: number) {
    const actual = Number(this.form.monto_prestado) || 0;
    this.form.monto_prestado = Math.max(1, actual + delta);
  }

  cambiarInteres(delta: number) {
    const actual = Number(this.form.interes_porcentaje) || 0;
    this.form.interes_porcentaje = Math.max(0, actual + delta);
  }

  cambiarMeses(delta: number) {
    const actual = Number(this.form.plazo_meses) || 1;
    this.form.plazo_meses = Math.max(1, Math.min(60, actual + delta));
  }

  setMonto(val: number) {
    this.form.monto_prestado = val;
  }

  setInteres(val: number) {
    this.form.interes_porcentaje = val;
  }

  setMeses(val: number) {
    this.form.plazo_meses = val;
  }

  calcularInteresMensual(): number {
    const capital = this.form.monto_prestado || 0;
    const pct = this.form.interes_porcentaje || 0;
    return (capital * pct) / 100.0;
  }

  calcularInteresTotalMeses(): number {
    const capital = this.form.monto_prestado || 0;
    const pct = this.form.interes_porcentaje || 0;
    const meses = this.form.plazo_meses || 1;
    return (capital * (pct / 100.0)) * meses;
  }

  calcularTotalMeses(): number {
    const capital = this.form.monto_prestado || 0;
    return capital + this.calcularInteresTotalMeses();
  }

  calcularCuotaMensual(): number {
    const total = this.calcularTotalMeses();
    const meses = this.form.plazo_meses || 1;
    return total / (meses > 0 ? meses : 1);
  }

  esValido(): boolean {
    const clienteValido = this.form.cliente.trim().length >= 2;
    const montoValido = this.form.monto_prestado > 0;
    const interesValido = this.form.interes_porcentaje >= 0;
    const mesesValidos = this.form.modalidad === 'MENSUAL_LIBRE' || (this.form.plazo_meses && this.form.plazo_meses >= 1);
    return clienteValido && montoValido && interesValido && !!mesesValidos;
  }

  guardar() {
    if (!this.esValido()) return;

    this.guardando.set(true);

    const payload: PrestamoCreate = {
      cliente: this.form.cliente.trim(),
      telefono: this.form.telefono ? this.form.telefono.trim() : undefined,
      monto_prestado: Number(this.form.monto_prestado),
      interes_porcentaje: Number(this.form.interes_porcentaje),
      modalidad: this.form.modalidad,
      plazo_meses: this.form.modalidad === 'A_MESES' ? Number(this.form.plazo_meses) : undefined,
      fecha_prestamo: this.form.fecha_prestamo ? `${this.form.fecha_prestamo}T12:00:00` : undefined
    };

    this.loanService.crearPrestamo(payload).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar.emit();
      },
      error: (err) => {
        this.guardando.set(false);
        const detalle = err.error?.detail || err.message;
        if (!detalle || err.status === 0) {
          this.mensajeError.set('No se pudo comunicar con el servidor backend (FastAPI). Por favor verifica que el backend esté ejecutándose en http://127.0.0.1:8000.');
        } else {
          this.mensajeError.set(detalle);
        }
      }
    });
  }
}
