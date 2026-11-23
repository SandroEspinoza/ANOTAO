import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.models.user import User
from app.models.loan import Prestamo
from app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse, UserUpdateProfile, UserChangePassword

router = APIRouter(prefix="/auth", tags=["Autenticación"])

def obtener_admin_emails() -> list[str]:
    raw = os.getenv("ADMIN_EMAILS", "sandro@gmail.com")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def registrar_usuario(datos: UserCreate, db: Session = Depends(get_db)):
    email_clean = datos.email.strip().lower()
    existente = db.query(User).filter(User.email == email_clean).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe una cuenta registrada con este correo electrónico"
        )

    # Verificar si es el primer usuario de la plataforma o si está en la lista de administradores
    total_usuarios_previos = db.query(User).count()
    admin_emails = obtener_admin_emails()
    es_admin = (total_usuarios_previos == 0) or (email_clean in admin_emails)
    
    # El administrador siempre nace activo; los usuarios clientes nacen inactivos hasta que se active su suscripción
    is_active = True if es_admin else False

    nuevo_usuario = User(
        nombre=datos.nombre.strip(),
        email=email_clean,
        hashed_password=hash_password(datos.password),
        is_active=is_active,
        is_admin=es_admin,
        plan_tipo="ILIMITADO" if es_admin else "MENSUAL",
        telefono=datos.telefono.strip() if datos.telefono else None
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    # Si es el primer usuario y existen préstamos huérfanos sin usuario_id, se le asignan para no perder pruebas
    if total_usuarios_previos == 0:
        db.query(Prestamo).filter(Prestamo.usuario_id.is_(None)).update(
            {"usuario_id": nuevo_usuario.id},
            synchronize_session=False
        )
        db.commit()

    if not nuevo_usuario.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PENDING_SUBSCRIPTION: ¡Cuenta registrada con éxito! Tu acceso requiere la activación previa por suscripción. Contacta al administrador para habilitar tu cuenta."
        )

    token = create_access_token(data={"sub": str(nuevo_usuario.id), "email": nuevo_usuario.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(nuevo_usuario)
    )

@router.post("/login", response_model=TokenResponse)
def iniciar_sesion(datos: UserLogin, db: Session = Depends(get_db)):
    email_clean = datos.email.strip().lower()
    usuario = db.query(User).filter(User.email == email_clean).first()
    if not usuario or not verify_password(datos.password, usuario.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Auto-elevación a Superadmin si es el primer usuario o coincide con correo admin
    admin_emails = obtener_admin_emails()
    if (not usuario.is_admin) and (email_clean in admin_emails or db.query(User).filter(User.is_admin == True).count() == 0):
        usuario.is_admin = True
        usuario.is_active = True
        usuario.plan_tipo = "ILIMITADO"
        db.commit()
        db.refresh(usuario)

    # Regla de corte automático de suscripción por vencimiento (30 días)
    if (not usuario.is_admin) and (getattr(usuario, "plan_tipo", "MENSUAL") != "ILIMITADO"):
        vencimiento = getattr(usuario, "fecha_vencimiento_plan", None)
        if vencimiento and vencimiento < datetime.utcnow():
            if usuario.is_active:
                usuario.is_active = False
                db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SUBSCRIPTION_EXPIRED: Tu suscripción de 30 días ha vencido. Contacta al administrador para renovar tu acceso."
            )

    if not usuario.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PENDING_SUBSCRIPTION: Tu cuenta está pendiente de activación por suscripción. Contacta al administrador para habilitar tu acceso."
        )

    token = create_access_token(data={"sub": str(usuario.id), "email": usuario.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(usuario)
    )

@router.get("/public-config")
def configuracion_publica():
    """Retorna configuraciones públicas del sistema cargadas desde el servidor (no expuestas en git)"""
    return {
        "admin_whatsapp": settings.ADMIN_WHATSAPP or ""
    }

@router.get("/me", response_model=UserResponse)
def mi_perfil(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Obtiene los datos del usuario autenticado actual"""
    admin_emails = obtener_admin_emails()
    if (not current_user.is_admin) and (current_user.email.lower() in admin_emails):
        current_user.is_admin = True
        current_user.is_active = True
        db.commit()
        db.refresh(current_user)
    return UserResponse.model_validate(current_user)

@router.put("/profile", response_model=UserResponse)
def actualizar_nombre_usuario(
    datos: UserUpdateProfile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Permite al usuario cambiar su nombre o apodo"""
    nuevo_nombre = datos.nombre.strip()
    if len(nuevo_nombre) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre debe tener al menos 2 caracteres"
        )
    current_user.nombre = nuevo_nombre
    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)

@router.post("/change-password")
def cambiar_contrasena(
    datos: UserChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Permite al usuario cambiar su contraseña validando la actual"""
    if not verify_password(datos.password_actual, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual ingresada es incorrecta"
        )
    if len(datos.password_nueva) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 4 caracteres"
        )
    current_user.hashed_password = hash_password(datos.password_nueva)
    db.commit()
    return {"message": "Contraseña actualizada exitosamente"}
