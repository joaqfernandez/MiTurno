"""Las migraciones Alembic son la única fuente del esquema: deben coincidir con los modelos y ser reversibles."""
import os
from uuid import uuid4
import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url
from app.models import Base
from conftest import ROOT


def alembic_config(url):
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


@pytest.fixture(params=["sqlite", "postgresql"])
def database_url(request, tmp_path):
    if request.param == "sqlite":
        yield f"sqlite:///{tmp_path / 'migrations.sqlite3'}"
        return
    if not os.getenv("TEST_POSTGRES_URL"):
        pytest.skip("Requiere TEST_POSTGRES_URL; nunca usa la DB de desarrollo")
    root_url = make_url(os.environ["TEST_POSTGRES_URL"])
    name = "miturno_test_" + uuid4().hex
    root = create_engine(root_url, isolation_level="AUTOCOMMIT")
    with root.connect() as connection:
        connection.exec_driver_sql(f'CREATE DATABASE "{name}"')
    try:
        yield root_url.set(database=name).render_as_string(hide_password=False)
    finally:
        with root.connect() as connection:
            connection.exec_driver_sql(f'DROP DATABASE "{name}" WITH (FORCE)')
        root.dispose()


def schema_differences(url):
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(connection, opts={"compare_type": True})
            return compare_metadata(context, Base.metadata)
    finally:
        engine.dispose()


def user_tables(url):
    engine = create_engine(url)
    try:
        return set(inspect(engine).get_table_names()) - {"alembic_version"}
    finally:
        engine.dispose()


def test_revisions_form_a_single_linear_chain():
    script = ScriptDirectory.from_config(alembic_config("sqlite://"))
    assert len(script.get_heads()) == 1, "Hay más de una cabeza: unificar las migraciones"
    for revision in script.walk_revisions():
        assert not revision.is_merge_point and not revision.is_branch_point, revision.revision


def test_models_match_migrations(database_url):
    command.upgrade(alembic_config(database_url), "head")
    differences = schema_differences(database_url)
    assert not differences, f"Los modelos cambiaron sin migración nueva: {differences}"


def test_every_migration_can_be_reverted_and_reapplied(database_url):
    config = alembic_config(database_url)
    revisions = [r.revision for r in reversed(list(ScriptDirectory.from_config(config).walk_revisions()))]
    for revision in revisions:
        command.upgrade(config, revision)
        command.downgrade(config, "-1")
        command.upgrade(config, revision)
    command.downgrade(config, "base")
    assert user_tables(database_url) == set(), "El downgrade completo dejó tablas"
    command.upgrade(config, "head")
    assert not schema_differences(database_url)
