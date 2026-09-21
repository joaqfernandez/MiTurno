"""Transacciones SQLAlchemy; PostgreSQL en despliegue, SQLite en desarrollo rápido."""
from contextlib import contextmanager
from pathlib import Path
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from .models import Base

EDITABLE_FIELDS = ("firstName", "lastName", "documentId", "birthDate", "healthInsurance", "insuranceNumber")

class Database:
    def __init__(self, url):
        if isinstance(url, Path):
            url = f"sqlite:///{url}"
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        if url.startswith("sqlite:///"):
            Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(url, pool_pre_ping=True, connect_args={"check_same_thread": False, "timeout": 30} if url.startswith("sqlite") else {})
        if self.engine.dialect.name == "sqlite":
            @event.listens_for(self.engine, "connect")
            def configure(connection, _):
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("PRAGMA recursive_triggers=ON")
                connection.execute("PRAGMA busy_timeout=30000")
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)

    @contextmanager
    def transaction(self):
        with self.sessions() as session:
            try:
                if self.engine.dialect.name == "sqlite":
                    session.execute(text("BEGIN IMMEDIATE"))
                yield session
                session.commit()
            except Exception:
                session.rollback()
                raise

    def create_test_schema(self):
        # Solo tests. La aplicación normal utiliza Alembic, no create_all al arrancar.
        Base.metadata.create_all(self.engine)
        with self.engine.begin() as connection:
            install_guards(connection)
            from .clinical_integrity_v1 import install
            install(connection)


def install_guards(connection):
    if connection.dialect.name == "postgresql":
        connection.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS btree_gist")
        connection.exec_driver_sql("""ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
            EXCLUDE USING gist ("doctorId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&)
            WHERE (status IN ('CONFIRMED', 'PENDING_PAYMENT'))""")
        connection.exec_driver_sql("""CREATE FUNCTION reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'append-only table'; END; $$""")
        for table in ("medical_record_entries", "audit_logs"):
            connection.exec_driver_sql(f"CREATE TRIGGER immutable_{table} BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION reject_immutable_change()")
    else:
        for operation in ("INSERT", "UPDATE"):
            connection.exec_driver_sql(f"""CREATE TRIGGER appointments_overlap_{operation.lower()}
                BEFORE {operation} ON appointments WHEN NEW.status IN ('CONFIRMED', 'PENDING_PAYMENT')
                BEGIN SELECT RAISE(ABORT, 'appointment overlap') WHERE EXISTS (
                    SELECT 1 FROM appointments a WHERE a."doctorId" = NEW."doctorId"
                    AND a.id != NEW.id AND a.status IN ('CONFIRMED', 'PENDING_PAYMENT')
                    AND a."startAt" < NEW."endAt" AND a."endAt" > NEW."startAt"); END""")
        for table in ("medical_record_entries", "audit_logs"):
            for operation in ("UPDATE", "DELETE"):
                connection.exec_driver_sql(f"CREATE TRIGGER immutable_{table}_{operation.lower()} BEFORE {operation} ON {table} BEGIN SELECT RAISE(ABORT, 'append-only table'); END")
