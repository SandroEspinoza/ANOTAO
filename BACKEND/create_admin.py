"""
Script utilitario para crear o promover un usuario Superadministrador en ANOTAO.
Uso:
  python create_admin.py
  python create_admin.py <correo> <password> "<nombre>"
"""
import sys
import os

# Asegurar que el path del backend esté disponible
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, engine, Base
from app.models.user import User
from app.core.security import hash_password

def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    if len(sys.argv) >= 3:
        email = sys.argv[1].strip().lower()
        password = sys.argv[2]
        nombre = sys.argv[3].strip() if len(sys.argv) > 3 else "Administrador"
    else:
        print("=== Creador de Administrador ANOTAO ===")
        email = input("Correo electrónico: ").strip().lower()
        password = input("Contraseña: ").strip()
        nombre = input("Nombre o Apodo [Administrador]: ").strip() or "Administrador"

    if not email or not password:
        print("[ERROR] Correo y contraseña son obligatorios.")
        sys.exit(1)

    existente = db.query(User).filter(User.email == email).first()
    if existente:
        existente.is_admin = True
        existente.is_active = True
        existente.plan_tipo = "ILIMITADO"
        existente.hashed_password = hash_password(password)
        if nombre:
            existente.nombre = nombre
        db.commit()
        print(f"[OK] Usuario existente '{email}' actualizado con éxito a Superadministrador (Plan ILIMITADO).")
    else:
        nuevo = User(
            nombre=nombre,
            email=email,
            hashed_password=hash_password(password),
            is_active=True,
            is_admin=True,
            plan_tipo="ILIMITADO"
        )
        db.add(nuevo)
        db.commit()
        print(f"[OK] Nuevo Superadministrador '{email}' creado exitosamente (Plan ILIMITADO).")

    db.close()

if __name__ == "__main__":
    main()
