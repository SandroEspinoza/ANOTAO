from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Prestamo(Base):
    __tablename__ = "prestamos"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cliente = Column(String(120), nullable=False, index=True)
    telefono = Column(String(30), nullable=True)
    
    # Capital base acumulado prestado (en Soles S/)
    monto_prestado = Column(Float, nullable=False)
    
    # Porcentaje mensual (por defecto 10%)
    interes_porcentaje = Column(Float, default=10.0, nullable=False)
    
    # Modalidad: 'MENSUAL_LIBRE' (paga interés cada mes) o 'A_MESES' (cuotas fijas a N meses)
    modalidad = Column(String(20), default="MENSUAL_LIBRE", nullable=False)
    
    # Plazo en meses (para modalidad A_MESES)
    plazo_meses = Column(Integer, nullable=True)
    cuotas_pagadas = Column(Integer, default=0, nullable=False)
    meses_pagados = Column(Integer, default=0, nullable=False)
    
    # Cuota a pagar mensual (en Soles S/)
    cuota_mensual = Column(Float, default=0.0, nullable=False)
    interes_mensual_estimado = Column(Float, default=0.0, nullable=False)
    
    # Totales y saldos (en Soles S/)
    monto_total = Column(Float, nullable=False)
    monto_pagado = Column(Float, default=0.0, nullable=False)
    saldo_pendiente = Column(Float, nullable=False)
    intereses_cobrados = Column(Float, default=0.0, nullable=False)
    
    # Estado: PENDIENTE, PAGADO
    estado = Column(String(20), default="PENDIENTE", index=True, nullable=False)
    
    # Fechas
    fecha_prestamo = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_ultimo_pago = Column(DateTime, nullable=True)
    fecha_proximo_pago = Column(DateTime, nullable=True)
    dia_pago_mes = Column(Integer, default=1, nullable=False)

    # Usuario propietario del préstamo
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=True, index=True)
    usuario = relationship("User", back_populates="prestamos")

    # Relación con movimientos/historial
    movimientos = relationship(
        "MovimientoPrestamo",
        back_populates="prestamo",
        cascade="all, delete-orphan",
        order_by="desc(MovimientoPrestamo.fecha)"
    )

    @property
    def cronograma_meses(self):
        from app.core.dates import calcular_fecha_cobro, obtener_nombre_mes
        if not self.fecha_prestamo:
            return []

        dia_ancla = self.dia_pago_mes or self.fecha_prestamo.day
        if self.modalidad == "A_MESES":
            total_meses = self.plazo_meses or 1
            monto_mes = self.cuota_mensual
        else:
            # En modalidad libre:
            # - Si el préstamo ya está PAGADO (liquidado): solo muestra los meses reales pagados.
            # - Si está PENDIENTE: muestra los meses ya pagados + únicamente el mes en curso por cobrar.
            # No se generan meses futuros hipotéticos.
            if self.estado == "PAGADO":
                total_meses = max(self.meses_pagados, 1 if self.monto_pagado > 0 else 0)
            else:
                total_meses = self.meses_pagados + 1
            monto_mes = self.interes_mensual_estimado

        movimientos_pago = [
            m for m in sorted(self.movimientos or [], key=lambda x: x.fecha)
            if m.tipo in ("PAGO_INTERES_MES", "PAGO_CUOTA", "PAGO_TOTAL")
        ]

        hoy = datetime.utcnow().date()
        cronograma = []

        for i in range(1, total_meses + 1):
            fecha_cobro = calcular_fecha_cobro(self.fecha_prestamo, dia_ancla, i)
            nombre_mes = obtener_nombre_mes(fecha_cobro.month, fecha_cobro.year)

            if self.estado == "PAGADO":
                limite_pagado = self.plazo_meses if self.modalidad == "A_MESES" else max(self.meses_pagados, 1)
                estado_mes = "PAGADO" if i <= (limite_pagado or 1) else "FUTURO"
            elif i <= self.meses_pagados or (self.modalidad == "A_MESES" and i <= self.cuotas_pagadas):
                estado_mes = "PAGADO"
            elif i == (self.meses_pagados + 1):
                estado_mes = "VENCIDO" if hoy > fecha_cobro.date() else "POR_COBRAR"
            else:
                estado_mes = "FUTURO"

            fecha_pago = None
            detalle_pago = None
            if estado_mes == "PAGADO" and (i - 1) < len(movimientos_pago):
                pago = movimientos_pago[i - 1]
                fecha_pago = pago.fecha
                detalle_pago = pago.detalle
            elif estado_mes == "PAGADO" and self.fecha_ultimo_pago:
                fecha_pago = self.fecha_ultimo_pago
                detalle_pago = f"Pago registrado del mes de {nombre_mes}"

            cronograma.append({
                "numero": i,
                "mes_nombre": nombre_mes,
                "fecha_cobro": fecha_cobro,
                "monto": monto_mes,
                "estado": estado_mes,
                "fecha_pago": fecha_pago,
                "detalle_pago": detalle_pago
            })

        return cronograma


class MovimientoPrestamo(Base):
    __tablename__ = "movimientos_prestamo"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    prestamo_id = Column(Integer, ForeignKey("prestamos.id", ondelete="CASCADE"), nullable=False)
    
    # Tipo de evento:
    # 'CREACION', 'PAGO_INTERES_MES', 'PAGO_CUOTA', 'ABONO_CAPITAL', 'PAGO_TOTAL', 'PRESTAMO_SOBRE_PRESTAMO'
    tipo = Column(String(40), nullable=False)
    monto = Column(Float, nullable=False)
    detalle = Column(String(255), nullable=False)
    fecha = Column(DateTime, default=datetime.utcnow, nullable=False)

    prestamo = relationship("Prestamo", back_populates="movimientos")
