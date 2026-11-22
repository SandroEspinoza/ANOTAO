from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.core.config import settings
from app.core.database import engine, Base
import app.models.user  # Registra modelo User
import app.models.loan  # Registra modelo Prestamo y MovimientoPrestamo
from app.routers import health, loans, auth

# 1. Crear automáticamente las tablas en MySQL si no existen
Base.metadata.create_all(bind=engine)

# 2. Migración automática: verificar que la columna usuario_id exista en prestamos
def verificar_migracion_usuario():
    try:
        inspector = inspect(engine)
        if "prestamos" in inspector.get_table_names():
            columnas = [c["name"] for c in inspector.get_columns("prestamos")]
            if "usuario_id" not in columnas:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE prestamos ADD COLUMN usuario_id INT NULL;"))
                    try:
                        conn.execute(text("ALTER TABLE prestamos ADD CONSTRAINT fk_prestamos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;"))
                    except Exception:
                        pass
                    conn.commit()
    except Exception as e:
        print(f"[WARN] Error en migración de usuario: {e}")

verificar_migracion_usuario()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_DESCRIPTION,
    version=settings.VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"https://.*" if "*" not in settings.CORS_ORIGINS else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Endpoint raíz informativo
@app.get("/")
def ruta_raiz():
    return {
        "app": settings.PROJECT_NAME,
        "descripcion": settings.PROJECT_DESCRIPTION,
        "estado": "activo",
        "docs": "/docs",
        "endpoints": {
            "auth": f"{settings.API_V1_STR}/auth",
            "estado": f"{settings.API_V1_STR}/estado",
            "prestamos": f"{settings.API_V1_STR}/prestamos",
            "resumen": f"{settings.API_V1_STR}/prestamos/resumen"
        }
    }

# Registrar Routers bajo /api
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(health.router, prefix=settings.API_V1_STR)
app.include_router(loans.router, prefix=settings.API_V1_STR)
