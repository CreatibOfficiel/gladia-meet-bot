import json
import logging
import time
import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from voxtral_session import VoxtralSession
from config import BOT_MANAGER_URL

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Voxtral Streaming Proxy")
sessions = {}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/v2/live")
async def create_session():
    """Gladia-compatible session init endpoint."""
    session_id = str(uuid.uuid4())
    return JSONResponse(content={
        "id": session_id,
        "url": f"ws://voxtral-streaming-proxy:8086/v2/live?id={session_id}"
    })


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

    session = VoxtralSession(session_id, meeting_id, websocket, callback_url)
    sessions[session_id] = session

    # Start background transcription
    await session.start()

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
    uvicorn.run(app, host="0.0.0.0", port=8086)
