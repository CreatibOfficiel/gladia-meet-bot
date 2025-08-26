import logging
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from shared_models.models import Meeting, User
from config import N8N_WEBHOOK_URL

logger = logging.getLogger(__name__)

async def run(meeting: Meeting, db: AsyncSession):
    """
    Sends a webhook to n8n with minimal meeting data when a bot exits.
    """
    logger.info(f"Executing send_n8n_webhook task for meeting {meeting.id}")

    # Check if n8n webhook URL is configured
    if not N8N_WEBHOOK_URL:
        logger.info(f"No N8N_WEBHOOK_URL configured, skipping n8n webhook for meeting {meeting.id}")
        return

    try:
        # Prepare the minimal webhook payload with only essential data
        payload = {
            'meeting_id': meeting.id,
            'platform': meeting.platform,
            'native_meeting_id': meeting.native_meeting_id,
            'user_id': meeting.user_id,
            'status': meeting.status,
            'gladia_session_id': getattr(meeting, 'gladia_session_id', None),
            'start_time': meeting.start_time.isoformat() if meeting.start_time else None,
            'end_time': meeting.end_time.isoformat() if meeting.end_time else None,
        }

        # Send the webhook to n8n
        async with httpx.AsyncClient() as client:
            logger.info(f"Sending n8n webhook to {N8N_WEBHOOK_URL} for meeting {meeting.id}")
            response = await client.post(
                N8N_WEBHOOK_URL,
                json=payload,
                timeout=30.0,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code >= 200 and response.status_code < 300:
                logger.info(f"Successfully sent n8n webhook for meeting {meeting.id}")
            else:
                logger.warning(f"N8N webhook for meeting {meeting.id} returned status {response.status_code}: {response.text}")

    except httpx.RequestError as e:
        logger.error(f"Failed to send n8n webhook for meeting {meeting.id}: {e}")
    except Exception as e:
        logger.error(f"Unexpected error sending n8n webhook for meeting {meeting.id}: {e}", exc_info=True) 