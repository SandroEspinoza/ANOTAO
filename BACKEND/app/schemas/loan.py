from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class PrestamoCreate(BaseModel):
    cliente: str = Field(..., min_length=2, max_length=120, description="Nombre de la persona")
    telefono: Optional[str] = Field(None, max_length=30, description="Teléfono o WhatsApp opcional")
    monto_prestado: float = Field(..., gt=0, description="Monto prestado en Soles (S/)")
    interes_porcentaje: float = Field(10.0, ge=0, description="Porcentaje de interés mensual (por defecto 10%)")
    modalidad: str = Field("MENSUAL_LIBRE", description="'MENSUAL_LIBRE' o 'A_MESES'")
    plazo_meses: Optional[int] = Field(None, ge=1, le=120, description="Número de meses si es a plazo fijo")
    fecha_prestamo: Optional[datetime] = Field(None, description="Fecha en que se otorgó el préstamo (por defecto hoy)")

class AbonoRequest(BaseModel):
    monto: float = Field(..., gt=0, description="Monto del abono en Soles (S/) que amortiza el capital")

class PagoInteresRequest(BaseModel):
    monto: Optional[float] = Field(None, gt=0, description="Monto del interés pagado")

class PrestamoSobrePrestamoRequest(BaseModel):
    monto_adicional: float = Field(..., gt=0, description="Monto adicional a sumar al capital prestado en Soles (S/)")

class MovimientoResponse(BaseModel):
    id: int
    prestamo_id: int
    tipo: str
    monto: float
    detalle: str
    fecha: datetime

    class Config:
        from_attributes = True

class MesCronograma(BaseModel):
    numero: int
    mes_nombre: str
    fecha_cobro: datetime
    monto: float
    estado: str
    fecha_pago: Optional[datetime] = None
    detalle_pago: Optional[str] = None

    class Config:
        from_attributes = True

class PrestamoResponse(BaseModel):
    id: int
    cliente: str
    telefono: Optional[str] = None
    monto_prestado: float
    interes_porcentaje: float
    modalidad: str
    plazo_meses: Optional[int] = None
    cuotas_pagadas: int
    meses_pagados: int = 0
    cuota_mensual: float
    interes_mensual_estimado: float
    monto_total: float
    monto_pagado: float
    saldo_pendiente: float
    intereses_cobrados: float
    estado: str
    fecha_prestamo: datetime
    fecha_ultimo_pago: Optional[datetime] = None
    fecha_proximo_pago: Optional[datetime] = None
    dia_pago_mes: int
    movimientos: List[MovimientoResponse] = []
    cronograma_meses: List[MesCronograma] = []

    class Config:
        from_attributes = True

class ResumenPrestamos(BaseModel):
    total_prestado: float
    total_cobrado: float
    total_pendiente: float
    total_intereses_cobrados: float
    cantidad_prestamos: int
    cantidad_pendientes: int
    cantidad_pagados: int
