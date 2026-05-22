# Implementation Plan: LLM Inference Logging & Ingestion System

This document outlines the detailed architectural, schema, and implementation plan for building a lightweight, high-performance LLM inference logging and ingestion system. We will design this to handle standard requirements along with all **bonus capabilities** (multi-provider support, streaming, dashboards, Docker Compose, event-based architecture, PII redaction, k8s, and conversational features like cancel/resume).

---

## 1. Architectural Overview (Core System)

```mermaid
graph TD
    %% Frontend / Client side
    subgraph Client ["Client / Frontend (Next.js 14)"]
        ChatUI["Chat Interface (Multi-turn conversation)"]
        VercelSDK["Vercel AI SDK (useChat Streaming)"]
        NextAPI["Next.js Route Handlers (/api/chat)"]
    end

    %% SDK Wrapper
    subgraph SDK ["Logging SDK / Middleware"]
        TSWrapper["TS Logging SDK (Ingest Client)"]
    end

    %% Ingestion Pipeline
    subgraph Backend ["Backend Ingestion & Core API (FastAPI)"]
        IngestAPI["FastAPI Ingest API (/api/v1/ingest)"]
        CoreAPI["FastAPI Core CRUD (/api/v1/conversations)"]
    end

    %% Storage
    subgraph Storage ["Database Storage (SQLModel)"]
        DB[(PostgreSQL Database)]
        SQLM["SQLModel ORM (Unifies Tables & Schemas)"]
    end

    %% Flow Arrows
    ChatUI --> VercelSDK
    VercelSDK --> NextAPI
    NextAPI --> TSWrapper
    TSWrapper -- "HTTP POST (Async Log)" --> IngestAPI
    IngestAPI -- "SQLModel Async Insert" --> DB
    CoreAPI --> SQLM
    SQLM --> DB
    ChatUI -- "Fetch History" --> CoreAPI
```

### Components & Responsibilities
1. **Frontend (Next.js 14+ App Router)**:
   - **Chat Application**: Supports multi-turn chats, listing past conversations, resuming them, and canceling ongoing streams (using Vercel AI SDK and Tailwind v4).
   - **Styling & UI (Tailwind v4 + shadcn/ui)**: Beautiful, responsive dark-theme design featuring glassmorphism and modern UI components. We will use the new **Tailwind v4 CSS-first theme directive (`@theme`)** in `globals.css` combined with shadcn/ui components (such as buttons, cards, avatars, and scroll areas), completely eliminating the legacy `tailwind.config.js` file for a ultra-modern React developer experience.
2. **Logging SDK (TS & Python)**:
   - **TS Logger**: Lightweight interceptor for Vercel AI SDK callbacks (`onStart`, `onCompletion`, `onFinal`) that measures actual latencies, handles streaming chunks, compiles metadata, and asynchronously posts logs to the backend.
   - **Python SDK**: A clean, decorator-based wrapper (`@log_inference`) that wraps standard LLM client calls (OpenAI, Gemini), capturing provider, model, input/output tokens, latency, status, and sending it to the FastAPI endpoint.
3. **Ingestion Pipeline (FastAPI)**:
   - **Ingest API**: Fast, validation-first endpoint (`/api/v1/ingest`) that verifies token signatures, validates schemas using SQLModel, and pushes logs onto a Redis list (`inference_logs_queue`) in milliseconds, returning an immediate `202 Accepted`.
   - **Event-Driven Ingestion Worker**: A separate, concurrent worker process (or async python task manager) that reads from the Redis queue, runs the PII Redaction engine on the prompts and completions, and stores them in PostgreSQL.
4. **PII Redaction Engine**:
   - Parses text fields (prompts, responses) for common PII categories (Emails, Phone Numbers, Credit Cards, SSNs, API Keys, IPv4/v6) and redacts them with generic placeholders (e.g. `[REDACTED_EMAIL]`) prior to storage.
5. **Database (PostgreSQL)**:
   - Relational schema optimized for fast analytical query throughput and clean storage of multi-turn chat dialogues.

---

## 2. Database Schema Design & SQLModel Integration

We will use **PostgreSQL** for storing chat messages and inference logs, mapping them using **SQLModel**. SQLModel integrates Pydantic and SQLAlchemy into a single, beautifully typed model definition. This eliminates class duplication (e.g. separate schemas and database entities) while maintaining full type safety, async engine compatibility, and FastAPI auto-docs integration.

Below is the database schema design:


