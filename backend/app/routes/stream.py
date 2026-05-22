import time
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from decimal import Decimal
import os
import logging

# Suppress noisy LiteLLM startup/dependency warnings (e.g. Bedrock/SageMaker missing botocore)
logging.getLogger("LiteLLM").setLevel(logging.ERROR)

import litellm
from app.config import settings

# Bind developer key to environment variables for LiteLLM routing
if settings.GEMINI_API_KEY:
    os.environ["GEMINI_API_KEY"] = settings.GEMINI_API_KEY

from app.db import get_session, async_session
from app.models import Conversation, Message, InferenceLog
from app.utils.pii import redact_pii

router = APIRouter(prefix="/chat", tags=["chat"])

# Message item representation inside payload history
class ChatMessageInput(BaseModel):
    role: str  # 'user', 'assistant', 'system'
    content: str

# Payload required for streaming endpoint
class ChatStreamRequest(BaseModel):
    conversation_id: uuid.UUID
    messages: List[ChatMessageInput]
    model: Optional[str] = "gemini-2.5-flash"


async def save_stream_results(
    conversation_id: uuid.UUID,
    user_message_id: uuid.UUID,
    prompt_text: str,
    assistant_text: str,
    model_name: str,
    latency_ms: int
):
    """
    Background Task: Operates outside of the streaming request.
    Tokenizes text, calculates actual model usage cost, saves Assistant message,
    and commits precise telemetry logs into PostgreSQL.
    """
    async with async_session() as session:
        try:
            # 1. Calculate precise tokens using LiteLLM tokenizer first
            try:
                prompt_tokens = litellm.token_counter(model=model_name, text=prompt_text)
            except Exception:
                prompt_tokens = len(prompt_text.split())  # Fallback

            try:
                completion_tokens = litellm.token_counter(model=model_name, text=assistant_text)
            except Exception:
                completion_tokens = len(assistant_text.split())  # Fallback

            total_tokens = prompt_tokens + completion_tokens

            # 2. Save the Assistant's message to the database (including token count!)
            assistant_message = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=redact_pii(assistant_text),
                tokens=completion_tokens
            )
            session.add(assistant_message)
            await session.flush()  # Populate UUID in memory without committing yet, keeping the transaction atomic!

            # 3. Update the pre-saved User's message to include its calculated token count!
            user_msg_stmt = select(Message).where(Message.id == user_message_id)
            user_msg_results = await session.execute(user_msg_stmt)
            db_user_message = user_msg_results.scalar_one_or_none()
            if db_user_message:
                db_user_message.tokens = prompt_tokens
                session.add(db_user_message)

            # 4. Set default zero cost (cost tracking disabled)
            cost_usd = Decimal("0.0000000000")

            # 4. Save InferenceLog Telemetry
            log = InferenceLog(
                conversation_id=conversation_id,
                message_id=assistant_message.id,
                model=model_name,
                status="success",
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost_usd=cost_usd
            )
            session.add(log)

            # 5. Refresh Conversation update timestamp
            statement = select(Conversation).where(Conversation.id == conversation_id)
            results = await session.execute(statement)
            db_conv = results.scalar_one_or_none()
            if db_conv:
                from datetime import datetime, timezone
                db_conv.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                session.add(db_conv)

            await session.commit()
            print(f"Telemetry logged: Latency={latency_ms}ms, Tokens={total_tokens}, Cost=${cost_usd:.10f}")
        except Exception as e:
            await session.rollback()
            print(f"Error in background telemetry logger: {e}")


@router.post("/stream")
async def chat_stream(
    payload: ChatStreamRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session)
):
    model_name = payload.model

    # 2. Fetch or auto-initialize the Conversation to prevent foreign key violation crashes!
    statement = select(Conversation).where(Conversation.id == payload.conversation_id)
    results = await session.execute(statement)
    db_conv = results.scalar_one_or_none()

    from datetime import datetime, timezone
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    # 3. Extract the User's prompt to name the conversation dynamically
    user_prompt = payload.messages[-1].content
    redacted_title_base = redact_pii(user_prompt)
    conv_title = redacted_title_base[:15] + "..." if len(redacted_title_base) > 15 else redacted_title_base

    if not db_conv:
        # Auto-create conversation with the client's generated UUID and dynamic title
        db_conv = Conversation(
            id=payload.conversation_id,
            title=conv_title,
            model=payload.model or "gemini-2.5-flash",
            created_at=now_naive,
            updated_at=now_naive
        )
        session.add(db_conv)
    else:
        # If the conversation is currently named "New Conversation", rename it to the user's first prompt slice!
        if db_conv.title == "New Conversation":
            db_conv.title = conv_title
        db_conv.updated_at = now_naive
        session.add(db_conv)

    user_message = Message(
        conversation_id=payload.conversation_id,
        role="user",
        content=redact_pii(user_prompt)
    )
    session.add(user_message)
    
    # Commit both conversation and user message together in a single atomic block!
    await session.commit()
    await session.refresh(user_message)

    # 3. Connect to LiteLLM's streaming completion asynchronously
    start_time = time.time()
    litellm_messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    try:
        response = await litellm.acompletion(
            model=model_name,
            messages=litellm_messages,
            stream=True
        )
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Log failure telemetry asynchronously in Neon
        async with async_session() as err_session:
            try:
                prompt_tokens = len(user_prompt.split())
                
                log = InferenceLog(
                    conversation_id=payload.conversation_id,
                    message_id=user_message.id,
                    model=model_name,
                    status="error",
                    latency_ms=latency_ms,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=0,
                    total_tokens=prompt_tokens,
                    cost_usd=Decimal("0.0000000000"),
                    error_message=str(e)
                )
                err_session.add(log)
                await err_session.commit()
                print(f"Telemetry logged (failed call): {str(e)}")
            except Exception as log_err:
                print(f"Error logging failed telemetry: {log_err}")
                
        raise HTTPException(
            status_code=500,
            detail=f"LLM Provider Error: {str(e)}"
        )

    # 4. Stream generator yielding chunks to client
    async def event_generator():
        assistant_response_content = ""
        try:
            async for chunk in response:
                content = chunk.choices[0].delta.content
                if content:
                    assistant_response_content += content
                    yield content
        finally:
            # Calculate streaming latency
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Spin off background task to count tokens, calculate cost, save bot message & logs
            background_tasks.add_task(
                save_stream_results,
                conversation_id=payload.conversation_id,
                user_message_id=user_message.id,
                prompt_text=user_prompt,
                assistant_text=assistant_response_content,
                model_name=model_name,
                latency_ms=latency_ms
            )

    return StreamingResponse(event_generator(), media_type="text/plain")
