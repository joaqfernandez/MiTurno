"""Referencias clínicas: dos pacientes y dos médicos con acceso legítimo."""
from datetime import timedelta
import pytest
from sqlalchemy import select, func, update, delete
from sqlalchemy.exc import IntegrityError
from app.auth import issue_tokens
from app.models import User, Doctor, Appointment, MedicalRecord, MedicalEntry, AuditLog, now


@pytest.fixture
def clinical(system, password_hash):
    with system.database.transaction() as db:
        db.add(User(id='user-colleague', email='colleague@example.com', passwordHash=password_hash,
                    roles=['DOCTOR'], status='ACTIVE'))
        db.flush()
        db.add(Doctor(id='colleague', userId='user-colleague', firstName='Pedro', lastName='Prueba',
                      licenseNumber='COLLEAGUE', icsFeedToken='colleague-feed'))
        db.flush()
        system.tokens['colleague'] = issue_tokens(db, db.get(User, 'user-colleague'), system.settings)
        start = now() + timedelta(days=2)
        for offset, (identity, patient, doctor) in enumerate([
            ('own-visit', 'patient-own', 'doctor'), ('own-later', 'patient-own', 'doctor'),
            ('other-visit', 'patient-other', 'doctor'), ('colleague-visit', 'patient-own', 'colleague'),
        ]):
            begin = start + timedelta(hours=offset)
            db.add(Appointment(id=identity, patientId=patient, doctorId=doctor,
                               startAt=begin, endAt=begin + timedelta(minutes=30), status='CONFIRMED'))
    return system


def entry(system, name='doctor', **overrides):
    return system.client.post('/api/medical-records/entries', headers=system.headers(name), json={
        'patientId':'patient-own', 'title':'Evolución de prueba', 'content':'Contenido ficticio', **overrides})


def counts(system):
    with system.database.transaction() as db:
        return tuple(db.scalar(select(func.count()).select_from(model)) for model in (MedicalRecord, MedicalEntry, AuditLog))


@pytest.mark.parametrize('reference', ['missing', 'other-visit', 'colleague-visit', ''])
def test_invalid_appointment_creates_neither_record_nor_entry_nor_audit(clinical, reference):
    before = counts(clinical)
    response = entry(clinical, appointmentId=reference)
    assert response.status_code == 400, response.text
    assert counts(clinical) == before


