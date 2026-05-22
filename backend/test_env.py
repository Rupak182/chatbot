from app.config import settings

print("====================================")
print("  ENV & CONFIG LOADER VERIFICATION  ")
print("====================================")
print("DATABASE_URL:      ", settings.DATABASE_URL)
print("PORT:              ", settings.PORT)
print("GEMINI_API_KEY Set:", bool(settings.GEMINI_API_KEY))
print("====================================")
