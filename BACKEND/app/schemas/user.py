from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

class UserCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100, description="Nombre completo o apodo")
    email: EmailStr = Field(..., description="Correo electrónico único")
    password: str = Field(..., min_length=4, max_length=100, description="Contraseña de acceso")

class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="Correo electrónico registrado")
    password: str = Field(..., description="Contraseña")

class UserUpdateProfile(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100, description="Nuevo nombre de usuario")

class UserChangePassword(BaseModel):
    password_actual: str = Field(..., min_length=4, max_length=100, description="Contraseña actual")
    password_nueva: str = Field(..., min_length=4, max_length=100, description="Nueva contraseña")

class UserResponse(BaseModel):
    id: int
    nombre: str
    email: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
