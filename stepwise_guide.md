# Step-by-Step Implementation Walkthrough

This guide provides a hyper-granular, testable walkthrough for building the LLM Inference Logging chatbot. We prioritize **Phase 1 (The Core System)** to deliver a rock-solid, fully functioning system first, before moving to Phase 2 (Bonuses).

Each step contains a dedicated **"How to Test"** section to guarantee 100% correctness at every stage.

---

## Phase 1: Core System Implementation (No Bonuses)

### Step 1: Backend Foundation & DB Connection

#### Step 1.1: Create Backend Directory & requirements.txt
Initialize the python environment with the modern async and multi-provider dependencies.
* **Target File**: `backend/requirements.txt`
* **File Content**:
  ```text
  fastapi==0.110.0
  uvicorn==0.28.0
  sqlmodel==0.0.16
  asyncpg==0.29.0
  litellm==1.34.0
  python-dotenv==1.0.1
  httpx==0.27.0
  ```
* **How to Test**:
  Ensure you have `uv` installed (`pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`).
  Run in terminal:
  ```bash
  # 1. Create a fast virtual environment using uv
  uv venv backend/.venv
  
  # 2. Activate the virtual environment
  source backend/.venv/bin/activate
  
  # 3. Fast install requirements using uv
  uv pip install -r backend/requirements.txt
  ```
  Ensure all packages install successfully without version conflicts in milliseconds!

#### Step 1.2: Environment Configurations
Manage database URLs and LLM secrets securely.
* **Target File**: `backend/.env`
* **File Content**:
  ```env
  DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ollive
  GEMINI_API_KEY=your_gemini_api_key_here
  PORT=8000
  ```
* **Target File**: `backend/app/config.py`
  Write standard config class using standard Python `os.getenv` or Pydantic Settings.
* **How to Test**:
  Create a temporary Python file `test_env.py`:
  ```python
  from dotenv import load_dotenv
  import os
  load_dotenv()
  print("Database URL:", os.getenv("DATABASE_URL"))
  print("Gemini Key Exists:", os.getenv("GEMINI_API_KEY") is not None)
  ```
  Run `python test_env.py` and verify configurations load perfectly.

#### Step 1.3: Database Engine & Sessions
* **Target File**: `backend/app/db.py`
  Define your asynchronous engine using `create_async_engine` from SQLAlchemy/SQLModel and setup an async session yield generator.
* **How to Test**:
  Verify the file compiles without syntax or import errors.

#### Step 1.4: Define SQLModel Models
* **Target File**: `backend/app/models.py`
  Define three classes inheriting from `SQLModel`:
  1. `Conversation` (fields: `id`, `title`, `model`, `provider`, `created_at`, `updated_at`)
  2. `Message` (fields: `id`, `conversation_id`, `role`, `content`, `tokens`, `created_at`)
  3. `InferenceLog` (fields: `id`, `conversation_id`, `message_id`, `provider`, `model`, `status`, `latency_ms`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `cost_usd`, `error_message`, `ip_address`, `request_timestamp`, `created_at`)
* **How to Test**:
  Ensure the classes load and inherit from `SQLModel` perfectly:
  ```bash
  python -c "from app.models import Conversation, Message, InferenceLog; print('Models loaded successfully!')"
  ```

#### Step 1.5: Database Bootstrapping and Connection Verification
* **Target File**: `backend/test_db.py`
  A lightweight script that connects to your local PostgreSQL database, runs `SQLModel.metadata.create_all` (using the async engine), inserts a mock conversation row, and queries it back.
* **How to Test**:
  Run:
  ```bash
  python backend/test_db.py
  ```
  Ensure all three tables are created in PostgreSQL and the mock row is written and queried successfully.

---

### Step 2: Core FastAPI Routers & Ingestion Stream

#### Step 2.1: Conversation CRUD Endpoints
* **Target File**: `backend/app/routes/conversations.py`
  Implement standard REST routes using `APIRouter`:
  * `POST /api/v1/conversations`: Creates a new session with default title.
  * `GET /api/v1/conversations`: Lists all sessions, ordered by `updated_at DESC`.
  * `GET /api/v1/conversations/{id}`: Fetches a single session along with its historical messages array.
* **How to Test**:
  Compile the router and check that all imports compile cleanly.

