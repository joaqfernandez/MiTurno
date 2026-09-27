"""Link propio de cada médico (miturnosapp.com/<nombre>). Decisiones del fundador del 2026-09-27 (Notion MT-25):
nombre y apellido automáticos; si se repite, con la especialidad; si igual se repite, lo asigna un administrador;
el médico puede cambiarlo y los links viejos siguen funcionando.
"""
from pathlib import Path
import pytest
from alembic import command
from sqlalchemy import select, text
from app.config import Settings
from app.database import Database
from app.doctor_links import RESERVED, assign_automatic, clean
from app.models import AuditLog, Doctor, DoctorLink, Specialty, User
from app.seed import seed
from conftest import PASSWORD, SECRET, migrate
from test_migrations import alembic_config

WEB_APP = Path(__file__).resolve().parents[2] / "web" / "app"


def register_doctor(system, email, first="Hernán", last="Pasarela"):
    body = {"email": email, "password": PASSWORD, "firstName": first, "lastName": last, "role": "DOCTOR", "licenseNumber": email}
    assert system.client.post("/api/auth/register", json=body).status_code == 202
    with system.database.transaction() as db:
        return db.scalar(select(Doctor).join(User).where(User.email == email))


def slug_of(system, doctor_id):
    with system.database.transaction() as db:
        return db.get(Doctor, doctor_id).slug


def put_link(system, slug, name="doctor"):
    return system.client.put("/api/doctors/me/link", json={"slug": slug}, headers=system.headers(name))


def by_link(system, name):
    return system.client.get(f"/api/doctors/by-link/{name}")


@pytest.mark.parametrize("text_in, expected", [("Hernán Pasarela", "hernanpasarela"), ("María José Núñez-Díaz", "mariajosenunezdiaz"), ("O'Brien", "obrien")])
def test_names_are_cleaned_without_accents_or_symbols(text_in, expected):
    assert clean(text_in) == expected


def test_registration_uses_name_then_leaves_duplicates_without_link(system):
    first = register_doctor(system, "hernan1@example.com")
    assert first.slug == "hernanpasarela"
    # Recién registrado todavía no tiene especialidad: queda sin link hasta cargarla.
    second = register_doctor(system, "hernan2@example.com")
    assert second.slug is None
    with system.database.transaction() as db:
        assert db.scalar(select(DoctorLink.doctorId).where(DoctorLink.name == "hernanpasarela")) == first.id


def test_duplicate_gets_specialty_when_loaded_and_admin_resolves_the_rest(system):
    with system.database.transaction() as db:
        cardio = Specialty(name="Cardiología", slug="cardiologia")
        db.add(cardio)
        db.flush()
        cardio_id = cardio.id
        for index in range(2):
            other = User(id=f"user-dup-{index}", email=f"dup{index}@example.com", roles=["DOCTOR"], status="ACTIVE")
            db.add(other)
            db.flush()
            db.add(Doctor(id=f"dup-{index}", userId=other.id, firstName="Valeria", lastName="Roldán", licenseNumber=f"DUP{index}", specialtyIds=[cardio_id]))
        db.flush()
        assert assign_automatic(db, db.get(Doctor, "dup-0")) and db.get(Doctor, "dup-0").slug == "valeriaroldan"
        assert assign_automatic(db, db.get(Doctor, "dup-1")) and db.get(Doctor, "dup-1").slug == "valeriaroldan-cardiologia"
    # La médica del sistema de pruebas también se llama Valeria Roldán y su especialidad es "clinica".
    response = system.client.patch("/api/doctors/me/settings", json={"specialtyIds": ["specialty"]}, headers=system.headers("doctor"))
    assert response.status_code == 200, response.text
    assert slug_of(system, "doctor") == "valeriaroldan-clinica"
    # Una tercera con el mismo nombre y especialidad queda sin link y la resuelve el administrador.
    with system.database.transaction() as db:
        db.add(User(id="user-dup-2", email="dup2@example.com", roles=["DOCTOR"], status="ACTIVE"))
        db.flush()
        db.add(Doctor(id="dup-2", userId="user-dup-2", firstName="Valeria", lastName="Roldán", licenseNumber="DUP2", specialtyIds=[cardio_id]))
        db.flush()
        assert assign_automatic(db, db.get(Doctor, "dup-2")) is False
    admin = system.client.get("/api/admin/doctors", headers=system.headers("admin")).json()
    assert [item["slug"] for item in admin if item["id"] == "dup-2"] == [None]
    assert system.client.put("/api/admin/doctors/dup-2/link", json={"slug": "valeriaroldan"}, headers=system.headers("admin")).status_code == 409
    response = system.client.put("/api/admin/doctors/dup-2/link", json={"slug": "dra-roldan-sur"}, headers=system.headers("admin"))
    assert response.status_code == 200, response.text
    assert slug_of(system, "dup-2") == "dra-roldan-sur"
    with system.database.transaction() as db:
        assert db.scalar(select(AuditLog.action).where(AuditLog.entityId == "dup-2")) == "doctor.link"


