from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.loan import Prestamo, MovimientoPrestamo
from app.schemas.loan import PrestamoCreate, ResumenPrestamos
from app.repositories.loan_repository import loan_repository
from app.core.dates import calcular_fecha_cobro, obtener_nombre_mes

class LoanService:
    @staticmethod
    def listar_prestamos(db: Session, usuario_id: int, estado: Optional[str] = None) -> List[Prestamo]:
        return loan_repository.get_all(db, usuario_id, estado)

    @staticmethod
    def obtener_prestamo(db: Session, loan_id: int, usuario_id: int) -> Prestamo:
        prestamo = loan_repository.get_by_id(db, loan_id, usuario_id)
        if not prestamo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Préstamo con ID {loan_id} no encontrado o no pertenece a tu cuenta"
            )
        return prestamo

    @staticmethod
    def crear_prestamo(db: Session, datos: PrestamoCreate, usuario_id: int) -> Prestamo:
        monto_prestado = round(float(datos.monto_prestado), 2)
        interes_pct = float(datos.interes_porcentaje if datos.interes_porcentaje is not None else 10.0)
        modalidad = "A_MESES" if datos.modalidad == "A_MESES" else "MENSUAL_LIBRE"
        
        # Fecha de otorgamiento y cálculo de fechas
        fecha_inicio = datos.fecha_prestamo if datos.fecha_prestamo else datetime.utcnow()
        dia_pago = fecha_inicio.day
        fecha_proximo = calcular_fecha_cobro(fecha_inicio, dia_pago, 1)

        # Plazo y cálculos según modalidad
        if modalidad == "A_MESES":
            plazo_meses = int(datos.plazo_meses) if (datos.plazo_meses and datos.plazo_meses > 0) else 1
            interes_total = round(monto_prestado * (interes_pct / 100.0) * plazo_meses, 2)
            monto_total = round(monto_prestado + interes_total, 2)
            cuota_mensual = round(monto_total / plazo_meses, 2)
            interes_mensual_estimado = round(interes_total / plazo_meses, 2)
            saldo_pendiente = monto_total
        else:
            plazo_meses = None
            interes_mensual_estimado = round(monto_prestado * (interes_pct / 100.0), 2)
            cuota_mensual = interes_mensual_estimado
            monto_total = monto_prestado
            saldo_pendiente = monto_prestado

        nuevo_prestamo = Prestamo(
            usuario_id=usuario_id,
            cliente=datos.cliente.strip(),
            telefono=datos.telefono.strip() if datos.telefono and datos.telefono.strip() else None,
            monto_prestado=monto_prestado,
            interes_porcentaje=interes_pct,
            modalidad=modalidad,
            plazo_meses=plazo_meses,
            cuotas_pagadas=0,
            meses_pagados=0,
            cuota_mensual=cuota_mensual,
            interes_mensual_estimado=interes_mensual_estimado,
            monto_total=monto_total,
            monto_pagado=0.0,
            saldo_pendiente=saldo_pendiente,
            intereses_cobrados=0.0,
            estado="PENDIENTE",
            fecha_prestamo=fecha_inicio,
            fecha_proximo_pago=fecha_proximo,
            dia_pago_mes=dia_pago
        )

        nuevo_prestamo = loan_repository.create(db, nuevo_prestamo)

        detalle_creacion = (
            f"Préstamo otorgado el {fecha_inicio.strftime('%d/%m/%Y')} a {plazo_meses} meses por S/ {monto_prestado:.2f} con interés de {interes_pct:.1f}% mensual. Próximo pago: {fecha_proximo.strftime('%d/%m/%Y')} (Cuota: S/ {cuota_mensual:.2f}/mes)"
            if modalidad == "A_MESES"
            else f"Préstamo libre otorgado el {fecha_inicio.strftime('%d/%m/%Y')} por S/ {monto_prestado:.2f} con interés de {interes_pct:.1f}% mensual. Próximo pago: {fecha_proximo.strftime('%d/%m/%Y')} (Interés: S/ {interes_mensual_estimado:.2f}/mes)"
        )

        movimiento_inicial = MovimientoPrestamo(
            prestamo_id=nuevo_prestamo.id,
            tipo="CREACION",
            monto=monto_prestado,
            detalle=detalle_creacion,
            fecha=datetime.utcnow()
        )
        db.add(movimiento_inicial)
        db.commit()
        db.refresh(nuevo_prestamo)
        return nuevo_prestamo

    @staticmethod
    def pagar_interes_mes(db: Session, loan_id: int, usuario_id: int, monto_interes: Optional[float] = None) -> Prestamo:
        prestamo = LoanService.obtener_prestamo(db, loan_id, usuario_id)
        if prestamo.estado == "PAGADO":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este préstamo ya ha sido cancelado en su totalidad."
            )

        monto = round(monto_interes if (monto_interes is not None and monto_interes > 0) else prestamo.interes_mensual_estimado, 2)
        if monto <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El monto de interés debe ser mayor a 0."
            )

        fecha_a_pagar = prestamo.fecha_proximo_pago or calcular_fecha_cobro(
            prestamo.fecha_prestamo, prestamo.dia_pago_mes, prestamo.meses_pagados + 1
        )
        mes_pagado_nombre = obtener_nombre_mes(fecha_a_pagar.month, fecha_a_pagar.year)

        prestamo.intereses_cobrados = round(prestamo.intereses_cobrados + monto, 2)
        prestamo.monto_pagado = round(prestamo.monto_pagado + monto, 2)
        prestamo.fecha_ultimo_pago = datetime.utcnow()
        prestamo.meses_pagados += 1

        prestamo.fecha_proximo_pago = calcular_fecha_cobro(
            prestamo.fecha_prestamo,
            prestamo.dia_pago_mes,
            prestamo.meses_pagados + 1
        )

        if prestamo.modalidad == "A_MESES":
            prestamo.saldo_pendiente = round(max(0.0, prestamo.saldo_pendiente - monto), 2)
            if prestamo.saldo_pendiente <= 0:
                prestamo.estado = "PAGADO"
                prestamo.saldo_pendiente = 0.0

        movimiento = MovimientoPrestamo(
            prestamo_id=prestamo.id,
            tipo="PAGO_INTERES_MES",
            monto=monto,
            detalle=f"Pago de interés de {mes_pagado_nombre} por S/ {monto:.2f}. Próximo cobro: {prestamo.fecha_proximo_pago.strftime('%d/%m/%Y')}",
            fecha=datetime.utcnow()
        )
        db.add(movimiento)
        db.commit()
        db.refresh(prestamo)
        return prestamo

    @staticmethod
    def pagar_cuota_mes(db: Session, loan_id: int, usuario_id: int) -> Prestamo:
        prestamo = LoanService.obtener_prestamo(db, loan_id, usuario_id)
        if prestamo.estado == "PAGADO":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este préstamo ya ha sido cancelado en su totalidad."
            )

        if prestamo.modalidad == "A_MESES":
            monto_cuota = min(prestamo.saldo_pendiente, prestamo.cuota_mensual)

            fecha_a_pagar = prestamo.fecha_proximo_pago or calcular_fecha_cobro(
                prestamo.fecha_prestamo, prestamo.dia_pago_mes, prestamo.meses_pagados + 1
            )
            mes_pagado_nombre = obtener_nombre_mes(fecha_a_pagar.month, fecha_a_pagar.year)

            prestamo.cuotas_pagadas += 1
            prestamo.meses_pagados += 1
            prestamo.saldo_pendiente = round(max(0.0, prestamo.saldo_pendiente - monto_cuota), 2)
            prestamo.monto_pagado = round(prestamo.monto_pagado + monto_cuota, 2)
            prestamo.intereses_cobrados = round(prestamo.intereses_cobrados + prestamo.interes_mensual_estimado, 2)
            prestamo.fecha_ultimo_pago = datetime.utcnow()

            if prestamo.saldo_pendiente <= 0 or prestamo.cuotas_pagadas >= (prestamo.plazo_meses or 1):
                prestamo.estado = "PAGADO"
                prestamo.saldo_pendiente = 0.0
                prestamo.fecha_proximo_pago = None
            else:
                prestamo.fecha_proximo_pago = calcular_fecha_cobro(
                    prestamo.fecha_prestamo,
                    prestamo.dia_pago_mes,
                    prestamo.meses_pagados + 1
                )

            movimiento = MovimientoPrestamo(
                prestamo_id=prestamo.id,
                tipo="PAGO_CUOTA",
                monto=monto_cuota,
                detalle=f"Pago de cuota #{prestamo.cuotas_pagadas} ({mes_pagado_nombre}) por S/ {monto_cuota:.2f}. Saldo restante: S/ {prestamo.saldo_pendiente:.2f}",
                fecha=datetime.utcnow()
            )
            db.add(movimiento)
            db.commit()
            db.refresh(prestamo)
            return prestamo
        else:
            return LoanService.pagar_interes_mes(db, loan_id, usuario_id)

    @staticmethod
    def agregar_prestamo_sobre_prestamo(db: Session, loan_id: int, usuario_id: int, monto_adicional: float) -> Prestamo:
        prestamo = LoanService.obtener_prestamo(db, loan_id, usuario_id)
        if monto_adicional <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El monto adicional a prestar debe ser mayor a 0."
            )

        monto_adicional = round(float(monto_adicional), 2)
        prestamo.estado = "PENDIENTE"

        if prestamo.modalidad == "MENSUAL_LIBRE":
            prestamo.monto_prestado = round(prestamo.monto_prestado + monto_adicional, 2)
            prestamo.saldo_pendiente = round(prestamo.saldo_pendiente + monto_adicional, 2)
            prestamo.monto_total = round(prestamo.monto_total + monto_adicional, 2)
            prestamo.interes_mensual_estimado = round(prestamo.saldo_pendiente * (prestamo.interes_porcentaje / 100.0), 2)
            prestamo.cuota_mensual = prestamo.interes_mensual_estimado

            detalle = (
                f"Préstamo sobre préstamo: +S/ {monto_adicional:.2f} capital agregado. "
                f"Nuevo saldo capital: S/ {prestamo.saldo_pendiente:.2f} (Nuevo interés: S/ {prestamo.interes_mensual_estimado:.2f}/mes)"
            )
        else:
            meses_restantes = max(1, (prestamo.plazo_meses or 1) - prestamo.cuotas_pagadas)
            interes_adicional = round(monto_adicional * (prestamo.interes_porcentaje / 100.0) * meses_restantes, 2)
            total_adicional = round(monto_adicional + interes_adicional, 2)

            prestamo.monto_prestado = round(prestamo.monto_prestado + monto_adicional, 2)
            prestamo.monto_total = round(prestamo.monto_total + total_adicional, 2)
            prestamo.saldo_pendiente = round(prestamo.saldo_pendiente + total_adicional, 2)
            prestamo.cuota_mensual = round(prestamo.saldo_pendiente / meses_restantes, 2)

            detalle = (
                f"Préstamo sobre préstamo: +S/ {monto_adicional:.2f} capital (+S/ {interes_adicional:.2f} interés simple por {meses_restantes} meses). "
                f"Nueva cuota: S/ {prestamo.cuota_mensual:.2f}/mes"
            )

        movimiento = MovimientoPrestamo(
            prestamo_id=prestamo.id,
            tipo="PRESTAMO_SOBRE_PRESTAMO",
            monto=monto_adicional,
            detalle=detalle,
            fecha=datetime.utcnow()
        )
        db.add(movimiento)
        db.commit()
        db.refresh(prestamo)
        return prestamo

    @staticmethod
    def registrar_abono(db: Session, loan_id: int, usuario_id: int, monto_abono: float) -> Prestamo:
        prestamo = LoanService.obtener_prestamo(db, loan_id, usuario_id)

        if prestamo.estado == "PAGADO":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este préstamo ya ha sido cancelado en su totalidad."
            )

        if monto_abono <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El abono debe ser mayor a 0."
            )

        if monto_abono > prestamo.saldo_pendiente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El monto a abonar (S/ {monto_abono:.2f}) no puede ser mayor al capital adeudado actual de S/ {prestamo.saldo_pendiente:.2f}."
            )

        monto_aplicado = round(monto_abono, 2)
        prestamo.saldo_pendiente = round(max(0.0, prestamo.saldo_pendiente - monto_aplicado), 2)
        prestamo.monto_pagado = round(prestamo.monto_pagado + monto_aplicado, 2)
        prestamo.fecha_ultimo_pago = datetime.utcnow()

        if prestamo.modalidad == "MENSUAL_LIBRE":
            prestamo.interes_mensual_estimado = round(prestamo.saldo_pendiente * (prestamo.interes_porcentaje / 100.0), 2)
            prestamo.cuota_mensual = prestamo.interes_mensual_estimado

        if prestamo.saldo_pendiente <= 0:
            prestamo.estado = "PAGADO"
            prestamo.saldo_pendiente = 0.0

        detalle = (
            f"Abono al capital de S/ {monto_aplicado:.2f}. "
            f"Capital restante: S/ {prestamo.saldo_pendiente:.2f} (Nuevo interés futuro: S/ {prestamo.interes_mensual_estimado:.2f}/mes)"
            if prestamo.modalidad == "MENSUAL_LIBRE"
            else f"Abono de S/ {monto_aplicado:.2f} descontado del saldo total. Saldo restante: S/ {prestamo.saldo_pendiente:.2f}"
        )

        movimiento = MovimientoPrestamo(
            prestamo_id=prestamo.id,
            tipo="ABONO_CAPITAL",
            monto=monto_aplicado,
            detalle=detalle,
            fecha=datetime.utcnow()
        )
        db.add(movimiento)
        db.commit()
        db.refresh(prestamo)
        return prestamo

    @staticmethod
    def marcar_como_pagado(db: Session, loan_id: int, usuario_id: int) -> Prestamo:
        prestamo = LoanService.obtener_prestamo(db, loan_id, usuario_id)
        if prestamo.estado == "PAGADO":
            return prestamo

        monto_liquidado = prestamo.saldo_pendiente
        prestamo.monto_pagado = round(prestamo.monto_pagado + monto_liquidado, 2)
        prestamo.saldo_pendiente = 0.0
        prestamo.estado = "PAGADO"
        if prestamo.plazo_meses:
            prestamo.cuotas_pagadas = prestamo.plazo_meses
        prestamo.fecha_ultimo_pago = datetime.utcnow()

        movimiento = MovimientoPrestamo(
            prestamo_id=prestamo.id,
            tipo="PAGO_TOTAL",
            monto=monto_liquidado,
            detalle=f"Cancelación total de la deuda por S/ {monto_liquidado:.2f}. Préstamo saldado.",
            fecha=datetime.utcnow()
        )
        db.add(movimiento)
        db.commit()
        db.refresh(prestamo)
        return prestamo

    @staticmethod
    def eliminar_prestamo(db: Session, loan_id: int, usuario_id: int) -> dict:
        prestamo = LoanService.obtener_prestamo(db, loan_id, usuario_id)
        loan_repository.delete(db, prestamo)
        return {"mensaje": f"Préstamo #{loan_id} eliminado exitosamente"}

    @staticmethod
    def obtener_resumen(db: Session, usuario_id: int) -> ResumenPrestamos:
        todos = loan_repository.get_all(db, usuario_id)
        total_prestado = round(sum(p.monto_prestado for p in todos), 2)
        total_cobrado = round(sum(p.monto_pagado for p in todos), 2)
        total_pendiente = round(sum(p.saldo_pendiente for p in todos if p.estado != "PAGADO"), 2)
        total_intereses = round(sum(p.intereses_cobrados for p in todos), 2)
        pendientes = sum(1 for p in todos if p.estado != "PAGADO")
        pagados = sum(1 for p in todos if p.estado == "PAGADO")

        return ResumenPrestamos(
            total_prestado=total_prestado,
            total_cobrado=total_cobrado,
            total_pendiente=total_pendiente,
            total_intereses_cobrados=total_intereses,
            cantidad_prestamos=len(todos),
            cantidad_pendientes=pendientes,
            cantidad_pagados=pagados,
        )

loan_service = LoanService()
