# Architecture Notes: Ingest, Scaling, & Failure Resiliency

This document outlines the telemetry ingestion pipeline, operational scaling, performance designs, and failure handling assumptions built into the Ollive Telemetry Platform.

---

## 1. Telemetry Ingestion Flow

The platform utilizes a **fully non-blocking background ingestion design** to guarantee that telemetry writes never impact client streaming speeds:

<img width="3275" height="1954" alt="image" src="https://github.com/user-attachments/assets/78ef6568-c555-438e-8116-f6e85dd4940e" />


1. **Pre-Save Sync**: The user submits a prompt. The FastAPI backend immediately saves the user's message to PostgreSQL to secure the foreign key ID and conversation state.
2. **Streaming Proxy**: The backend calls LiteLLM's async streaming connector (`await litellm.acompletion(stream=True)`). SSE text chunks are forwarded directly to the client browser in real-time.
3. **Connection Shutdown**: The moment the last text chunk is proxied, the generator calculates total latency, closes the network stream, and yields the final HTTP boundary.
4. **BackgroundTask Trigger**: FastAPI spawns an asynchronous `BackgroundTask` (`save_stream_results`) to run on the event loop in the background, freeing the client tab completely.

---

## 2. In-Memory Logging & Tokenization Strategy

* **In-Memory Accumulation (RAM Buffer)**: Instead of executing active database write transactions for every streamed chunk (which would overwhelm PostgreSQL under high concurrent user load), the backend buffers and accumulates the text in the server's high-speed RAM (`assistant_response_content += content`) as the chunks arrive. The system executes exactly **one single, atomic SQL write** only after the stream terminates.
* **Offline Local Tokenization**: Rather than wasting network latency and incurring costs making secondary remote API roundtrips to count tokens, the backend processes token counts locally in-memory using LiteLLM's offline tokenizer library (`litellm.token_counter`), leveraging high-speed `tiktoken` byte-pair encodings. This math takes `<1ms` and requires **zero network overhead**.
* **PII Redaction Pipeline**: All textual content passes through a high-performance compiled regular-expression processor (`redact_pii()`) at the ingestion layer. This automatically scrubs API keys, emails, phone numbers, and credentials before they touch the database.
* **Separation of Concerns**: Conversations, message texts (PII), and inference logs are stored in separate SQLModel tables. When a conversation is deleted, messages are purged (complying with user privacy mandates) while inference logs are retained by setting `message_id` to `NULL` (`ondelete="SET NULL"`), preserving historical telemetry analytics.

---

## 3. Scaling Considerations

To scale this platform to thousands of concurrent LLM stream ingestion logs per second, the pipeline can transition to an **Event-Buffered Architecture**:

```
[FastAPI Ingest] ──> [Redis LPUSH Queue] ──> [Distributed Worker Pool] ──> [PostgreSQL Batch Write]
```

1. **Redis Queue Buffer**: Instead of executing active SQL queries inside background tasks, the FastAPI server pushes serialized telemetry JSON payloads straight into an in-memory **Redis queue** (`LPUSH logs:telemetry`). This takes less than a millisecond.
2. **Decoupled Task Workers**: Independent python worker processes (e.g - running Celery) poll the queue and drain entries in bulk.
3. **Database Safeguards**: Workers group entries into batches (e.g. 500 records) and execute a single bulk SQL insert transaction. This slashes database lock times and connection overhead by **95%**, protecting PostgreSQL from thread starvation.

---

## 4. Failure Handling & Resiliency Assumptions

* **Upstream LLM Failures**: If an upstream provider returns an error (such as a rate limit, timeout, or bad credentials), the exception handler catches the issue, calculates the latency up to that point, and records a failed telemetry log in the database with `status="error"`, `completion_tokens=0`, and the raw `error_message`. The client receives a clean error notification in the UI.
* **Database Outage Resilience**: If PostgreSQL goes offline, the background logging task automatically rolls back the active transaction (`await session.rollback()`) to maintain session integrity. The system prints the exception details directly to stdout/stderr, allowing system-level log aggregators (e.g., Docker Logs, Vector, or Datadog) to capture, store, and raise operational alerts immediately.
* **User Stream Cancellation**: If the user cancels the generation, the socket connection is closed. The backend generator catches the disconnect, terminates the upstream LLM request immediately, and enters its `finally:` block. This triggers the background task to safely persist the partial response text accumulated up to that millisecond as a standard log, recording precise token counts for the partial generation and preventing any loss of operational logs.