def test_doctor_changes_link_and_old_links_keep_working(system):
    response = put_link(system, "dra-valeria")
    assert response.status_code == 200, response.text
    assert response.json() == {"slug": "dra-valeria", "url": f"{system.settings.web_url}/dra-valeria"}
    assert put_link(system, "valeria-mendoza").status_code == 200
    # Los dos nombres viejos llevan a la misma médica; la web redirige al actual.
    for name in ("dra-valeria", "DRA-VALERIA", "valeria-mendoza"):
        found = by_link(system, name)
        assert found.status_code == 200
        assert (found.json()["id"], found.json()["slug"]) == ("doctor", "valeria-mendoza")
    assert system.client.get("/api/doctors/me/link", headers=system.headers("doctor")).json()["slug"] == "valeria-mendoza"
    # Puede volver a un nombre propio anterior.
    assert put_link(system, "dra-valeria").status_code == 200
    assert slug_of(system, "doctor") == "dra-valeria"


def test_old_names_are_never_given_to_another_doctor(system):
    assert put_link(system, "dra-valeria").status_code == 200
    assert put_link(system, "valeria-nueva").status_code == 200
    other = register_doctor(system, "otro@example.com", first="Otro", last="Medico")
    with system.database.transaction() as db:
        db.get(User, other.userId).status = "ACTIVE"
    response = system.client.put(f"/api/admin/doctors/{other.id}/link", json={"slug": "dra-valeria"}, headers=system.headers("admin"))
    assert response.status_code == 409
    assert by_link(system, "dra-valeria").json()["id"] == "doctor"


@pytest.mark.parametrize("slug, status", [("admin", 409), ("panel", 409), ("ab", 400), ("Hola Mundo", 400), ("-valeria", 400),
                                          ("valeria-", 400), ("va--leria", 400), ("ñandu", 400), ("a" * 51, 400)])
def test_invalid_or_reserved_names_are_rejected(system, slug, status):
    response = put_link(system, slug)
    assert response.status_code == status
    assert slug_of(system, "doctor") is None


def test_only_the_doctor_and_admin_can_change_links(system):
    assert put_link(system, "paciente-atrevido", name="own").status_code == 403
    assert system.client.put("/api/admin/doctors/doctor/link", json={"slug": "otro-nombre"}, headers=system.headers("doctor")).status_code == 403
    assert slug_of(system, "doctor") is None


def test_unknown_and_suspended_links_are_not_found(system):
    assert by_link(system, "no-existe").status_code == 404
    assert put_link(system, "dra-valeria").status_code == 200
    with system.database.transaction() as db:
        db.get(User, "user-doctor").status = "SUSPENDED"
    assert by_link(system, "dra-valeria").status_code == 404


def test_every_web_page_name_is_reserved():
    # Si se agrega una página en apps/web/app, ningún médico puede tener un link con ese nombre.
    pages = {item.name for item in WEB_APP.iterdir() if item.is_dir() and not item.name.startswith(("[", "(", "_"))}
    assert pages, WEB_APP
    assert pages <= RESERVED, pages - RESERVED


def test_seeded_demo_doctors_have_links(tmp_path):
    settings = Settings(f"sqlite:///{tmp_path / 'seed.sqlite3'}", SECRET)
    migrate(settings.database_url)
    database = Database(settings.database_url)
    try:
        seed(database, settings)
        with database.transaction() as db:
            assert sorted(db.scalars(select(Doctor.slug))) == ["pedrogomez", "valeriaroldan"]
    finally:
        database.engine.dispose()


def test_migration_gives_links_to_existing_doctors(tmp_path):
    url = f"sqlite:///{tmp_path / 'links.sqlite3'}"
    config = alembic_config(url)
    command.upgrade(config, "0006")
    engine = Database(url).engine
    try:
        # SQL y no modelos: los modelos siguen el esquema actual, no el de la revisión 0006.
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO specialties (id, name, slug, \"createdAt\") VALUES ('s', 'Pediatría', 'pediatria', '2030-01-01 00:00:00')"))
            for index in range(3):
                connection.execute(text("""INSERT INTO users (id, email, roles, status, "createdAt", "updatedAt")
                    VALUES (:id, :email, '["DOCTOR"]', 'ACTIVE', '2030-01-01 00:00:00', '2030-01-01 00:00:00')"""), {"id": f"u{index}", "email": f"d{index}@example.com"})
                connection.execute(text("""INSERT INTO doctor_profiles (id, "userId", "firstName", "lastName", "licenseNumber", "specialtyIds", "requiresDeposit",
                    "depositCurrency", "defaultSlotMinutes", "cancellationWindowHours", timezone, "createdAt")
                    VALUES (:id, :user, 'Ana', 'Gómez', :license, '["s"]', 0, 'ARS', 30, 24, 'America/Argentina/Mendoza', :created)"""),
                    {"id": f"d{index}", "user": f"u{index}", "license": f"L{index}", "created": f"2030-01-0{index + 1} 00:00:00"})
        command.upgrade(config, "0007")
        with engine.connect() as connection:
            rows = connection.execute(text('SELECT id, slug FROM doctor_profiles ORDER BY "createdAt"')).all()
            links = connection.execute(text('SELECT name, "doctorId" FROM doctor_links ORDER BY name')).all()
        assert rows == [("d0", "anagomez"), ("d1", "anagomez-pediatria"), ("d2", None)]
        assert links == [("anagomez", "d0"), ("anagomez-pediatria", "d1")]
    finally:
        engine.dispose()
