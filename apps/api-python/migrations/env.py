from alembic import context
from sqlalchemy import create_engine
from app.models import Base, UTCDateTime
from app.config import Settings

config = context.config
url = config.get_main_option("sqlalchemy.url") or Settings.load().database_url
if url.startswith("postgresql://"):
    url = url.replace("postgresql://", "postgresql+psycopg://", 1)

def render_item(kind, value, autogen_context):
    if kind == "type" and isinstance(value, UTCDateTime):
        return "sa.DateTime(timezone=True)"
    return False

if context.is_offline_mode():
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True, render_item=render_item)
    with context.begin_transaction():
        context.run_migrations()
else:
    with create_engine(url).connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, render_item=render_item)
        with context.begin_transaction():
            context.run_migrations()
