import calendar
from datetime import datetime
from typing import List, Optional

NOMBRES_MESES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"
]

def calcular_fecha_cobro(fecha_prestamo: datetime, dia_ancla: int, meses_a_sumar: int) -> datetime:
    """
    Calcula la fecha de cobro sumando meses_a_sumar a la fecha de inicio del préstamo,
    respetando el dia_ancla original.
    
    Regla de negocio:
    - Si prestó el día 3 de agosto, el cobro de cada mes es el día 3.
    - Si se prestó en días 28, 29, 30, 31 y el mes siguiente tiene menos días (ej. febrero 28/29,
      o meses de 30 días como abril cuando dia_ancla es 31), el cobro se hace el último día
      disponible de ese mes (un día antes si aplica).
    - En el mes subsiguiente que sí cuente con los días, vuelve a recuperar automáticamente
      el día ancla original (ej. 31 en marzo o mayo).
    """
    total_months = (fecha_prestamo.year * 12 + (fecha_prestamo.month - 1)) + meses_a_sumar
    target_year = total_months // 12
    target_month = (total_months % 12) + 1
    max_dias = calendar.monthrange(target_year, target_month)[1]
    target_day = min(dia_ancla, max_dias)
    return fecha_prestamo.replace(year=target_year, month=target_month, day=target_day)

def obtener_nombre_mes(mes: int, anio: int) -> str:
    if 1 <= mes <= 12:
        return f"{NOMBRES_MESES[mes]} {anio}"
    return f"Mes {mes} {anio}"