```sql
-- Conversations Table (Main Session entity)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
    model VARCHAR(100) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages Table (Stores raw multi-turn history for user/assistant)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,      -- Redacted text saved here
    tokens INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inference Logs Table (Highly detailed logging for analytics)
CREATE TABLE inference_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'success', 'error', 'canceled'
    latency_ms INTEGER NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    error_message TEXT,
    ip_address VARCHAR(45),
    request_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for Analytics & Search
CREATE INDEX idx_logs_timestamp ON inference_logs(request_timestamp DESC);
CREATE INDEX idx_logs_provider_model ON inference_logs(provider, model);
CREATE INDEX idx_logs_status ON inference_logs(status);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
```

### Design Tradeoffs Made:
* **Decoupling Messages and Logs**: We store chat messages separate from inference logs. While a message is what the user/bot sees, an inference log contains detailed metrics (latency, HTTP statuses, token breakdowns, and system details). This separation keeps the chat querying extremely fast while keeping the inference analytics scalable and queryable independently.
* **Denormalizing Provider & Model**: We duplicate `provider` and `model` on both the `conversations` and `inference_logs` tables. This allows the dashboard to query performance stats solely from the `inference_logs` table without performing heavy joins on `conversations` or `messages` tables.

---

## 3. High-Performance Scaling & Failure Handling

### Event-Driven Flow & Redis Buffer
To handle massive throughput spikes without dropping logs or degrading LLM response latencies:
1. The Next.js API/Client sends an async request to `/api/v1/ingest`.
2. The FastAPI ingestion endpoint acts as a lightweight gatekeeper. It does schema validation and pushes the raw payload directly into Redis via `LPUSH`. It completes the HTTP transaction immediately (`202 Accepted`).
3. An async backend worker continuously monitors the Redis queue (`RPOP` / `BRPOP`), redacts PII, and bulk-inserts logs into PostgreSQL in batches (e.g., every 100 logs or 1 second).

### Failure Handling & Resilience
* **Redis Down**: If Redis is offline, FastAPI automatically falls back to pushing tasks to an in-memory background task queue (`BackgroundTasks` in FastAPI) or a local SQLite backup file to prevent log losses, returning a successful response to the SDK while raising an internal alert.
* **PostgreSQL Down**: The Python ingestion worker retries inserts using exponential backoff. If PostgreSQL remains offline, the worker pushes the failed payloads back onto a "Dead Letter Queue" (DLQ) list in Redis, ensuring zero logs are lost.
* **LLM Stream Interruption (Cancellation)**: If the user cancels the chat stream, the TS/JS wrapper catches the Abort Signal, calculates the time elapsed, captures the partial completion tokens generated up to that moment, and fires an ingestion payload marked as status `canceled`.

---

## 4. Ingestion Payload Schema (JSON)

Every log sent to the ingestion endpoint adheres to this format:

```json
{
  "conversation_id": "c6204c3e-...",
  "provider": "gemini",
  "model": "gemini-1.5-flash",
  "status": "success",
  "latency_ms": 1280,
  "prompt_tokens": 150,
  "completion_tokens": 230,
  "prompt_preview": "Hello, can you help me write an ingestion system?",
  "completion_preview": "Yes! An ingestion system requires a fast endpoint...",
  "error_message": null,
  "request_timestamp": "2026-05-22T11:40:00Z"
}
```

---

## 5. Directory Structure & Layout

We will build the repository using a monorepo-style structure inside `/home/rupak/Downloads/ollive`:

```text
ollive/
├── docker-compose.yml       # Single-command setup for Next.js, FastAPI, PG, Redis
├── README.md                # Full setup, architecture, and schema guide
├── k8s/                     # Kubernetes manifests (Deployment, Service, ConfigMap)
│   ├── postgres-deployment.yaml
│   ├── redis-deployment.yaml
│   ├── backend-deployment.yaml
│   └── frontend-deployment.yaml
├── backend/                 # Python FastAPI App
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py              # FastAPI Entry point
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py        # Settings (DB, Redis, API Keys)
│   │   ├── db.py            # Database engine & async session setup
│   │   ├── models.py        # Unified SQLModel declarations (Tables + Schemas)
│   │   ├── routes.py        # CRUD & Ingestion endpoints
│   │   └── pii.py           # Regex-based PII Redaction engine
│   ├── worker/
│   │   ├── __init__.py
│   │   └── ingest_worker.py # High-performance async queue worker
│   └── sdk/                 # Python Client SDK/Wrapper
│       ├── __init__.py
│       └── logger.py        # @log_inference decorator
└── frontend/                # Next.js Web App
    ├── Dockerfile
    ├── package.json
    ├── next.config.js
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx     # Gorgeous Dashboard
    │   │   ├── chat/
    │   │   │   └── page.tsx # Modern interactive Chat interface
    │   │   └── globals.css  # Sleek dark glassmorphic styling
    │   ├── components/      # UI components
    │   │   ├── Sidebar.tsx
    │   │   ├── ChatWindow.tsx
    │   │   └── AnalyticsDashboard.tsx
    │   └── utils/
    │       └── sdk_logger.ts # Next.js lightweight TS logging SDK
```

