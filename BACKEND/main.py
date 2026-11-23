import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.core.config import settings
from app.core.database import engine, Base
import app.models.user  # Registra modelo User
import app.models.loan  # Registra modelo Prestamo y MovimientoPrestamo
from app.routers import health, loans, auth, admin

# 1. Crear automáticamente las tablas en MySQL si no existen
Base.metadata.create_all(bind=engine)

# 2. Migración automática: verificar que columnas existan y auto-asignar superadmin
def verificar_migraciones():
    try:
        inspector = inspect(engine)
        tablas = inspector.get_table_names()

        if "prestamos" in tablas:
            cols_prestamos = [c["name"] for c in inspector.get_columns("prestamos")]
            if "usuario_id" not in cols_prestamos:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE prestamos ADD COLUMN usuario_id INT NULL;"))
                    try:
                        conn.execute(text("ALTER TABLE prestamos ADD CONSTRAINT fk_prestamos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;"))
                    except Exception:
                        pass
                    conn.commit()

        if "usuarios" in tablas:
            cols_usuarios = [c["name"] for c in inspector.get_columns("usuarios")]
            with engine.connect() as conn:
                if "is_admin" not in cols_usuarios:
                    conn.execute(text("ALTER TABLE usuarios ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;"))
                    conn.commit()
                if "telefono" not in cols_usuarios:
                    conn.execute(text("ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(50) NULL;"))
                    conn.commit()
                if "plan_tipo" not in cols_usuarios:
                    conn.execute(text("ALTER TABLE usuarios ADD COLUMN plan_tipo VARCHAR(50) NOT NULL DEFAULT 'MENSUAL';"))
                    conn.commit()
                if "fecha_vencimiento_plan" not in cols_usuarios:
                    conn.execute(text("ALTER TABLE usuarios ADD COLUMN fecha_vencimiento_plan DATETIME NULL;"))
                    conn.commit()
                if "fecha_ultimo_pago" not in cols_usuarios:
                    conn.execute(text("ALTER TABLE usuarios ADD COLUMN fecha_ultimo_pago DATETIME NULL;"))
                    conn.commit()

                # Actualizar planes iniciales de forma segura
                try:
                    conn.execute(text("UPDATE usuarios SET plan_tipo = 'ILIMITADO' WHERE is_admin = 1;"))
                    conn.execute(text("UPDATE usuarios SET fecha_vencimiento_plan = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE is_admin = 0 AND fecha_vencimiento_plan IS NULL AND is_active = 1;"))
                    conn.commit()
                except Exception:
                    pass

                # Si ya existen usuarios registrados pero ninguno tiene rol de Administrador,
                # promovemos al primer usuario (o primer registro) a Superadmin automáticamente
                res = conn.execute(text("SELECT COUNT(*) FROM usuarios WHERE is_admin = 1;")).scalar()
                if res == 0:
                    primer_id = conn.execute(text("SELECT id FROM usuarios ORDER BY id ASC LIMIT 1;")).scalar()
                    if primer_id:
                        conn.execute(text(f"UPDATE usuarios SET is_admin = 1, is_active = 1 WHERE id = {primer_id};"))
                        conn.commit()
                        print(f"[INFO] Usuario #{primer_id} promovido automáticamente a Superadministrador.")

                # Asegurar que todos los correos de administradores configurados tengan permisos de Superadmin
                raw_admins = os.getenv("ADMIN_EMAILS", "sandro@gmail.com")
                admin_list = [e.strip().lower() for e in raw_admins.split(",") if e.strip()]
                for adm in admin_list:
                    conn.execute(text(f"UPDATE usuarios SET is_admin = 1, is_active = 1 WHERE LOWER(email) = '{adm}';"))
                conn.commit()

    except Exception as e:
        print(f"[WARN] Error en migraciones automáticas: {e}")

verificar_migraciones()

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
app.include_router(admin.router, prefix=settings.API_V1_STR)
