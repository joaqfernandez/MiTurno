"""DDL de integridad clínica usado por la revisión 0004 y esquemas de prueba.

Contrato versionado: no modificar estas reglas en futuras migraciones;
crear una nueva versión para que una instalación histórica sea reproducible.
"""
from sqlalchemy import text


# No se comprueba el estado ACTUAL del turno: puede haberse cancelado después
# de firmar una evolución válida. Las referencias estructurales sí son permanentes.
INVALID_REFERENCES = '''
SELECT count(*) FROM medical_record_entries e
LEFT JOIN medical_records r ON r.id = e."recordId"
LEFT JOIN appointments a ON a.id = e."appointmentId"
LEFT JOIN medical_record_entries original ON original.id = e."amendsEntryId"
WHERE r.id IS NULL
   OR (e."appointmentId" IS NOT NULL AND
       (a.id IS NULL OR a."patientId" <> r."patientId" OR a."doctorId" <> e."doctorId"))
   OR (e."amendsEntryId" IS NOT NULL AND
       (original.id IS NULL OR original.id = e.id OR original."recordId" <> e."recordId"
        OR original."doctorId" <> e."doctorId"
        OR original."appointmentId" IS DISTINCT FROM e."appointmentId"))
'''


def validate_existing(connection):
    count = connection.scalar(text(INVALID_REFERENCES))
    if count:
        raise RuntimeError(f"Migración clínica detenida: {count} entradas con referencias inconsistentes. "
                           "Revisar su procedencia; no se modificó ni eliminó contenido clínico.")


