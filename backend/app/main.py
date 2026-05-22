import sys
import os
# Automatically append parent directory to sys.path to allow absolute imports when run directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.conversations import router as conversations_router
from app.routes.stream import router as stream_router

# Initialize the main FastAPI Application
app = FastAPI(
    title=" LLM Inference Telemetry Backend",
    description="LLM proxy and inference logging system.",
    version="1.0.0"
)

# Configure CORS Middleware
# Allows the Next.js frontend (running on localhost:3000) to communicate securely with the API
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers under the unified api/v1 API prefix
app.include_router(conversations_router, prefix="/api/v1")
app.include_router(stream_router, prefix="/api/v1")

# Health check route for system status monitoring
@app.get("/health", tags=["system"])
async def health_check():
    return {
        "status": "healthy",
        "api_version": "1.0.0"
    }

# Allows running the server directly via 'python app/main.py' if desired
if __name__ == "__main__":
    print(f"Starting Backend Server on port {settings.PORT}...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
