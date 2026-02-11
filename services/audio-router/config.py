import os

# Comma-separated list of active backends
ASR_BACKENDS = os.getenv("ASR_BACKENDS", "whisper,voxtral").split(",")

# Backend URLs (HTTP for session init, WS for streaming)
WHISPER_BACKEND_URL = os.getenv(
    "WHISPER_BACKEND_URL",
    "http://whisper-streaming-proxy:8085"
)
VOXTRAL_BACKEND_URL = os.getenv(
    "VOXTRAL_BACKEND_URL",
    "http://voxtral-streaming-proxy:8086"
)

BACKEND_URLS = {
    "whisper": WHISPER_BACKEND_URL,
    "voxtral": VOXTRAL_BACKEND_URL,
}