@pytest.mark.parametrize('state', ['PENDING_PAYMENT', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_DOCTOR'])
def test_new_entry_rejects_ineligible_appointment_even_with_other_relationship(clinical, state):
    with clinical.database.transaction() as db:
        db.get(Appointment, 'own-visit').status = state
    before = counts(clinical)
    assert entry(clinical, appointmentId='own-visit').status_code == 400
    assert counts(clinical) == before


@pytest.mark.parametrize('state', ['CONFIRMED', 'COMPLETED', 'NO_SHOW'])
def test_allowed_appointment_states(clinical, state):
    with clinical.database.transaction() as db:
        db.get(Appointment, 'own-visit').status = state
    response = entry(clinical, appointmentId='own-visit')
    assert response.status_code == 201
    assert response.json()['appointmentId'] == 'own-visit'


@pytest.mark.parametrize('status', ['PENDING_PAYMENT', 'CANCELLED_BY_PATIENT'])
def test_unlinked_entry_still_requires_qualifying_relationship(clinical, status):
    with clinical.database.transaction() as db:
        db.execute(update(Appointment).where(Appointment.doctorId == 'doctor').values(status=status))
    before = counts(clinical)
    assert entry(clinical).status_code == 403
    assert counts(clinical) == before


@pytest.mark.parametrize('reference', ['missing', ''])
def test_missing_amendment_is_rejected_without_side_effects(clinical, reference):
    before = counts(clinical)
    assert entry(clinical, amendsEntryId=reference).status_code == 400
    assert counts(clinical) == before


def test_cross_patient_reference_rejected_despite_access_to_both_patients(clinical):
    original = entry(clinical).json()
    before = counts(clinical)
    assert entry(clinical, patientId='patient-other', amendsEntryId=original['id']).status_code == 400
    assert counts(clinical) == before


def test_colleague_can_write_own_note_but_cannot_amend_another_author(clinical):
    original = entry(clinical, appointmentId='own-visit').json()
    before = counts(clinical)
    assert entry(clinical, 'colleague', amendsEntryId=original['id']).status_code == 403
    assert counts(clinical) == before
    assert entry(clinical, 'colleague', appointmentId='colleague-visit').status_code == 201
    for role, can_amend in [('doctor', True), ('colleague', False), ('own', False), ('admin', False)]:
        record = clinical.client.get('/api/medical-records/patient-own', headers=clinical.headers(role)).json()
        assert next(e for e in record['entries'] if e['id'] == original['id'])['canAmend'] is can_amend


@pytest.mark.parametrize('replacement', ['own-later', None, 'other-visit', 'colleague-visit'])
def test_amendment_cannot_change_or_remove_original_episode(clinical, replacement):
    original = entry(clinical, appointmentId='own-visit').json()
    before = counts(clinical)
    assert entry(clinical, amendsEntryId=original['id'], appointmentId=replacement).status_code == 400
    assert counts(clinical) == before


def test_amendment_without_appointment_inherits_episode_through_chain(clinical):
    original = entry(clinical, appointmentId='own-visit').json()
    correction = entry(clinical, amendsEntryId=original['id'], content='Corrección').json()
    last = entry(clinical, amendsEntryId=correction['id'], content='Segunda corrección').json()
    assert correction['appointmentId'] == last['appointmentId'] == 'own-visit'
    with clinical.database.transaction() as db:
        assert db.get(MedicalEntry, original['id']).content == 'Contenido ficticio'
        assert db.get(MedicalEntry, correction['id']).content == 'Corrección'
        assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == 'medical_record.write')) == 3


def test_unlinked_amendment_stays_unlinked(clinical):
    original = entry(clinical).json()
    assert entry(clinical, amendsEntryId=original['id'], appointmentId='own-visit').status_code == 400
    response = entry(clinical, amendsEntryId=original['id'])
    assert response.status_code == 201
    assert response.json()['appointmentId'] is None


def test_existing_entry_can_be_corrected_after_cancellation_with_relationship(clinical):
    original = entry(clinical, appointmentId='own-visit').json()
    with clinical.database.transaction() as db:
        db.get(Appointment, 'own-visit').status = 'CANCELLED_BY_PATIENT'
    assert entry(clinical, amendsEntryId=original['id']).status_code == 201


def test_audit_failure_rolls_back_new_record_and_entry(clinical, monkeypatch):
    def fail(*args):
        raise RuntimeError('audit unavailable')
    monkeypatch.setattr('app.medical_records.audit', fail)
    before = counts(clinical)
    with pytest.raises(RuntimeError, match='audit unavailable'):
        entry(clinical, appointmentId='own-visit')
    assert counts(clinical) == before


@pytest.mark.parametrize('mutation', ['cross_record', 'cross_doctor', 'cross_episode', 'remove_episode',
                                      'missing_original', 'self_reference', 'cross_patient_visit', 'wrong_doctor_visit'])
def test_database_rejects_invalid_references_when_api_is_bypassed(clinical, mutation):
    original = entry(clinical, appointmentId='own-visit').json()
    other = entry(clinical, patientId='patient-other', appointmentId='other-visit').json()
    values = dict(id='injected', recordId=original['recordId'], doctorId='doctor', appointmentId='own-visit',
                  amendsEntryId=original['id'], title='Intento', content='Ficticio')
    overrides = {
        'cross_record': {'recordId':other['recordId']},
        'cross_doctor': {'doctorId':'colleague'},
        'cross_episode': {'appointmentId':'own-later'},
        'remove_episode': {'appointmentId':None},
        'missing_original': {'amendsEntryId':'missing'},
        'self_reference': {'amendsEntryId':'injected'},
        'cross_patient_visit': {'amendsEntryId':None, 'appointmentId':'other-visit'},
        'wrong_doctor_visit': {'amendsEntryId':None, 'appointmentId':'colleague-visit'},
    }
    before = counts(clinical)
    with pytest.raises(IntegrityError):
        with clinical.database.transaction() as db:
            db.add(MedicalEntry(**(values | overrides[mutation])))
    assert counts(clinical) == before


