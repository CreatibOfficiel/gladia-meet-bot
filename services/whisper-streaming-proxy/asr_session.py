import numpy as np
import httpx
import asyncio
import logging
from whisper_streaming.whisper_online import FasterWhisperASR, OnlineASRProcessor
from config import WHISPER_MODEL, LANGUAGE, TRANSCRIPT_SOURCE

logger = logging.getLogger(__name__)


class ASRSession:
    def __init__(self, session_id, meeting_id, websocket, callback_url):
        self.session_id = session_id
        self.meeting_id = meeting_id
        self.websocket = websocket
        self.callback_url = callback_url

        # Initialize whisper_streaming
        logger.info(f"Initializing ASR session {session_id} with model {WHISPER_MODEL}")
        self.asr = FasterWhisperASR(lan=LANGUAGE, modelsize=WHISPER_MODEL)
        self.online = OnlineASRProcessor(self.asr)

        # Transcript accumulator
        self.segments = []
        self.full_text = ""

    async def process_audio_chunk(self, audio_bytes: bytes):
        """Process a PCM 16-bit audio chunk."""
        # Convert PCM int16 to float32
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0

        # Process with whisper_streaming
        self.online.insert_audio_chunk(audio_np)

        # Run in thread (blocking CPU inference)
        result = await asyncio.to_thread(self.online.process_iter)

        if result[2]:  # If there's confirmed text
            await self._send_partial_transcript(result)
            self._accumulate_segment(result)

    async def _send_partial_transcript(self, result):
        """Send partial transcript to bot via WebSocket."""
        beg, end, text = result
        try:
            await self.websocket.send_json({
                "type": "transcript",
                "data": {
                    "is_final": False,
                    "utterance": {
                        "text": text,
                        "start": beg,
                        "end": end,
                        "language": LANGUAGE
                    }
                }
            })
        except Exception as e:
            logger.warning(f"Failed to send partial transcript: {e}")

    def _accumulate_segment(self, result):
        """Accumulate segments for final transcript."""
        beg, end, text = result
        self.segments.append({"start": beg, "end": end, "text": text})
        self.full_text += text + " "

    async def finalize(self):
        """Finalize and send callback to bot-manager."""
        logger.info(f"Finalizing ASR session {self.session_id}")

        # Get final results
        try:
            final = await asyncio.to_thread(self.online.finish)
            if final[2]:
                self._accumulate_segment(final)
        except Exception as e:
            logger.warning(f"Error getting final transcript: {e}")

        # Send to bot-manager
        payload = {
            "meeting_id": int(self.meeting_id),
            "transcript_text": self.full_text.strip(),
            "segments": self.segments,
            "language": LANGUAGE,
            "duration": self.segments[-1]["end"] if self.segments else 0,
            "source": TRANSCRIPT_SOURCE,
        }

        logger.info(f"Sending transcript callback for meeting {self.meeting_id}: {len(self.segments)} segments, {len(self.full_text)} chars")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.callback_url, json=payload, timeout=30)
                logger.info(f"Callback response: {response.status_code}")
        except Exception as e:
            logger.error(f"Failed to send callback: {e}")