## 6. Industry Best Practices & Timing Considerations

To deliver a submission that stands out to the engineering reviewers while working within a tight timeline, we will prioritize high-leverage best practices:

### A. Direct Gemini API Integration (Free Tier key)
* **The Configuration**: We will integrate directly with Google's Gemini API utilizing your free-tier Gemini API key.
* **Our Solution**: We will use `@ai-sdk/google` on the Next.js frontend route handlers. The key `GEMINI_API_KEY` is loaded from the environment variables, securely enabling standard Gemini model calls (such as `gemini-1.5-flash`).
* **Impact**: Provides highly stable, zero-cost production-grade LLM responses with accurate, live token metrics and provider latencies right from the start.

### B. Shared Docker Image for App & Worker (Developer Velocity)
* **Our Solution**: Instead of building separate Dockerfiles for the FastAPI web server and the background worker (which doubles build time and complicates code updates), we write a single `Dockerfile` for the backend.
  * The web container runs: `uvicorn main:app --host 0.0.0.0`
  * The worker container runs: `python worker/ingest_worker.py`
* **Impact**: Shuts down Docker build overhead, shares database and SQLModel logic naturally, and speeds up local testing.

### C. Graceful Degradation & In-Memory Fallback
* **Our Solution**: If Redis goes down during local dev or testing, the FastAPI app gracefully degrades to run PII redaction and PG logging inside FastAPI `BackgroundTasks` rather than crashing. 
* **Impact**: Highly resilient system behavior that demonstrates enterprise-grade coding practices.

---

## 7. Execution Timeline & Phased Approach

To respect timing constraints and ensure we deliver a rock-solid, working system, we will divide the build into two distinct phases:

### Phase 1: The Core System (Focus First)
1. **Step 1: Database & Core API (FastAPI + SQLModel + Postgres)**
   - Boot database container for Postgres.
   - Define SQLModel structures in `app/models.py`.
   - Write CRUD routes for creating/resuming conversations.
   - Implement the direct Ingestion endpoint (`/api/v1/ingest`) that immediately validates and stores logs in Postgres.
2. **Step 2: Frontend Chat & Vercel AI SDK (Next.js)**
   - Initialize Next.js app in `/frontend`.
   - Implement multi-turn chat page using the Vercel AI SDK.
   - Configure model provider selection (Gemini fallback mode).
3. **Step 3: Lightweight SDK / Logging Wrapper**
   - Write the TS middleware inside Next.js to log API streaming speed, input/output text previews, status, and tokens.
   - Verify that the chat flow writes beautifully to the Postgres database in real time.

### Phase 2: The Bonus Features (Layer Second)
1. **Step 4: Queue Architecture (Redis Broker + Worker)**
   - Shift `/api/v1/ingest` from direct DB storage to Redis `LPUSH`.
   - Build the async backend queue worker reading from Redis `BLPOP`.
2. **Step 5: PII Redaction**
   - Insert PII regex scrubs (Emails, SSNs, API Keys, etc.) into the worker pipeline.
3. **Step 6: Dashboard & Analytics**
   - Add real-time interactive dashboards on the frontend with metrics on throughput, median latencies, and error codes.
4. **Step 7: Docker Compose & K8s**
   - Package all services into a single unified `docker-compose.yml` and provide standard Kubernetes deployment configurations.

---

## 8. Why Next.js Route Handlers Instead of Server Actions

For a lightweight inference-logging chatbot, Next.js **Route Handlers** (REST endpoints like `app/api/chat/route.ts`) are highly superior to Server Actions:
1. **Full Vercel AI SDK Compatibility**: Vercel AI SDK's streaming hooks (like `useChat`) natively integrate with standard browser fetch streams returned by API Route Handlers.
2. **Simpler Latency Wrapping**: It is much cleaner to place our TypeScript logging SDK wrapper around standard Route Handlers because we can easily measure the time between the incoming request and the final stream chunk resolution.
3. **Better Testing / Isolation**: API routes can be independently tested with simple tools like curl or Postman, making the initial core debugged and functional within minutes.
