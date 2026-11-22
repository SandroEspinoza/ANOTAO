from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.loan import Prestamo, MovimientoPrestamo

class LoanRepository:
    @staticmethod
    def get_all(db: Session, usuario_id: int, estado: Optional[str] = None) -> List[Prestamo]:
        query = db.query(Prestamo).filter(Prestamo.usuario_id == usuario_id)
        if estado:
            query = query.filter(Prestamo.estado == estado.upper())
        return query.order_by(Prestamo.fecha_prestamo.desc()).all()

    @staticmethod
    def get_by_id(db: Session, loan_id: int, usuario_id: Optional[int] = None) -> Optional[Prestamo]:
        query = db.query(Prestamo).filter(Prestamo.id == loan_id)
        if usuario_id is not None:
            query = query.filter(Prestamo.usuario_id == usuario_id)
        return query.first()

    @staticmethod
    def create(db: Session, prestamo: Prestamo) -> Prestamo:
        db.add(prestamo)
        db.commit()
        db.refresh(prestamo)
        return prestamo

    @staticmethod
    def update(db: Session, prestamo: Prestamo) -> Prestamo:
        db.commit()
        db.refresh(prestamo)
        return prestamo

    @staticmethod
    def delete(db: Session, prestamo: Prestamo) -> None:
        db.delete(prestamo)
        db.commit()

    @staticmethod
    def add_movement(db: Session, movimiento: MovimientoPrestamo) -> MovimientoPrestamo:
        db.add(movimiento)
        db.commit()
        db.refresh(movimiento)
        return movimiento

loan_repository = LoanRepository()
