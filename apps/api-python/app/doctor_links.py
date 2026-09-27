"""Link propio de cada médico (miturnosapp.com/<nombre>) para compartir con sus pacientes.

Todo nombre usado alguna vez queda en doctor_links y no se reasigna: un link viejo, ya compartido,
siempre lleva al mismo médico (a su nombre actual) y nunca a otro.
"""
import re
import unicodedata
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .models import DoctorLink, Specialty

PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,49}$")
# Rutas de la web y nombres que la app puede necesitar. test_doctor_links verifica que toda carpeta de apps/web/app esté acá.
RESERVED = frozenset("""
    admin api app auth ayuda blog buscar configuracion contacto cuenta demo doctores inicio legal login logout
    medico medicos mi-historia mis-turnos miturno miturnos nosotros pacientes panel perfil precios privacidad
    recuperar-contrasena registro restablecer-contrasena salud soporte staging terminos test turnos verificar-email www
""".split())
TAKEN = "Ese link ya está en uso. Probá con otro."


def clean(text):
    """Minúsculas sin acentos ni símbolos: «Hernán Pasarela» → «hernanpasarela»."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", plain.lower())


def valid(name):
    return bool(PATTERN.match(name)) and name not in RESERVED


def claim(db, doctor, name):
    """Asigna el nombre si está libre o si ya fue de este médico. Devuelve False si es de otro."""
    owner = db.scalar(select(DoctorLink.doctorId).where(DoctorLink.name == name))
    if owner not in (None, doctor.id):
        return False
    if owner is None:
        try:
            # El índice único resuelve la carrera entre dos médicos que piden el mismo nombre a la vez.
            with db.begin_nested():
                db.add(DoctorLink(name=name, doctorId=doctor.id))
        except IntegrityError:
            return False
    doctor.slug = name
    return True


def assign_automatic(db, doctor):
    """Nombre y apellido; si está ocupado, con la especialidad. Si igual choca, queda para el administrador."""
    if doctor.slug:
        return True
    base = clean(doctor.firstName) + clean(doctor.lastName)
    specialties = db.scalars(select(Specialty.slug).where(Specialty.id.in_(doctor.specialtyIds or [])).order_by(Specialty.slug))
    return any(valid(name) and claim(db, doctor, name) for name in [base, *(f"{base}-{item}" for item in specialties)])


def change(db, doctor, requested):
    name = requested.strip().lower()
    if not PATTERN.match(name):
        raise HTTPException(400, "Usá entre 3 y 50 letras minúsculas, números o guiones, sin acentos ni espacios")
    if name in RESERVED:
        raise HTTPException(409, TAKEN)
    if name != doctor.slug and not claim(db, doctor, name):
        raise HTTPException(409, TAKEN)
    return name
