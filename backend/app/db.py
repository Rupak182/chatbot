from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Configure dynamic connection arguments (e.g. SSL for cloud Neon/Supabase, no SSL for localhost)
connect_args = {}
if "localhost" not in settings.DATABASE_URL and "127.0.0.1" not in settings.DATABASE_URL:
    connect_args["ssl"] = True

# Initialize high-performance async connection engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,             # Set to True if you want to inspect SQL queries in the logs
    future=True,
    pool_size=20,           # Keep 20 open connections to PostgreSQL
    max_overflow=10,        # Allow temporary overflow during peaks
    pool_pre_ping=True,     # Test connections before using them to prevent dropouts
    pool_recycle=3600,      # Recycle connections every 1 hour to prevent stale links
    connect_args=connect_args
)

# Async Session maker with expire_on_commit=False (prevents lazy-load failures)
async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Async dependency session generator for FastAPI routers
async def get_session() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