@pytest.mark.parametrize('state', ['PENDING_PAYMENT', 'CANCELLED_BY_PATIENT'])
def test_database_rejects_new_entry_for_ineligible_visit(clinical, state):
    original = entry(clinical).json()
    with clinical.database.transaction() as db:
        db.get(Appointment, 'own-visit').status = state
    with pytest.raises(IntegrityError):
        with clinical.database.transaction() as db:
            db.add(MedicalEntry(recordId=original['recordId'], doctorId='doctor', appointmentId='own-visit', title='A', content='B'))


@pytest.mark.parametrize('target', ['entry_update', 'entry_delete', 'record_patient', 'appointment_patient', 'appointment_doctor'])
def test_database_preserves_entries_and_parent_ownership(clinical, target):
    original = entry(clinical, appointmentId='own-visit').json()
    statements = {
        'entry_update': update(MedicalEntry).where(MedicalEntry.id == original['id']).values(content='Changed'),
        'entry_delete': delete(MedicalEntry).where(MedicalEntry.id == original['id']),
        'record_patient': update(MedicalRecord).where(MedicalRecord.id == original['recordId']).values(patientId='patient-other'),
        'appointment_patient': update(Appointment).where(Appointment.id == 'own-visit').values(patientId='patient-other'),
        'appointment_doctor': update(Appointment).where(Appointment.id == 'own-visit').values(doctorId='colleague'),
    }
    with pytest.raises(IntegrityError):
        with clinical.database.transaction() as db:
            db.execute(statements[target])


def migration_config(system):
    from alembic.config import Config
    from conftest import ROOT
    config = Config(str(ROOT / 'alembic.ini'))
    config.set_main_option('sqlalchemy.url', system.settings.database_url)
    return config


def test_migration_preserves_valid_history_and_cancelled_episodes(clinical):
    from alembic import command
    original = entry(clinical, appointmentId='own-visit').json()
    entry(clinical, amendsEntryId=original['id'])
    with clinical.database.transaction() as db:
        db.get(Appointment, 'own-visit').status = 'CANCELLED_BY_PATIENT'
        expected = list(db.execute(select(MedicalEntry.id, MedicalEntry.content, MedicalEntry.appointmentId)))
    config = migration_config(clinical)
    command.downgrade(config, '0003')
    command.upgrade(config, 'head')
    with clinical.database.transaction() as db:
        assert list(db.execute(select(MedicalEntry.id, MedicalEntry.content, MedicalEntry.appointmentId))) == expected


@pytest.mark.parametrize('mutation', ['record', 'author', 'episode', 'null_episode'])
def test_migration_stops_before_touching_inconsistent_history(clinical, mutation):
    from alembic import command
    from sqlalchemy import text
    original = entry(clinical, appointmentId='own-visit').json()
    other = entry(clinical, patientId='patient-other').json()
    config = migration_config(clinical)
    command.downgrade(config, '0003')
    changes = {'record':{'recordId':other['recordId']}, 'author':{'doctorId':'colleague'},
               'episode':{'appointmentId':'own-later'}, 'null_episode':{'appointmentId':None}}
    with clinical.database.transaction() as db:
        values = dict(id='legacy', recordId=original['recordId'], doctorId='doctor', appointmentId='own-visit',
                      amendsEntryId=original['id'], title='Histórico', content='No modificar')
        db.add(MedicalEntry(**(values | changes[mutation])))
    before = counts(clinical)
    with pytest.raises(RuntimeError, match='referencias inconsistentes'):
        command.upgrade(config, 'head')
    assert counts(clinical) == before
    with clinical.database.transaction() as db:
        assert db.get(MedicalEntry, 'legacy').content == 'No modificar'
        assert db.scalar(text('SELECT version_num FROM alembic_version')) == '0003'


