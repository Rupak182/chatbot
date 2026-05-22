import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Conversation, InferenceLog

router = APIRouter(prefix="/conversations", tags=["conversations"])

# Request payload schema for initializing a session
class ConversationCreate(BaseModel):
    model: str
    title: Optional[str] = "New Conversation"

# Message schema for historical loading
class MessageRead(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    tokens: Optional[int]
    created_at: datetime

# Combined schema showing details + list of messages
class ConversationReadWithMessages(BaseModel):
    id: uuid.UUID
    title: str
    model: str
    created_at: datetime
    updated_at: datetime
    messages: List[MessageRead]

    class Config:
        from_attributes = True

# 1. Create a new conversation session
@router.post("/", response_model=Conversation, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    session: AsyncSession = Depends(get_session)
):
    db_conv = Conversation(
        title=payload.title,
        model=payload.model
    )
    session.add(db_conv)
    await session.commit()
    await session.refresh(db_conv)
    return db_conv

# 2. Get list of all sessions (ordered by latest update)
@router.get("/", response_model=List[Conversation])
async def list_conversations(
    session: AsyncSession = Depends(get_session)
):
    statement = select(Conversation).order_by(Conversation.updated_at.desc())
    results = await session.execute(statement)
    return results.scalars().all()

# 2.5 Get global telemetry analytics metrics (throughput, latency, and errors)
@router.get("/analytics")
async def get_global_analytics(
    session: AsyncSession = Depends(get_session)
):
    try:
        stmt = select(
            func.count(InferenceLog.id),
            func.sum(InferenceLog.total_tokens),
            func.avg(InferenceLog.latency_ms),
            func.count(InferenceLog.id).filter(InferenceLog.status == "error")
        )
        result = await session.execute(stmt)
        row = result.fetchone()
        
        total_requests = row[0] or 0
        total_tokens = int(row[1]) if row[1] is not None else 0
        avg_latency = float(row[2]) if row[2] is not None else 0.0
        error_count = row[3] or 0
        
        success_rate = 100.0
        if total_requests > 0:
            success_rate = ((total_requests - error_count) / total_requests) * 100.0
            
        model_stmt = select(
            InferenceLog.model,
            func.count(InferenceLog.id),
            func.avg(InferenceLog.latency_ms)
        ).group_by(InferenceLog.model)
        model_result = await session.execute(model_stmt)
        model_stats = [
            {
                "model": r[0],
                "count": r[1],
                "avg_latency": float(r[2]) if r[2] is not None else 0.0
            }
            for r in model_result.fetchall()
        ]
        
        logs_stmt = select(InferenceLog).order_by(InferenceLog.created_at.desc()).limit(20)
        logs_result = await session.execute(logs_stmt)
        recent_logs = logs_result.scalars().all()
        
        return {
            "total_requests": total_requests,
            "total_tokens": total_tokens,
            "avg_latency_ms": round(avg_latency, 1),
            "error_count": error_count,
            "success_rate": round(success_rate, 1),
            "model_stats": model_stats,
            "recent_logs": [
                {
                    "id": str(log.id),
                    "conversation_id": str(log.conversation_id) if log.conversation_id else None,
                    "model": log.model,
                    "status": log.status,
                    "latency_ms": log.latency_ms,
                    "prompt_tokens": log.prompt_tokens or 0,
                    "completion_tokens": log.completion_tokens or 0,
                    "total_tokens": log.total_tokens or 0,
                    "error_message": log.error_message,
                    "created_at": log.created_at.isoformat() if log.created_at else None
                }
                for log in recent_logs
            ]
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch telemetry analytics: {str(e)}"
        )

# 3. Get single conversation detail along with messages list (uses selectin loading!)
@router.get("/{id}", response_model=ConversationReadWithMessages)
async def get_conversation(
    id: uuid.UUID,
    session: AsyncSession = Depends(get_session)
):
    statement = select(Conversation).where(Conversation.id == id)
    results = await session.execute(statement)
    db_conv = results.scalar_one_or_none()
    
    if not db_conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Chronologically sort messages by created_at to prevent out-of-order/flipped visual chat bubbles!
    if db_conv.messages:
        db_conv.messages.sort(key=lambda m: m.created_at)

    return db_conv


# 4. Delete a conversation session (cascades and deletes all messages & logs)
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    id: uuid.UUID,
    session: AsyncSession = Depends(get_session)
):
    statement = select(Conversation).where(Conversation.id == id)
    results = await session.execute(statement)
    db_conv = results.scalar_one_or_none()
    
    if not db_conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
        
    await session.delete(db_conv)
    await session.commit()
    return None


# 5. Get the latest telemetry log for a specific conversation session
@router.get("/{id}/telemetry", response_model=Optional[InferenceLog])
async def get_latest_telemetry(
    id: uuid.UUID,
    session: AsyncSession = Depends(get_session)
):
    statement = (
        select(InferenceLog)
        .where(InferenceLog.conversation_id == id)
        .order_by(InferenceLog.created_at.desc())
        .limit(1)
    )
    results = await session.execute(statement)
    return results.scalar_one_or_none()


