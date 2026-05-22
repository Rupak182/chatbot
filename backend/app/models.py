import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from sqlmodel import Field, Relationship, SQLModel

class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False
    )
    title: str = Field(default="New Conversation")
    model: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    # Cascade delete messages when conversation is deleted
    messages: List["Message"] = Relationship(
        back_populates="conversation",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "lazy": "selectin"  # Eagerly loads messages in a single query to prevent N+1 and async lazy-load crashes!
        }
    )

class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False
    )
    conversation_id: uuid.UUID = Field(
        foreign_key="conversations.id",
        nullable=False
    )
    role: str  # 'user', 'assistant', 'system'
    content: str
    tokens: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    # Relationships
    conversation: Conversation = Relationship(back_populates="messages")
    inference_logs: List["InferenceLog"] = Relationship(
        back_populates="message",
        sa_relationship_kwargs={
            "lazy": "selectin"  # Eagerly loads inference logs in a single query to prevent N+1 and async lazy-load crashes!
        }
    )

class InferenceLog(SQLModel, table=True):
    __tablename__ = "inference_logs"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False
    )
    conversation_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="conversations.id",
        ondelete="SET NULL"
    )
    message_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="messages.id",
        ondelete="SET NULL"
    )
    model: str
    status: str  # 'success', 'error'
    latency_ms: int
    prompt_tokens: Optional[int] = Field(default=None)
    completion_tokens: Optional[int] = Field(default=None)
    total_tokens: Optional[int] = Field(default=None)
    
    # Financial precision for USD micro-costs
    cost_usd: Decimal = Field(
        default=Decimal("0.0000000000"),
        max_digits=16,
        decimal_places=10
    )
    
    error_message: Optional[str] = Field(default=None)
    ip_address: Optional[str] = Field(default=None)
    request_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    # Relationships
    message: Optional[Message] = Relationship(back_populates="inference_logs")
