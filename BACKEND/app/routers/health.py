from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db

router = APIRouter(tags=["Diagnóstico"])

@router.get("/estado")
def verificar_conexion(db: Session = Depends(get_db)):
    """Verifica la conectividad activa con MySQL"""
    try:
        db.execute(text("SELECT 1"))
        return {
            "estado": "OK",
            "mensaje": "Conexión exitosa entre Angular, FastAPI y MySQL",
            "servicios": {
                "backend": "conectado",
                "base_datos": "conectado (MySQL)"
            }
        }
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "estado": "ERROR",
                "mensaje": f"Error conectando a la base de datos: {str(e)}",
                "servicios": {
                    "backend": "conectado",
                    "base_datos": "error"
                }
            }
        )
