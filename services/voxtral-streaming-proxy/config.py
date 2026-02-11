import os

MISTRAL_API_KEY = os.getenv(
    "MISTRAL_API_KEY",
    ""
)
VOXTRAL_MODEL = os.getenv(
    "VOXTRAL_MODEL",
    "voxtral-mini-transcribe-realtime-2602"
)
LANGUAGE = os.getenv("VOXTRAL_LANGUAGE", "fr")
BOT_MANAGER_URL = os.getenv(
    "BOT_MANAGER_CALLBACK_URL",
    "http://bot-manager:8080/bots/internal/transcript"
)
TRANSCRIPT_SOURCE = os.getenv("TRANSCRIPT_SOURCE", "voxtral")
