from typing import List
import calendar
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.database import get_db
from app.core.security import get_current_admin_user, hash_password
from app.models.user import User
from app.models.loan import Prestamo
from app.schemas.user import UserAdminItem, UserAdminStatusUpdate, UserAdminPasswordReset

router = APIRouter(prefix="/admin", tags=["Panel de Administración"])

def sumar_mes_calendario(fecha_base: datetime, meses: int = 1) -> datetime:
    """Calcula la fecha al siguiente mes manteniendo el mismo día de cobro (ej: 22 de nov -> 22 de dic)"""
    anio = fecha_base.year
    mes = fecha_base.month + meses
    while mes > 12:
        mes -= 12
        anio += 1
    max_dias = calendar.monthrange(anio, mes)[1]
    dia = min(fecha_base.day, max_dias)
    return fecha_base.replace(year=anio, month=mes, day=dia)

@router.get("/users", response_model=List[UserAdminItem])
def listar_usuarios(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    """Retorna la lista de todos los usuarios registrados con sus métricas de cartera"""
    usuarios = db.query(User).order_by(desc(User.created_at)).all()
    resultado = []

    for u in usuarios:
        prestamos = db.query(Prestamo).filter(Prestamo.usuario_id == u.id).all()
        total_prestado = sum(p.monto_prestado for p in prestamos)
        total_cobrado = sum(p.monto_pagado for p in prestamos)

        resultado.append(
            UserAdminItem(
                id=u.id,
                nombre=u.nombre,
                email=u.email,
                telefono=u.telefono,
                is_active=u.is_active,
                is_admin=u.is_admin,
                plan_tipo=getattr(u, "plan_tipo", "MENSUAL"),
                fecha_vencimiento_plan=getattr(u, "fecha_vencimiento_plan", None),
                fecha_ultimo_pago=getattr(u, "fecha_ultimo_pago", None),
                dias_restantes_plan=u.dias_restantes_plan,
                created_at=u.created_at,
                prestamos_count=len(prestamos),
                total_prestado=round(total_prestado, 2),
                total_cobrado=round(total_cobrado, 2)
            )
        )

    return resultado

@router.put("/users/{user_id}/status")
def actualizar_estado_usuario(
    user_id: int,
    datos: UserAdminStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    """Activa o suspende el acceso al sistema para un usuario tras el pago de suscripción"""
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    if usuario.id == current_admin.id and not datos.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes suspender tu propia cuenta de Administrador"
        )

    usuario.is_active = datos.is_active
    # Si se activa a un usuario mensual y no tiene fecha o ya venció, se le otorga un mes calendario completo
    if datos.is_active and getattr(usuario, "plan_tipo", "MENSUAL") == "MENSUAL":
        if not usuario.fecha_vencimiento_plan or usuario.fecha_vencimiento_plan < datetime.utcnow():
            usuario.fecha_vencimiento_plan = sumar_mes_calendario(datetime.utcnow(), 1)
            usuario.fecha_ultimo_pago = datetime.utcnow()

    db.commit()
    db.refresh(usuario)

    estado_str = "activada" if usuario.is_active else "suspendida"
    return {
        "message": f"Cuenta de {usuario.nombre} {estado_str} exitosamente",
        "user_id": usuario.id,
        "is_active": usuario.is_active,
        "plan_tipo": getattr(usuario, "plan_tipo", "MENSUAL"),
        "fecha_vencimiento_plan": usuario.fecha_vencimiento_plan.strftime("%Y-%m-%dT%H:%M:%SZ") if usuario.fecha_vencimiento_plan else None,
        "fecha_ultimo_pago": usuario.fecha_ultimo_pago.strftime("%Y-%m-%dT%H:%M:%SZ") if usuario.fecha_ultimo_pago else None,
        "dias_restantes_plan": usuario.dias_restantes_plan
    }

@router.get("/pending-users")
def listar_usuarios_pendientes(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    """Retorna la lista de usuarios recién registrados que están a la espera de confirmación de pago"""
    pendientes = db.query(User).filter(
        User.is_active == False,
        User.is_admin == False,
        User.fecha_vencimiento_plan == None
    ).order_by(desc(User.created_at)).all()

    return [
        {
            "id": u.id,
            "nombre": u.nombre,
            "email": u.email,
            "telefono": u.telefono,
            "created_at": u.created_at.strftime("%Y-%m-%dT%H:%M:%SZ") if u.created_at else None
        }
        for u in pendientes
    ]

@router.put("/users/{user_id}/renew")
def renovar_suscripcion_usuario(
    user_id: int,
    dias: int = 30,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    """Renueva la suscripción del usuario por 1 mes exacto manteniendo el mismo día de cobro"""
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    ahora = datetime.utcnow()
    # Si aún tiene días vigentes, se suma un mes calendario a su fecha de vencimiento; si ya venció, a partir de hoy
    base = usuario.fecha_vencimiento_plan if (usuario.fecha_vencimiento_plan and usuario.fecha_vencimiento_plan > ahora) else ahora
    usuario.fecha_vencimiento_plan = sumar_mes_calendario(base, 1)

    usuario.fecha_ultimo_pago = ahora
    usuario.is_active = True
    usuario.plan_tipo = "MENSUAL"
    db.commit()
    db.refresh(usuario)

    return {
        "message": f"Suscripción renovada exitosamente por 1 mes (vence el {usuario.fecha_vencimiento_plan.strftime('%d/%m/%Y')})",
        "user_id": usuario.id,
        "is_active": usuario.is_active,
        "plan_tipo": usuario.plan_tipo,
        "fecha_vencimiento_plan": usuario.fecha_vencimiento_plan.strftime("%Y-%m-%dT%H:%M:%SZ") if usuario.fecha_vencimiento_plan else None,
        "fecha_ultimo_pago": usuario.fecha_ultimo_pago.strftime("%Y-%m-%dT%H:%M:%SZ") if usuario.fecha_ultimo_pago else None,
        "dias_restantes_plan": usuario.dias_restantes_plan
    }

@router.put("/users/{user_id}/plan")
def cambiar_tipo_plan_usuario(
    user_id: int,
    plan_tipo: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    """Permite al administrador eximir de pago a un usuario (plan ILIMITADO) o volver a plan MENSUAL"""
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    tipo = plan_tipo.upper().strip()
    if tipo == "ILIMITADO":
        usuario.plan_tipo = "ILIMITADO"
        usuario.fecha_vencimiento_plan = None
        usuario.is_active = True
    elif tipo == "MENSUAL":
        usuario.plan_tipo = "MENSUAL"
        if not usuario.fecha_vencimiento_plan or usuario.fecha_vencimiento_plan < datetime.utcnow():
            usuario.fecha_vencimiento_plan = sumar_mes_calendario(datetime.utcnow(), 1)
        usuario.is_active = True
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de plan no válido. Use 'ILIMITADO' o 'MENSUAL'"
        )

    db.commit()
    db.refresh(usuario)

    return {
        "message": f"Plan actualizado a {usuario.plan_tipo}",
        "user_id": usuario.id,
        "is_active": usuario.is_active,
        "plan_tipo": usuario.plan_tipo,
        "fecha_vencimiento_plan": usuario.fecha_vencimiento_plan.strftime("%Y-%m-%dT%H:%M:%SZ") if usuario.fecha_vencimiento_plan else None,
        "fecha_ultimo_pago": usuario.fecha_ultimo_pago.strftime("%Y-%m-%dT%H:%M:%SZ") if usuario.fecha_ultimo_pago else None,
        "dias_restantes_plan": usuario.dias_restantes_plan
    }

@router.put("/users/{user_id}/reset-password")
def restablecer_password_usuario(
    user_id: int,
    datos: UserAdminPasswordReset,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    """Permite al administrador asignar una nueva contraseña a un usuario que la haya olvidado"""
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    if len(datos.password_nueva) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 4 caracteres"
        )

    usuario.hashed_password = hash_password(datos.password_nueva)
    db.commit()

    return {
        "message": f"Contraseña restablecida correctamente para {usuario.nombre}",
        "user_id": usuario.id
    }

@router.delete("/users/{user_id}")
def eliminar_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user)
):
    """Elimina permanentemente a un usuario y sus registros asociados"""
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    if usuario.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes eliminar tu propia cuenta de Administrador"
        )

    nombre = usuario.nombre
    db.delete(usuario)
    db.commit()

    return {"message": f"Usuario {nombre} eliminado correctamente"}