#### Step 2.2: Stream Proxy Endpoint (`/api/v1/chat/stream`)
* **Target File**: `backend/app/routes/stream.py`
  Implement the streaming proxy:
  1. Capture request start time.
  2. Insert the user prompt into the `messages` table immediately.
  3. **Format Model Name**: Ensure the model is properly prefixed for `liteLLM` (e.g. if the model is `gemini-1.5-flash`, prepend it to `gemini/gemini-1.5-flash` so that `liteLLM` routes using your `GEMINI_API_KEY` rather than expecting Google Cloud Vertex AI IAM credentials).
  4. Call `litellm.acompletion(model=formatted_model, messages=payload.messages, stream=True)`.
  5. Yield text chunks to the client.
  6. On stream end, trigger a `BackgroundTasks` function to:
     * Save the bot's assistant message to the database.
     * Calculate tokens via `litellm.token_counter`.
     * Calculate exact cost via `litellm.completion_cost`.
     * Save the raw `InferenceLog` with full foreign-key bindings.
* **How to Test**:
  Compile and check for clean async generator syntax.

#### Step 2.3: Assemble FastAPI App (`main.py`)
* **Target File**: `backend/main.py`
  Create the FastAPI instance, add CORS middleware (allowing frontend communication), and include the conversation and stream routers.
* **How to Test**:
  Boot the server locally:
  ```bash
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
  ```
  Navigate to `http://localhost:8000/docs` in your browser or curl it to verify the swagger documentation is live!

#### Step 2.4: Test CRUD Endpoints via Curl
* **How to Test**:
  1. **Create Conversation**:
     ```bash
     curl -X POST http://localhost:8000/api/v1/conversations -H "Content-Type: application/json" -d '{"model":"gemini-1.5-flash","provider":"google"}'
     ```
     Ensure you get a JSON response containing a generated `id` UUID.
  2. **List Conversations**:
     ```bash
     curl http://localhost:8000/api/v1/conversations
     ```
     Ensure it returns a JSON list containing the conversation you just created.

#### Step 2.5: Test Stream Logging End-to-End
* **How to Test**:
  Trigger the stream endpoint directly using curl:
  ```bash
  curl -X POST http://localhost:8000/api/v1/chat/stream \
    -H "Content-Type: application/json" \
    -d '{"conversation_id":"<insert-your-uuid-here>","prompt":"Explain DMA in one sentence.","model":"gemini-1.5-flash"}'
  ```
  * Verify that raw plain-text chunks stream back instantly to your terminal.
  * Once finished, query the database or hit `GET /api/v1/conversations/<uuid>` to verify the bot message was successfully saved.
  * Verify that a new row in the `inference_logs` table has been written with correct `latency_ms`, `total_tokens`, and calculated `cost_usd`!

---

### Step 3: Frontend Scaffolding & Tailwind CSS v4

#### Step 3.1: Initialize Next.js 16 Project
* **Execution Command**:
  Run inside project root `/home/rupak/Downloads/ollive`:
  ```bash
  npx -y create-next-app@latest frontend --ts --eslint --app --src-dir --no-tailwind --no-src-dir
  ```
  *(Note: We configure tailwind manually to ensure Tailwind v4 and shadcn/ui are set up perfectly).*
* **How to Test**:
  Ensure the `frontend/` directory is successfully scaffolded.

#### Step 3.2: Configure Tailwind CSS v4 & PostCSS
* **Target File**: `frontend/postcss.config.mjs`
  Add the modern Tailwind v4 PostCSS compilation plugin:
  ```javascript
  export default {
    plugins: {
      '@tailwindcss/postcss': {},
    },
  }
  ```
* **Target File**: `frontend/src/app/globals.css`
  Delete standard content and import Tailwind v4 with CSS-first configurations:
  ```css
  @import "tailwindcss";
  
  @theme {
    --color-background: oklch(0.15 0.02 240);
    --color-foreground: oklch(0.98 0.01 240);
    /* Custom tokens for gorgeous glassmorphic look */
  }
  ```
* **How to Test**:
  Run the dev server:
  ```bash
  npm run dev --prefix frontend
  ```
  Open `http://localhost:3000` and verify the basic page compiles and renders successfully without PostCSS errors.

#### Step 3.3: Set up shadcn/ui & Shadcn Chatbot Kit
Install shadcn primitives along with the premium, pre-built Chatbot UI kit.
* **Execution Commands**:
  Run inside `frontend/` directory:
  ```bash
  # 1. Initialize shadcn/ui
  npx shadcn@latest init --yes
  
  # 2. Add the premium, open-source Shadcn Chatbot Kit
  npx shadcn@latest add https://shadcn-chatbot-kit.vercel.app/r/chat.json
  ```
