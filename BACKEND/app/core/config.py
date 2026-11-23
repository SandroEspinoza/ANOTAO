import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

class Settings:
    PROJECT_NAME: str = "ANOTAO API"
    PROJECT_DESCRIPTION: str = "Sistema de Gestión y Control de Préstamos"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://root:sandro@127.0.0.1:3306/anotao"
    )
    
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY",
        "anotao_super_secure_jwt_secret_key_2026_anotao_prestamos_system_key"
    )
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080")) # 7 días
    
    # Número de WhatsApp oficial para soporte y activaciones (oculto en .env, fuera de git)
    ADMIN_WHATSAPP: str = os.getenv("ADMIN_WHATSAPP", "")
    
    raw_cors = os.getenv("CORS_ORIGINS", "")
    CORS_ORIGINS: list[str] = (
        [origin.strip() for origin in raw_cors.split(",")]
        if raw_cors
        else [
            "http://localhost:4200",
            "http://127.0.0.1:4200",
            "https://localhost:4200",
        ]
    )

settings = Settings()
