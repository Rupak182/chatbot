# Architecture Notes: Ingest, Scaling, & Failure Resiliency

This document outlines the telemetry ingestion pipeline, operational scaling, performance designs, and failure handling assumptions built into the Ollive Telemetry Platform.

---

## 1. Telemetry Ingestion Flow

The platform utilizes a **fully non-blocking background ingestion design** to guarantee that telemetry writes never impact client streaming speeds:

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

1. **Pre-Save Sync**: The user submits a prompt. The FastAPI backend immediately saves the user's message to PostgreSQL to secure the foreign key ID and conversation state.
2. **Streaming Proxy**: The backend calls LiteLLM's async streaming connector (`await litellm.acompletion(stream=True)`). SSE text chunks are forwarded directly to the client browser in real-time.
3. **Connection Shutdown**: The moment the last text chunk is proxied, the generator calculates total latency, closes the network stream, and yields the final HTTP boundary.
4. **BackgroundTask Trigger**: FastAPI spawns an asynchronous `BackgroundTask` (`save_stream_results`) to run on the event loop in the background, freeing the client tab completely.

---

## 2. In-Memory Logging & Tokenization Strategy

* **Local Tokenization**: The background task calculates prompt and completion tokens locally using LiteLLM's local tokenizer (`litellm.token_counter`), which leverages offline libraries like `tiktoken`. This avoids secondary network calls to remote tokenizers.
* **PII Redaction Pipeline**: All textual content passes through a high-performance compiled regular-expression processor (`redact_pii()`) at the ingestion layer. This automatically scrubs API keys, emails, phone numbers, and credentials before they touch the database.
* **Separation of Concerns**: Conversations, message texts (PII), and inference logs are stored in separate SQLModel tables. When a conversation is deleted, messages are purged (complying with user privacy mandates) while inference logs are retained by setting `message_id` to `NULL` (`ondelete="SET NULL"`), preserving historical telemetry analytics.

---

## 3. Scaling Considerations (Handling 10k+ Req/Sec)

To scale this platform to thousands of concurrent LLM stream ingestion logs per second, the pipeline can transition to an **Event-Buffered Architecture**:

```
[FastAPI Ingest] ──> [Redis LPUSH Queue] ──> [Distributed Worker Pool] ──> [PostgreSQL Batch Write]
```

1. **Redis Queue Buffer**: Instead of executing active SQL queries inside background tasks, the FastAPI server pushes serialized telemetry JSON payloads straight into an in-memory **Redis queue** (`LPUSH logs:telemetry`). This takes less than a millisecond.
2. **Decoupled Task Workers**: Independent python worker processes (running Celery or Arq) poll the queue and drain entries in bulk.
3. **Database Safeguards**: Workers group entries into batches (e.g. 500 records) and execute a single bulk SQL insert transaction. This slashes database lock times and connection overhead by **95%**, protecting PostgreSQL from thread starvation.

---

## 4. Failure Handling & Resiliency Assumptions

* **Upstream LLM Failures**: If an upstream provider returns an error (such as a rate limit, timeout, or bad credentials), the exception handler catches the issue, calculates the latency up to that point, and records a failed telemetry log in the database with `status="error"`, `completion_tokens=0`, and the raw `error_message`. The client receives a clean error notification in the UI.
* **Database Outage Resilience**: If PostgreSQL goes offline, the background logging task automatically rolls back the active transaction (`await session.rollback()`) to maintain session integrity. The system prints the exception details directly to stdout/stderr, allowing system-level log aggregators (e.g., Docker Logs, Vector, or Datadog) to capture, store, and raise operational alerts immediately.
* **User Stream Cancellation**: If the user cancels the generation, the socket connection is closed. The backend generator catches the disconnect, terminates the upstream LLM request immediately, and enters its `finally:` block. This triggers the background task to safely persist the partial response text accumulated up to that millisecond as a standard log, recording precise token counts for the partial generation and preventing any loss of operational logs.
