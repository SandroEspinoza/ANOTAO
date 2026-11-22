export interface MovimientoPrestamo {
  id: number;
  prestamo_id: number;
  tipo: 'CREACION' | 'PAGO_INTERES_MES' | 'PAGO_CUOTA' | 'ABONO_CAPITAL' | 'PAGO_TOTAL' | 'PRESTAMO_SOBRE_PRESTAMO';
  monto: number;
  detalle: string;
  fecha: string;
}

export interface MesCronograma {
  numero: number;
  mes_nombre: string;
  fecha_cobro: string;
  monto: number;
  estado: 'PAGADO' | 'POR_COBRAR' | 'VENCIDO' | 'FUTURO';
  fecha_pago?: string;
  detalle_pago?: string;
}

export interface Prestamo {
  id: number;
  cliente: string;
  telefono?: string;
  monto_prestado: number;
  interes_porcentaje: number;
  modalidad: 'MENSUAL_LIBRE' | 'A_MESES';
  plazo_meses?: number;
  cuotas_pagadas: number;
  meses_pagados: number;
  cuota_mensual: number;
  interes_mensual_estimado: number;
  monto_total: number;
  monto_pagado: number;
  saldo_pendiente: number;
  intereses_cobrados: number;
  estado: 'PENDIENTE' | 'PAGADO';
  fecha_prestamo: string;
  fecha_ultimo_pago?: string;
  fecha_proximo_pago?: string;
  dia_pago_mes: number;
  movimientos?: MovimientoPrestamo[];
  cronograma_meses?: MesCronograma[];
}

export interface PrestamoCreate {
  cliente: string;
  telefono?: string;
  monto_prestado: number;
  interes_porcentaje: number;
  modalidad: 'MENSUAL_LIBRE' | 'A_MESES';
  plazo_meses?: number;
  fecha_prestamo?: string;
}

export interface AbonoRequest {
  monto: number;
}

export interface PagoInteresRequest {
  monto?: number;
}

export interface PrestamoSobrePrestamoRequest {
  monto_adicional: number;
}

export interface ResumenPrestamos {
  total_prestado: number;
  total_cobrado: number;
  total_pendiente: number;
  total_intereses_cobrados: number;
  cantidad_prestamos: number;
  cantidad_pendientes: number;
  cantidad_pagados: number;
}
