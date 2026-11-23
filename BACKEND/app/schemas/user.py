from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr, Field, field_serializer

class UserCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100, description="Nombre completo o apodo")
    email: EmailStr = Field(..., description="Correo electrónico único")
    password: str = Field(..., min_length=4, max_length=100, description="Contraseña de acceso")
    telefono: Optional[str] = Field(None, max_length=50, description="Teléfono de contacto / WhatsApp")

class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="Correo electrónico registrado")
    password: str = Field(..., description="Contraseña")

class UserUpdateProfile(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100, description="Nuevo nombre de usuario")
    telefono: Optional[str] = Field(None, max_length=50, description="Teléfono de contacto")

class UserChangePassword(BaseModel):
    password_actual: str = Field(..., min_length=4, max_length=100, description="Contraseña actual")
    password_nueva: str = Field(..., min_length=4, max_length=100, description="Nueva contraseña")

class UserResponse(BaseModel):
    id: int
    nombre: str
    email: str
    is_active: bool
    is_admin: bool = False
    telefono: Optional[str] = None
    plan_tipo: str = "MENSUAL"
    fecha_vencimiento_plan: Optional[datetime] = None
    dias_restantes_plan: Optional[int] = 0
    created_at: datetime

    @field_serializer("created_at", "fecha_vencimiento_plan", check_fields=False)
    def serialize_datetime(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ==========================================
# ESQUEMAS PARA PANEL DE ADMINISTRACIÓN
# ==========================================

class UserAdminItem(BaseModel):
    id: int
    nombre: str
    email: str
    telefono: Optional[str] = None
    is_active: bool
    is_admin: bool
    plan_tipo: str = "MENSUAL"
    fecha_vencimiento_plan: Optional[datetime] = None
    fecha_ultimo_pago: Optional[datetime] = None
    dias_restantes_plan: Optional[int] = 0
    created_at: datetime
    prestamos_count: int = 0
    total_prestado: float = 0.0
    total_cobrado: float = 0.0

    @field_serializer("created_at", "fecha_vencimiento_plan", "fecha_ultimo_pago", check_fields=False)
    def serialize_datetime(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    class Config:
        from_attributes = True

class UserAdminStatusUpdate(BaseModel):
    is_active: bool

class UserAdminPasswordReset(BaseModel):
    password_nueva: str = Field(..., min_length=4, description="Nueva contraseña asignada por el admin")

