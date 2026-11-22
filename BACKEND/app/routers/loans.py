from typing import Optional, List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.loan import (
    PrestamoCreate,
    PrestamoResponse,
    AbonoRequest,
    PagoInteresRequest,
    PrestamoSobrePrestamoRequest,
    ResumenPrestamos
)
from app.services.loan_service import loan_service

router = APIRouter(prefix="/prestamos", tags=["Préstamos"])

@router.get("/resumen", response_model=ResumenPrestamos)
def obtener_resumen(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene métricas globales del usuario actual en Soles (S/)"""
    return loan_service.obtener_resumen(db, current_user.id)

@router.get("", response_model=List[PrestamoResponse])
def listar_prestamos(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todos los préstamos del usuario actual, opcionalmente filtrados por estado"""
    return loan_service.listar_prestamos(db, current_user.id, estado)

@router.post("", response_model=PrestamoResponse, status_code=status.HTTP_201_CREATED)
def crear_prestamo(
    datos: PrestamoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Registra un nuevo préstamo para una persona bajo la cuenta del usuario actual"""
    return loan_service.crear_prestamo(db, datos, current_user.id)

@router.get("/{loan_id}", response_model=PrestamoResponse)
def obtener_prestamo(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene el detalle completo de un préstamo perteneciente al usuario actual"""
    return loan_service.obtener_prestamo(db, loan_id, current_user.id)

@router.post("/{loan_id}/pagar-interes", response_model=PrestamoResponse)
def pagar_interes(
    loan_id: int,
    pago: Optional[PagoInteresRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Marca como pagado el interés mensual del préstamo"""
    monto = pago.monto if pago else None
    return loan_service.pagar_interes_mes(db, loan_id, current_user.id, monto)

@router.post("/{loan_id}/pagar-cuota", response_model=PrestamoResponse)
def pagar_cuota(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Paga la cuota mensual de un préstamo a meses o el interés mensual si es libre"""
    return loan_service.pagar_cuota_mes(db, loan_id, current_user.id)

@router.post("/{loan_id}/ampliar", response_model=PrestamoResponse)
def agregar_prestamo_sobre_prestamo(
    loan_id: int,
    datos: PrestamoSobrePrestamoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Agrega un monto al mismo préstamo (préstamo sobre préstamo)."""
    return loan_service.agregar_prestamo_sobre_prestamo(db, loan_id, current_user.id, datos.monto_adicional)

@router.post("/{loan_id}/abono", response_model=PrestamoResponse)
def registrar_abono(
    loan_id: int,
    abono: AbonoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Registra una amortización o abono parcial a la deuda en Soles"""
    return loan_service.registrar_abono(db, loan_id, current_user.id, abono.monto)

@router.put("/{loan_id}/pagar-todo", response_model=PrestamoResponse)
def marcar_pagado_total(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Marca un préstamo como cancelado en su totalidad (pagó todo)"""
    return loan_service.marcar_como_pagado(db, loan_id, current_user.id)

@router.delete("/{loan_id}", status_code=status.HTTP_200_OK)
def eliminar_prestamo(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina el registro de un préstamo y su historial asociado"""
    return loan_service.eliminar_prestamo(db, loan_id, current_user.id)