* **How to Test**:
  Verify that the `frontend/src/components/ui/chat/` directory is successfully created and populated with premium components like `chat-input.tsx`, `chat-message.tsx`, `chat-message-list.tsx`, and `expandable-chat.tsx`.

---

### Step 4: Multi-Turn Chat UI & Stream Integration

#### Step 4.1: Sidebar Conversation List
* **Target File**: `frontend/src/components/Sidebar.tsx`
  Write a component that fetches `GET http://localhost:8000/api/v1/conversations` on mount and lists historical chat titles in a beautiful scroll list.
* **How to Test**:
  Render the sidebar on your page and check that your previously created curl sessions are listed.

#### Step 4.2: Chat Window with Vercel AI SDK & Chatbot Kit Components
* **Target File**: `frontend/src/components/ChatWindow.tsx`
  Assemble the chat interface using Vercel AI SDK client hooks and the newly installed Chatbot Kit UI components:
  ```typescript
  import { useChat } from 'ai/react';
  import { ChatMessageList } from '@/components/ui/chat/chat-message-list';
  import { ChatMessage } from '@/components/ui/chat/chat-message';
  import { ChatInput } from '@/components/ui/chat/chat-input';
  
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: 'http://localhost:8000/api/v1/chat/stream',
    streamProtocol: 'text',
    body: {
      conversation_id: activeId,
      model: 'gemini-1.5-flash'
    }
  });
  ```
* **How to Test**:
  Verify the typescript compiler raises no type errors in the component.

#### Step 4.3: ChatGPT-Style Instant URL Transition
* **Target File**: `frontend/src/app/chat/[id]/page.tsx` & `frontend/src/app/page.tsx`
  Implement the session router:
  1. On a blank chat page (`/`), when the user enters their first message, Next.js calls `POST /api/v1/conversations`.
  2. The backend returns a new conversation ID (e.g. `abc-123`).
  3. The frontend immediately updates the URL to `/chat/abc-123` via `router.push()`, updates the sidebar list, and starts the message stream.
* **How to Test**:
  Interact with the app in your browser:
  * Type a message on the blank home screen.
  * Verify that the URL instantly transitions to the chat ID, the sidebar populates the new session, and streaming begins without interruption.
  * Verify that multi-turn history works by clicking between sessions in the sidebar!

---

### Step 5: Docker Compose Package

#### Step 5.1: Create Dockerfiles
* **Target File**: `backend/Dockerfile`
* **Target File**: `frontend/Dockerfile`
  Set up multi-stage lightweight builds.
* **How to Test**:
  Verify both files exist and are syntactically valid.

#### Step 5.2: Unified docker-compose.yml
* **Target File**: `docker-compose.yml`
* **File Content**:
  Configure a single `docker-compose.yml` that binds `postgres`, `backend` (FastAPI), and `frontend` (Next.js 16) with all environment keys shared naturally.
* **How to Test**:
  Run:
  ```bash
  docker compose up --build
  ```
  Ensure all three containers boot up cleanly, link automatically, and that the chatbot is fully functional at `http://localhost:3000` with zero local configuration!

---

## Phase 2: Bonus Features Implementation (Layer Second)

*Only proceed here after verifying 100% correctness of all Phase 1 steps above!*

### Step 6: Queue Architecture (Redis Broker + Worker)
1. **Docker updates**: Add `redis` service to `docker-compose.yml`.
2. **FastAPI update**: Shift `/api/v1/chat/stream` from writing to Postgres directly to calling `redis.lpush("inference_logs_queue", log_payload)`.
3. **Ingestion Worker**: Write `backend/worker/ingest_worker.py` utilizing the TCP-level `BRPOP` event loop.
4. **How to Test**: Boot system, chat, and check the worker log output showing logs being pulled from Redis.

### Step 7: PII Redaction Engine
1. **PII Module**: Write `backend/app/pii.py` with standard Regex filters (Emails, Phone Numbers, Credit Cards, API Keys).
2. **Worker integration**: Add PII scrubbing inside `ingest_worker.py` before inserting rows into PostgreSQL.
3. **How to Test**: Chat a message containing an email (e.g. `test@example.com`). Check the Postgres DB to verify that the message content is saved as `[REDACTED_EMAIL]`.

### Step 8: Dashboard & Real-Time Analytics
1. **Analytics UI**: Add an interactive dashboard tab showing latency charts, total tokens processed, and real-time cost accumulations (`cost_usd`).
2. **How to Test**: Access `/dashboard` and verify the metrics charts populate and aggregate accurately from `GET /api/v1/conversations/analytics`!
