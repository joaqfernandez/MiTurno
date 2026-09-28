"""Búsqueda pública de médicos (/medicos): filtros en la base, búsqueda por especialidad y páginas estables."""
import pytest
from app.models import Doctor, Specialty, User


def search(system, **params):
    response = system.client.get("/api/doctors", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def names(result):
    return [f"{item['firstName']} {item['lastName']}" for item in result["items"]]


def add_doctors(system, count, specialty_id, last="Aguirre", status="ACTIVE"):
    with system.database.transaction() as db:
        for index in range(count):
            user = User(id=f"user-{last}-{index}", email=f"{last}{index}@example.com", roles=["DOCTOR"], status=status)
            db.add(user)
            db.flush()
            db.add(Doctor(id=f"{last}-{index:03d}", userId=user.id, firstName=f"Medico{index:03d}", lastName=last,
                          licenseNumber=f"{last}-{index}", specialtyIds=[specialty_id]))


@pytest.fixture
def cardiology(system):
    with system.database.transaction() as db:
        db.add(Specialty(id="cardio", name="Cardiología", slug="cardiologia"))
    return "cardio"


def test_search_by_name_surname_or_both_words(system):
    assert names(search(system, q="valeria")) == ["Valeria Roldán"]
    assert names(search(system, q="Roldán")) == ["Valeria Roldán"]
    assert names(search(system, q="valeria roldán")) == ["Valeria Roldán"]
    assert search(system, q="valeria gomez")["total"] == 0


def test_search_text_also_matches_specialty(system, cardiology):
    # El buscador dice «Nombre del médico o especialidad»: escribir la especialidad tiene que encontrar médicos.
    add_doctors(system, 2, cardiology)
    assert names(search(system, q="Clínica")) == ["Valeria Roldán"]
    assert search(system, q="cardiolog")["total"] == 2
    assert names(search(system, q="valeria clínica")) == ["Valeria Roldán"]


def test_specialty_filter_is_applied_in_the_database_before_paging(system, cardiology):
    # Antes se cortaba la lista y después se filtraba: un médico fuera del corte no aparecía nunca.
    add_doctors(system, 60, cardiology)  # «Aguirre» se ordena antes que «Roldán».
    result = search(system, specialty="clinica", pageSize=12)
    assert (names(result), result["total"]) == (["Valeria Roldán"], 1)
    assert search(system, specialty="no-existe")["total"] == 0


def test_pages_are_complete_stable_and_without_repeats(system, cardiology):
    add_doctors(system, 25, cardiology)
    pages = [search(system, specialty="cardiologia", page=page, pageSize=12) for page in (1, 2, 3, 4)]
    assert [len(page["items"]) for page in pages] == [12, 12, 1, 0]
    assert {page["total"] for page in pages} == {25}
    ids = [item["id"] for page in pages for item in page["items"]]
    assert ids == sorted(ids) and len(set(ids)) == 25
    assert search(system, specialty="cardiologia", page=2, pageSize=12)["items"] == pages[1]["items"]


def test_only_active_doctors_are_listed(system, cardiology):
    add_doctors(system, 2, cardiology, last="Pendiente", status="PENDING_VERIFICATION")
    add_doctors(system, 1, cardiology, last="Suspendido", status="SUSPENDED")
    assert search(system, q="pendiente")["total"] == 0
    assert search(system, q="suspendido")["total"] == 0
    assert search(system)["total"] == 1


@pytest.mark.parametrize("term", ["%", "_", "%a%"])
def test_sql_wildcards_are_searched_as_text(system, term):
    assert search(system, q=term)["total"] == 0


@pytest.mark.parametrize("params", [{"page": 0}, {"pageSize": 51}, {"pageSize": 0}, {"q": "x" * 101}])
def test_out_of_range_parameters_are_rejected(system, params):
    assert system.client.get("/api/doctors", params=params).status_code == 400
