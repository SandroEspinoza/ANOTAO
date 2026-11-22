export type SyncActionType = 
  | 'CREAR_PRESTAMO'
  | 'PAGAR_INTERES'
  | 'PAGAR_CUOTA'
  | 'AMPLIAR_PRESTAMO'
  | 'REGISTRAR_ABONO'
  | 'MARCAR_PAGADO'
  | 'ELIMINAR_PRESTAMO';

export interface SyncQueueItem {
  queueId: string;
  action: SyncActionType;
  prestamoId?: number;
  clientTempId?: number;
  payload?: any;
  timestamp: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  error?: string;
}
