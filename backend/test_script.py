import asyncio
from sqlalchemy import select
from app.core.database import SessionLocal
from app.models.conversation import Conversation, Message
from app.schemas.chat import ConversationDetailResponse, MessageResponse

async def test():
    async with SessionLocal() as db:
        result = await db.execute(select(Conversation))
        conv = result.scalars().first()
        if not conv:
            print("No conv found")
            return
        
        print(f"Loaded conv {conv.id}")
        msg_result = await db.execute(select(Message).where(Message.conversation_id == conv.id))
        messages = msg_result.scalars().all()
        
        try:
            conv_data = ConversationDetailResponse(
                id=conv.id,
                session_id=conv.session_id,
                title=conv.title,
                last_agent_slug=conv.last_agent_slug,
                message_count=conv.message_count,
                total_tokens=conv.total_tokens,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                messages=[MessageResponse.model_validate(m) for m in messages],
            )
            print("SUCCESS")
            print(conv_data.model_dump_json(indent=2))
        except Exception as e:
            print("ERROR", str(e))
            from traceback import print_exc
            print_exc()

if __name__ == "__main__":
    asyncio.run(test())
