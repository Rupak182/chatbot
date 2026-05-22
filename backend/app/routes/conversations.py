import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Conversation

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

