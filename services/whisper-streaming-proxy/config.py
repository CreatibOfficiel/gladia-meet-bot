import os

WHISPER_MODEL = os.getenv(
    "WHISPER_MODEL_SIZE",
    "brandenkmurray/faster-whisper-large-v3-french-distil-dec16"
)
LANGUAGE = os.getenv("WHISPER_LANGUAGE", "fr")
BOT_MANAGER_URL = os.getenv(
    "BOT_MANAGER_CALLBACK_URL",
    "http://bot-manager:8080/bots/internal/transcript"
)
TRANSCRIPT_SOURCE = os.getenv("TRANSCRIPT_SOURCE", "whisper")
