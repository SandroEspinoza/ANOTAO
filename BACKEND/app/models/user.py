from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base

class User(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nombre = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    telefono = Column(String(50), nullable=True)
    plan_tipo = Column(String(50), default="MENSUAL", nullable=False)
    fecha_vencimiento_plan = Column(DateTime, nullable=True)
    fecha_ultimo_pago = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    @property
    def dias_restantes_plan(self) -> int:
        if self.is_admin or self.plan_tipo == "ILIMITADO":
            return 9999
        if not self.fecha_vencimiento_plan:
            return 0
        diff = (self.fecha_vencimiento_plan - datetime.utcnow()).total_seconds()
        return max(0, int(diff // 86400) + 1) if diff > 0 else 0

    prestamos = relationship(
        "Prestamo",
        back_populates="usuario",
        cascade="all, delete-orphan",
        order_by="desc(Prestamo.fecha_prestamo)"
    )
