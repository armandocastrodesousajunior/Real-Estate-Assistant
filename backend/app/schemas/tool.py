from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ToolBase(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    prompt: Optional[str] = None
    type: str = "external"
    is_active: bool = True

class ToolCreate(ToolBase):
    pass

class ToolUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    prompt: Optional[str] = None
    is_active: Optional[bool] = None

class ToolResponse(ToolBase):
    id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AgentToolLink(BaseModel):
    agent_slug: str
    tool_slug: str
    action: str = Field(..., pattern="^(link|unlink)$")
