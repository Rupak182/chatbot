# Ollive High-Performance Telemetry Chatbot Platform

A lightweight, production-grade LLM inference logging and ingestion workspace built with a **FastAPI backend streaming proxy** and a **Next.js frontend**. The system features real-time, non-blocking telemetry (capturing model usage, token count, and full round-trip latencies) while maintaining stateful session management, PII redaction, conversation listing, cancellation, and resume capabilities.

---

## 🚀 Docker Compose Setup (One-Command Boot)

The entire application stack is fully containerized and orchestrated using Docker Compose. You do not need to manually configure local databases, virtual environments, or Node packages.

### 1. Configure your API Keys
Create a `.env` file in the root directory (or edit the existing one) to supply your LLM credentials:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/ollive
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
```
*(Note: We use the database host `postgres` since Docker Compose connects our containers together using their service names!)*

### 2. Launch the Application Stack
Run the following single command in your terminal from the project root:
```bash
docker-compose up --build
```
This automatically downloads PostgreSQL 16, compiles your custom FastAPI and Next.js standalone images, hooks up persistent database storage volumes, and launches the entire network bridge.

### 3. Access the Services
Once the logs show that all services are online and ready:
* 🖥️ **Chatbot & Telemetry Dashboard**: [http://localhost:3000](http://localhost:3000)
* ⚙️ **FastAPI Swagger Interactive Docs**: [http://localhost:8001/docs](http://localhost:8001/docs)

---

## 📐 System Architecture Overview

The workspace uses a direct **FastAPI Streaming Proxy Architecture**. Next.js acts as a 100% static client, eliminating server-action hops and direct client-side logging SDK calls.

```
[Browser Client] 
     │
     ├── 1. Streaming Prompt (POST /api/v1/chat/stream) ─────────> [FastAPI Backend]
     │                                                                   │
     │                                                                   ├── 2. Proxy Stream (async) ──> [LiteLLM / upstream AI]
     │<── 3. Streaming Response Chunks (SSE Plaintext) <─────────────────┤
     │                                                                   │
     │                                                                   └── 4. Offload Telemetry ─────> [Background task]
     │                                                                                                        │
     │                                                                                                   5. Write to DB
     │                                                                                                        │
     │<── 6. Refresh HUD Data (GET /api/v1/conversations/{id}/telemetry) <─ [PostgreSQL Database] <───────────┘
```

### Key Technical Decisions:
* **Decoupled Provider-Agnostic Routing**: The backend is 100% model-agnostic. The frontend select dropdown passes fully qualified provider paths directly to the backend (`gemini/gemini-2.5-flash-lite`, `groq/llama-3.3-70b-versatile`). The backend routes these straight to LiteLLM with zero string matching or hardcoding! This makes adding new LLMs fully plug-and-play.
* **Direct FastAPI Proxying**: The browser calls FastAPI directly. FastAPI uses `liteLLM` to manage upstream LLM interactions, yielding SSE text chunks back to the browser immediately. This avoids doubling the response latency through a Next.js middle-man node hop.
* **Non-Blocking Telemetry**: Telemetry collection is offloaded to FastAPI's asynchronous `BackgroundTasks`. This ensures database read/writes for telemetry logging never block or delay the active text streaming.
* **High-Speed PII Redaction**: All incoming user prompts and assistant replies are automatically scanned and scrubbed of sensitive information (such as credit cards, API keys, phone numbers, and emails) at the backend ingestion layer before database storage.

---

## 🗄️ Database Schema Design

We use **SQLModel** to map PostgreSQL tables. The schema decouples the real-time chat pipeline from detailed telemetry analysis to maximize query efficiency:

1. **`conversations`**: Holds the metadata for the session (UUID, title, selected model).
2. **`messages`**: Multi-turn history. Each message is linked to a conversation (`conversation_id`) and stores the roles (`user`, `assistant`) and character-level contents.
3. **`inference_logs`**: Fully isolated telemetry storage mapping provider metadata, latency, status (`success`, `error`, `canceled`), token counters (`prompt_tokens`, `completion_tokens`, `total_tokens`), and exact timestamps.

### Privacy-Preserving Telemetry Cascades
* **Deletes**: When a user deletes a conversation, we cascade delete their message contents (PII protection) while keeping the analytical telemetry (`inference_logs`) completely intact.
* **ORM Strategy**: We configured `inference_logs.message_id` with `ondelete="SET NULL"` and removed ORM-level cascades. When messages are wiped, the telemetry remains intact with its text relationship set to `NULL`, maintaining analytics dashboard accuracy.

---

## ⚖️ Tradeoffs Made

* **Decoupled Tables vs. Unified Schema**: Decoupling `messages` and `inference_logs` ensures that rendering chat histories remains blazingly fast (simple index queries) while keeping analytics/inference auditing perfectly scalable for separate high-frequency querying.
* **BackgroundTasks vs. Celery**: For a lightweight codebase, FastAPI's native `BackgroundTasks` operates flawlessly without the database/worker overhead of Celery or Redis, while retaining full reliability.

---

## 🔮 Future Improvements (With More Time)

1. **Redis Ingestion Buffer**: Implement a Redis queue between FastAPI and PostgreSQL to aggregate massive logging loads into batch inserts, shielding the database from write spikes during traffic bursts.
2. **Vector Embeddings**: Generate vector embeddings for sanitized message contents on ingestion to allow developers to perform semantic searches over telemetry histories.
