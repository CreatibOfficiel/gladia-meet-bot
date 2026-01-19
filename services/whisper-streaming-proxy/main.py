import json
import logging
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from asr_session import ASRSession
from config import BOT_MANAGER_URL

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Whisper Streaming Proxy")
sessions = {}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.websocket("/v2/live")
async def websocket_endpoint(
    websocket: WebSocket,
    id: str = None,
    meeting_id: str = "0"
):
    await websocket.accept()

    session_id = id or f"sess_{int(time.time() * 1000)}"
    callback_url = BOT_MANAGER_URL

    logger.info(f"New WebSocket connection: session={session_id}, meeting={meeting_id}")

    session = ASRSession(session_id, meeting_id, websocket, callback_url)
    sessions[session_id] = session

    # Compatibility with existing bot
    await websocket.send_json({"type": "init", "request_id": session_id})

    try:
        while True:
            message = await websocket.receive()
            if "bytes" in message:
                await session.process_audio_chunk(message["bytes"])
            elif "text" in message:
                data = json.loads(message["text"])
                if data.get("type") == "stop_recording":
                    logger.info(f"Received stop_recording for session {session_id}")
                    break
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"Error in WebSocket handler: {e}")
    finally:
        await session.finalize()
        del sessions[session_id]
        logger.info(f"Session {session_id} cleaned up")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
