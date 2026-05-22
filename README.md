# Ollive High-Performance Telemetry Chatbot Platform

A lightweight, production-grade LLM inference logging and ingestion workspace built with a **FastAPI backend streaming proxy** and a **Next.js frontend**. The system features real-time non-blocking event-driven telemetry (capturing model usage, token count, and full round-trip latencies) while maintaining stateful session management, conversation listing, cancellation, and resume capabilities.

---

## 🛠️ Manual Development Setup

### 1. Backend Setup (FastAPI + SQLModel + LiteLLM)
Navigate to the backend folder, configure virtualenv, and start the app:

```bash
cd backend

# Initialize environment variables
cp .env.example .env
# Edit .env and supply your API keys and Neon/Postgres DATABASE_URL:
# - DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/ollive
# - GEMINI_API_KEY=AIzaSy...
# - GROQ_API_KEY=gsk_...

# Install dependencies and start using uv (extremely fast)
uv sync
uv run app/main.py
```

### 2. Frontend Setup (React 19 + Next.js + Tailwind CSS)
Navigate to the frontend folder, install dependencies, and start the dev server:

```bash
cd frontend

# Install packages
npm install

# Start Next.js development server
npm run dev
```

---

## 📐 System Architecture Overview

The workspace uses a direct **FastAPI Streaming Proxy Architecture**. Next.js acts as a 100% static client, eliminating server-action hops and direct client-side logging SDK calls.

```
[Browser Client] 
     │
     ├── 1. Streaming Prompt (POST /api/v1/chat/stream) ──> [FastAPI Backend]
     │                                                            │
     │<── 2. Streaming Response Chunks (SSE Plaintext) <─────────├──> [LiteLLM / Gemini or Groq API]
     │                                                            │
     │└── 3. Update HUD Data (GET /telemetry) <───────────────────└──> [Background task writes to PG]
```

### Key Technical Decisions:
* **Decoupled Provider-Agnostic Routing**: The backend is 100% model-agnostic. The frontend select dropdown passes fully qualified provider paths directly to the backend (`gemini/gemini-2.5-flash-lite`, `groq/llama-3.3-70b-versatile`). The backend routes these straight to LiteLLM with zero string matching or hardcoding! This makes adding new LLMs fully plug-and-play.
* **Direct FastAPI Proxying**: The browser calls FastAPI directly. FastAPI uses `liteLLM` to manage upstream LLM interactions, yielding clean SSE text chunks back to the browser immediately. This avoids doubling the response latency through a Next.js middle-man node hop.
* **Non-Blocking Telemetry**: Telemetry collection is offloaded to FastAPI's asynchronous `BackgroundTasks`. This ensures database read/writes for telemetry logging never block or delay the active text streaming.

---

## 🗄️ Database Schema Design

We use **SQLModel** to map PostgreSQL tables. The schema decouples the real-time chat pipeline from detailed telemetry analysis to maximize query efficiency:

1. **`conversations`**: Holds the metadata for the session (UUID, title, selected model).
2. **`messages`**: Multi-turn history. Each message is linked to a conversation (`conversation_id`) and stores the roles (`user`, `assistant`) and character-level contents.
3. **`inference_logs`**: Fully isolated telemetry storage mapping provider metadata, latency, status (`success`, `error`, `canceled`), token counters (`prompt_tokens`, `completion_tokens`, `total_tokens`), and exact timestamps.

---

## ⚖️ Tradeoffs Made

* **Decoupled Tables vs. Unified Schema**: Decoupling `messages` and `inference_logs` ensures that rendering chat histories remains blazingly fast (simple index queries) while keeping analytics/inference auditing perfectly scalable for separate high-frequency querying.
* **BackgroundTasks vs. Celery**: For a lightweight codebase, FastAPI's native `BackgroundTasks` operates flawlessly without the database/worker overhead of Celery or Redis, while retaining full reliability.

---

## 🔮 Future Improvements (With More Time)

1. **Redis Ingestion Buffer**: Implement a Redis queue between FastAPI and PostgreSQL to aggregate massive logging loads into batch inserts, shielding the database from write spikes during traffic bursts.
2. **PII Redaction Filter**: Add regex and entity-recognition scrubbers (e.g. Presidio) inside the background task worker to automatically mask sensitive PII fields (SSNs, credit cards, API keys) before writing logs to PostgreSQL.
3. **Analytics Visualization Dashboard**: Expand the telemetry header into a full-scale charting dashboard using Recharts/Tremor to display real-time throughput, median latency trends, and error rates over time.
