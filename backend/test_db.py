import asyncio
from sqlmodel import SQLModel, select
from app.db import engine, async_session
from app.models import Conversation

async def main():
    print("==================================================")
    print("  🚀 NEON CLOUD DATABASE BOOTSTRAP & VERIFY 🚀  ")
    print("==================================================")
    
    # 1. Initialize Tables Asynchronously
    print("\n1. Connecting and rebuilding tables in Neon...")
    try:
        async with engine.begin() as conn:
            # Drop old tables first to ensure the new decimal schema is applied
            print("Wiping old tables...")
            await conn.run_sync(SQLModel.metadata.drop_all)
            print("Creating new tables with high-precision fields...")
            await conn.run_sync(SQLModel.metadata.create_all)
        print("✅ Success: All PostgreSQL tables created successfully!")
    except Exception as e:
        print(f"❌ Error during table creation: {e}")
        return

    # 2. Insert a mock row to verify write access
    print("\n2. Testing database WRITE access...")
    try:
        async with async_session() as session:
            mock_conv = Conversation(
                title="Neon Verification Chat",
                model="gemini-2.5-flash"
            )
            session.add(mock_conv)
            await session.commit()
            # Refresh to get the generated UUID
            await session.refresh(mock_conv)
            mock_id = mock_conv.id
            print(f"✅ Success: Mock Conversation inserted with UUID: {mock_id}")
    except Exception as e:
        print(f"❌ Error during database write: {e}")
        return

    # 3. Query the mock row to verify read access
    print("\n3. Testing database READ access...")
    try:
        async with async_session() as session:
            statement = select(Conversation).where(Conversation.id == mock_id)
            results = await session.execute(statement)
            fetched_conv = results.scalar_one_or_none()
            if fetched_conv:
                print(f"✅ Success: Queried conversation '{fetched_conv.title}' back successfully!")
            else:
                print("❌ Error: Query returned empty results.")
    except Exception as e:
        print(f"❌ Error during database read: {e}")
        return

    print("\n==================================================")
    print("  🎉 CONGRATULATIONS: NEON POSTGRES IS 100% LIVE! 🎉 ")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(main())