@pytest.mark.parametrize('target', ['entry', 'record', 'appointment'])
def test_sqlite_replace_cannot_bypass_immutability(clinical, target):
    from sqlalchemy import text
    original = entry(clinical, appointmentId='own-visit').json()
    queries = {
        'entry': '''INSERT OR REPLACE INTO medical_record_entries
            (id, "createdAt", "recordId", "doctorId", "appointmentId", title, content)
            SELECT id, "createdAt", "recordId", "doctorId", "appointmentId", title, 'Replaced'
            FROM medical_record_entries WHERE id = :id''',
        'record': '''INSERT OR REPLACE INTO medical_records (id, "createdAt", "patientId")
            SELECT id, "createdAt", 'patient-other' FROM medical_records WHERE id = :id''',
        'appointment': '''INSERT OR REPLACE INTO appointments
            (id, "createdAt", "updatedAt", "patientId", "doctorId", "startAt", "endAt", status)
            SELECT id, "createdAt", "updatedAt", 'patient-other', "doctorId", "startAt", "endAt", status
            FROM appointments WHERE id = :id''',
    }
    identities = {'entry':original['id'], 'record':original['recordId'], 'appointment':'own-visit'}
    with pytest.raises(IntegrityError):
        with clinical.database.transaction() as db:
            db.execute(text(queries[target]), {'id':identities[target]})
    with clinical.database.transaction() as db:
        assert db.get(MedicalEntry, original['id']).content == 'Contenido ficticio'
        assert db.get(MedicalRecord, original['recordId']).patientId == 'patient-own'
        assert db.get(Appointment, 'own-visit').patientId == 'patient-own'


@pytest.mark.parametrize('alias', ['rowid', '_rowid_', 'oid'])
def test_sqlite_rowid_replace_cannot_delete_original_even_without_recursive_triggers(clinical, alias):
    from sqlalchemy import text
    original = entry(clinical).json()
    with clinical.database.engine.connect() as connection:
        connection.exec_driver_sql('PRAGMA recursive_triggers=OFF')
        try:
            with pytest.raises(IntegrityError):
                connection.execute(text(f'''INSERT OR REPLACE INTO medical_record_entries
                    ({alias}, id, "createdAt", "recordId", "doctorId", title, content)
                    SELECT {alias}, 'replacement', "createdAt", "recordId", "doctorId", title, 'Replaced'
                    FROM medical_record_entries WHERE id = :id'''), {'id':original['id']})
            connection.rollback()
            assert connection.scalar(text('SELECT content FROM medical_record_entries WHERE id = :id'), {'id':original['id']}) == 'Contenido ficticio'
        finally:
            connection.exec_driver_sql('PRAGMA recursive_triggers=ON')


def test_reader_never_embeds_an_amendment_from_another_history(clinical):
    from alembic import command
    original = entry(clinical).json()
    other = entry(clinical, patientId='patient-other').json()
    # Simula un dato histórico previo a los guards, sin desactivar la autorización.
    command.downgrade(migration_config(clinical), '0003')
    with clinical.database.transaction() as db:
        db.add(MedicalEntry(id='legacy-cross-record', recordId=other['recordId'], doctorId='doctor',
            amendsEntryId=original['id'], title='Nota de otro paciente', content='No debe aparecer'))
    response = clinical.client.get('/api/medical-records/patient-own', headers=clinical.headers('own'))
    assert response.status_code == 200
    assert response.json()['entries'][0]['amendments'] == []
    assert 'No debe aparecer' not in response.text