def install(connection):
    if connection.dialect.name == "postgresql":
        connection.exec_driver_sql('''CREATE FUNCTION validate_clinical_entry_v1() RETURNS trigger AS $$
        DECLARE
            patient_id text;
            original record;
            appointment record;
        BEGIN
            SELECT "patientId" INTO patient_id FROM medical_records WHERE id = NEW."recordId";
            IF NOT FOUND THEN
                RAISE EXCEPTION 'clinical record missing' USING ERRCODE = '23514';
            END IF;
            IF NEW."amendsEntryId" IS NOT NULL THEN
                SELECT * INTO original FROM medical_record_entries WHERE id = NEW."amendsEntryId";
                IF NOT FOUND OR original.id = NEW.id OR original."recordId" <> NEW."recordId"
                   OR original."doctorId" <> NEW."doctorId"
                   OR original."appointmentId" IS DISTINCT FROM NEW."appointmentId" THEN
                    RAISE EXCEPTION 'invalid clinical amendment reference' USING ERRCODE = '23514';
                END IF;
            END IF;
            IF NEW."appointmentId" IS NOT NULL THEN
                SELECT * INTO appointment FROM appointments WHERE id = NEW."appointmentId" FOR SHARE;
                IF NOT FOUND OR appointment."patientId" <> patient_id OR appointment."doctorId" <> NEW."doctorId" THEN
                    RAISE EXCEPTION 'invalid clinical appointment reference' USING ERRCODE = '23514';
                END IF;
                IF NEW."amendsEntryId" IS NULL AND appointment.status NOT IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW') THEN
                    RAISE EXCEPTION 'invalid clinical appointment status' USING ERRCODE = '23514';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql''')
        connection.exec_driver_sql('''CREATE TRIGGER clinical_entry_references_v1
            BEFORE INSERT ON medical_record_entries FOR EACH ROW EXECUTE FUNCTION validate_clinical_entry_v1()''')
        connection.exec_driver_sql('''CREATE FUNCTION preserve_clinical_owner_v1() RETURNS trigger AS $$
        BEGIN
            IF NEW."patientId" IS DISTINCT FROM OLD."patientId" THEN
                RAISE EXCEPTION 'clinical patient is immutable' USING ERRCODE = '23514';
            END IF;
            IF TG_TABLE_NAME = 'appointments' THEN
                IF NEW."doctorId" IS DISTINCT FROM OLD."doctorId" THEN
                    RAISE EXCEPTION 'appointment doctor is immutable' USING ERRCODE = '23514';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql''')
        for table in ("medical_records", "appointments"):
            connection.exec_driver_sql(f'''CREATE TRIGGER clinical_owner_v1 BEFORE UPDATE ON {table}
                FOR EACH ROW EXECUTE FUNCTION preserve_clinical_owner_v1()''')
    else:
        connection.exec_driver_sql('''CREATE TRIGGER clinical_entry_references_v1
        BEFORE INSERT ON medical_record_entries BEGIN
            SELECT RAISE(ABORT, 'clinical entry is immutable') WHERE EXISTS (
                SELECT 1 FROM medical_record_entries WHERE id = NEW.id OR rowid = NEW.rowid);
            SELECT RAISE(ABORT, 'clinical record missing') WHERE NOT EXISTS (
                SELECT 1 FROM medical_records WHERE id = NEW."recordId");
            SELECT RAISE(ABORT, 'invalid clinical amendment reference')
                WHERE NEW."amendsEntryId" IS NOT NULL AND (NEW."amendsEntryId" = NEW.id OR NOT EXISTS (
                    SELECT 1 FROM medical_record_entries original WHERE original.id = NEW."amendsEntryId"
                    AND original."recordId" = NEW."recordId" AND original."doctorId" = NEW."doctorId"
                    AND original."appointmentId" IS NEW."appointmentId"));
            SELECT RAISE(ABORT, 'invalid clinical appointment reference')
                WHERE NEW."appointmentId" IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM appointments a JOIN medical_records r ON r.id = NEW."recordId"
                    WHERE a.id = NEW."appointmentId" AND a."patientId" = r."patientId" AND a."doctorId" = NEW."doctorId");
            SELECT RAISE(ABORT, 'invalid clinical appointment status')
                WHERE NEW."appointmentId" IS NOT NULL AND NEW."amendsEntryId" IS NULL AND EXISTS (
                    SELECT 1 FROM appointments WHERE id = NEW."appointmentId" AND status NOT IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW'));
        END''')
        for table in ("medical_records", "appointments"):
            condition = 'NEW."patientId" IS NOT OLD."patientId"'
            if table == "appointments":
                condition += ' OR NEW."doctorId" IS NOT OLD."doctorId"'
            connection.exec_driver_sql(f'''CREATE TRIGGER clinical_owner_{table}_v1
                BEFORE UPDATE ON {table} WHEN {condition}
                BEGIN SELECT RAISE(ABORT, 'clinical ownership is immutable'); END''')
            # REPLACE omite triggers DELETE salvo recursive_triggers=ON. No depender
            # de la configuración de cada cliente para preservar la identidad.
            connection.exec_driver_sql(f'''CREATE TRIGGER clinical_owner_insert_{table}_v1
                BEFORE INSERT ON {table} WHEN EXISTS (SELECT 1 FROM {table} WHERE id = NEW.id OR rowid = NEW.rowid)
                BEGIN SELECT RAISE(ABORT, 'clinical parent cannot be replaced'); END''')


def uninstall(connection):
    connection.exec_driver_sql("DROP TRIGGER clinical_entry_references_v1" +
                               (" ON medical_record_entries" if connection.dialect.name == "postgresql" else ""))
    if connection.dialect.name == "postgresql":
        for table in ("medical_records", "appointments"):
            connection.exec_driver_sql(f"DROP TRIGGER clinical_owner_v1 ON {table}")
        connection.exec_driver_sql("DROP FUNCTION validate_clinical_entry_v1()")
        connection.exec_driver_sql("DROP FUNCTION preserve_clinical_owner_v1()")
    else:
        for table in ("medical_records", "appointments"):
            connection.exec_driver_sql(f"DROP TRIGGER clinical_owner_{table}_v1")
            connection.exec_driver_sql(f"DROP TRIGGER clinical_owner_insert_{table}_v1")
