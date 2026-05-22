import os
from dotenv import load_dotenv

# Load .env file from the backend folder
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(dotenv_path=os.path.join(BASE_DIR, ".env"))

class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/chatbot"
    )
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # Defensive parsing for PORT env variable
    @property
    def PORT(self) -> int:
        try:
            return int(os.getenv("PORT", "8000"))
        except (ValueError, TypeError):
            return 8000

settings = Settings()
