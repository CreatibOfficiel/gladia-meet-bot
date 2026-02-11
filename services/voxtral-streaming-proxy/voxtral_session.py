import asyncio
import logging
import time

import httpx
from mistralai import Mistral
from mistralai.models import (
    AudioFormat,
    RealtimeTranscriptionError,
    RealtimeTranscriptionSessionCreated,
    TranscriptionStreamDone,
    TranscriptionStreamTextDelta,
)

from config import MISTRAL_API_KEY, VOXTRAL_MODEL, LANGUAGE, BOT_MANAGER_URL, TRANSCRIPT_SOURCE

logger = logging.getLogger(__name__)


class VoxtralSession:
    def __init__(self, session_id, meeting_id, websocket, callback_url):
        self.session_id = session_id
        self.meeting_id = meeting_id
        self.websocket = websocket
        self.callback_url = callback_url

        self.client = Mistral(api_key=MISTRAL_API_KEY)
        self.audio_format = AudioFormat(encoding="pcm_s16le", sample_rate=16000)

        # Audio queue for bridging WebSocket chunks to Mistral SDK
        self._audio_queue = asyncio.Queue()
        self._stop_event = asyncio.Event()

        # Transcript accumulator
        self.segments = []
        self.full_text = ""
        self._current_start = 0.0
        self._chunk_count = 0
        self._transcribe_task = None

    async def start(self):
        """Start the background transcription task."""
        self._transcribe_task = asyncio.create_task(self._run_transcription())

    async def _audio_stream(self):
        """Async iterator that yields audio chunks from the queue."""
        while not self._stop_event.is_set():
            try:
                chunk = await asyncio.wait_for(self._audio_queue.get(), timeout=1.0)
                yield chunk
            except asyncio.TimeoutError:
                if self._stop_event.is_set():
                    break
                continue

    async def _run_transcription(self):
        """Run the Mistral transcription stream in background."""
        try:
            async for event in self.client.audio.realtime.transcribe_stream(
                audio_stream=self._audio_stream(),
                model=VOXTRAL_MODEL,
                audio_format=self.audio_format,
            ):
                if isinstance(event, RealtimeTranscriptionSessionCreated):
                    logger.info(f"Voxtral session created for {self.session_id}")
                elif isinstance(event, TranscriptionStreamTextDelta):
                    await self._handle_text_delta(event)
                elif isinstance(event, TranscriptionStreamDone):
                    logger.info(f"Voxtral transcription done for {self.session_id}")
                elif isinstance(event, RealtimeTranscriptionError):
                    logger.error(f"Voxtral error for {self.session_id}: {event}")
        except Exception as e:
            if not self._stop_event.is_set():
                logger.error(f"Voxtral transcription error for {self.session_id}: {e}")

    async def _handle_text_delta(self, event):
        """Handle a text delta event from Voxtral."""
        text = event.text
        if not text:
            return

        # Estimate timing based on chunk count (16kHz, typical chunk ~480ms)
        elapsed = self._chunk_count * 0.48
        start = max(0, elapsed - 2.0)
        end = elapsed

        self.full_text += text
        self.segments.append({"start": start, "end": end, "text": text})

        try:
            await self.websocket.send_json({
                "type": "transcript",
                "data": {
                    "is_final": False,
                    "source": TRANSCRIPT_SOURCE,
                    "utterance": {
                        "text": text,
                        "start": start,
                        "end": end,
                        "language": LANGUAGE
                    }
                }
            })
        except Exception as e:
            logger.warning(f"Failed to send partial transcript: {e}")

    async def process_audio_chunk(self, audio_bytes: bytes):
        """Queue an audio chunk for processing."""
        self._chunk_count += 1
        await self._audio_queue.put(audio_bytes)

    async def finalize(self):
        """Finalize session and send callback to bot-manager."""
        logger.info(f"Finalizing Voxtral session {self.session_id}")

        # Signal the audio stream to stop
        self._stop_event.set()

        # Wait for transcription task to finish
        if self._transcribe_task:
            try:
                await asyncio.wait_for(self._transcribe_task, timeout=10.0)
            except asyncio.TimeoutError:
                logger.warning(f"Voxtral transcription task timed out for {self.session_id}")
                self._transcribe_task.cancel()

        # Send to bot-manager
        payload = {
            "meeting_id": int(self.meeting_id),
            "transcript_text": self.full_text.strip(),
            "segments": self.segments,
            "language": LANGUAGE,
            "duration": self.segments[-1]["end"] if self.segments else 0,
            "source": TRANSCRIPT_SOURCE,
        }

        logger.info(
            f"Sending Voxtral transcript callback for meeting {self.meeting_id}: "
            f"{len(self.segments)} segments, {len(self.full_text)} chars"
        )

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.callback_url, json=payload, timeout=30)
                logger.info(f"Callback response: {response.status_code}")
        except Exception as e:
            logger.error(f"Failed to send callback: {e}")
