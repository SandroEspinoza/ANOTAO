import pymysql
from urllib.parse import urlparse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

def init_database():
    """Verifica y crea automáticamente la base de datos MySQL si no existe aún"""
    try:
        url = urlparse(settings.DATABASE_URL.replace("mysql+pymysql://", "mysql://"))
        db_name = url.path.lstrip("/")
        if db_name:
            conn = pymysql.connect(
                host=url.hostname or "127.0.0.1",
                port=url.port or 3306,
                user=url.username or "root",
                password=url.password or "",
                autocommit=True
            )
            with conn.cursor() as cursor:
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            conn.close()
    except Exception as e:
        print(f"[WARN] No se pudo verificar la creación previa de base de datos: {e}")

# Ejecutar inicialización previa de BD
init_database()

# pool_pre_ping valida la conexión antes de ejecutar consultas para evitar desconexiones por inactividad
# pool_recycle renueva conexiones cada 3600 segundos (1 hora)
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
