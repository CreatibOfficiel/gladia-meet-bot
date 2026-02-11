import asyncio
import json
import logging
import time
import uuid

import httpx
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from config import ASR_BACKENDS, BACKEND_URLS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Audio Router")


@app.get("/health")
async def health_check():
    return {"status": "ok", "backends": ASR_BACKENDS}


@app.post("/v2/live")
async def create_session():
    """Gladia-compatible session init. Returns the router's own WS URL."""
    session_id = str(uuid.uuid4())
    return JSONResponse(content={
        "id": session_id,
        "url": f"ws://audio-router:8084/v2/live?id={session_id}"
    })


async def _connect_backend(name: str, session_id: str, meeting_id: str):
    """Initialize a session on a backend and return an open WebSocket connection."""
    base_url = BACKEND_URLS.get(name)
    if not base_url:
        logger.error(f"Unknown backend: {name}")
        return None, name

    # Step 1: POST /v2/live to init session on the backend
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{base_url}/v2/live", timeout=10)
            resp.raise_for_status()
            data = resp.json()
            backend_ws_url = data.get("url")
            logger.info(f"Backend {name} session init: {data}")
    except Exception as e:
        logger.error(f"Failed to init session on {name}: {e}")
        return None, name

    # Step 2: Open WebSocket to backend, passing meeting_id
    try:
        ws_url = f"{backend_ws_url}&meeting_id={meeting_id}"
        ws = await websockets.connect(ws_url)
        # Wait for init message from backend
        init_msg = await asyncio.wait_for(ws.recv(), timeout=10)
        logger.info(f"Backend {name} init response: {init_msg}")
        return ws, name
    except Exception as e:
        logger.error(f"Failed to connect WS to {name}: {e}")
        return None, name


async def _forward_backend_messages(backend_ws, backend_name: str, bot_ws: WebSocket, is_primary: bool):
    """Forward transcript messages from a backend to the bot (only if primary)."""
    try:
        async for message in backend_ws:
            if is_primary:
                try:
                    data = json.loads(message)
                    await bot_ws.send_json(data)
                except Exception as e:
                    logger.warning(f"Failed to forward message from {backend_name}: {e}")
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Backend {backend_name} WS closed")
    except Exception as e:
        logger.warning(f"Backend {backend_name} forward error: {e}")


@app.websocket("/v2/live")
async def websocket_endpoint(
    websocket: WebSocket,
    id: str = None,
    meeting_id: str = "0"
):
    await websocket.accept()

    session_id = id or f"sess_{int(time.time() * 1000)}"
    logger.info(f"Audio router: new connection session={session_id}, meeting={meeting_id}, backends={ASR_BACKENDS}")

    # Connect to all active backends
    backend_connections = {}
    connect_tasks = [
        _connect_backend(name.strip(), session_id, meeting_id)
        for name in ASR_BACKENDS
    ]
    results = await asyncio.gather(*connect_tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, Exception):
            logger.error(f"Backend connection error: {result}")
            continue
        ws, name = result
        if ws:
            backend_connections[name] = ws

    if not backend_connections:
        logger.error("No backends available, closing connection")
        await websocket.close(code=1011, reason="No backends available")
        return

    logger.info(f"Connected to backends: {list(backend_connections.keys())}")

    # The primary backend is the first one in ASR_BACKENDS that connected
    primary_backend = None
    for name in ASR_BACKENDS:
        name = name.strip()
        if name in backend_connections:
            primary_backend = name
            break

    # Send init to the bot
    await websocket.send_json({"type": "init", "request_id": session_id})

    # Start forwarding tasks for each backend
    forward_tasks = []
    for name, ws in backend_connections.items():
        is_primary = (name == primary_backend)
        task = asyncio.create_task(
            _forward_backend_messages(ws, name, websocket, is_primary)
        )
        forward_tasks.append(task)

    try:
        while True:
            message = await websocket.receive()
            if "bytes" in message:
                # Fan-out audio to all backends
                for name, ws in backend_connections.items():
                    try:
                        await ws.send(message["bytes"])
                    except Exception as e:
                        logger.warning(f"Failed to send audio to {name}: {e}")
            elif "text" in message:
                data = json.loads(message["text"])
                if data.get("type") == "stop_recording":
                    logger.info(f"Received stop_recording, propagating to all backends")
                    # Propagate stop to all backends
                    for name, ws in backend_connections.items():
                        try:
                            await ws.send(message["text"])
                        except Exception as e:
                            logger.warning(f"Failed to send stop to {name}: {e}")
                    break
    except WebSocketDisconnect:
        logger.info(f"Bot disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"Error in audio router: {e}")
    finally:
        # Close all backend connections
        for name, ws in backend_connections.items():
            try:
                await ws.close()
            except Exception:
                pass
        # Cancel forward tasks
        for task in forward_tasks:
            task.cancel()
        logger.info(f"Audio router session {session_id} cleaned up")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
