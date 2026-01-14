import os
import logging
import time
import requests
import json
from redis import Redis
from rq import Worker, Queue, Connection
from faster_whisper import WhisperModel

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis Connection
REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
redis_conn = Redis(host=REDIS_HOST, port=REDIS_PORT)

# Model configuration
MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "medium")
DEVICE = "cpu"
COMPUTE_TYPE = "int8"

# Global model instance
model = None

def load_model():
    global model
    logger.info(f"Worker: Loading Whisper model: {MODEL_SIZE}...")
    model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    logger.info("Worker: Model loaded.")

def process_audio(file_path: str, meeting_id: str, callback_url: str):
    """
    Main job function called by RQ worker.
    """
    global model
    if model is None:
        load_model()
    
    logger.info(f"Starting transcription for Meeting {meeting_id}. File: {file_path}")
    
    try:
        # VAD filter to avoid hallucinations on silence/low audio
        segments, info = model.transcribe(
            file_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=1000,  # Ignore silences > 1s
                speech_pad_ms=400,             # Padding around speech
                threshold=0.5                  # VAD sensitivity
            )
        )
        
        full_text = ""
        transcript_result = []

        for segment in segments:
            seg_data = {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip()
            }
            transcript_result.append(seg_data)
            full_text += segment.text + " "
        
        full_text = full_text.strip()
        
        # Prepare payload
        payload = {
            "meeting_id": meeting_id,
            "transcript_text": full_text,
            "segments": transcript_result,
            "language": info.language,
            "duration": info.duration
        }

        # Callback to Bot Manager
        logger.info(f"Transcription complete. Sending callback to {callback_url}...")
        response = requests.post(callback_url, json=payload, timeout=10)
        
        if response.status_code == 200:
            logger.info("Callback successfully delivered.")
        else:
            logger.error(f"Callback failed with status {response.status_code}: {response.text}")
            
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        # Ideally, send a failure callback here
    finally:
        # Cleanup
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Deleted temp file: {file_path}")

if __name__ == '__main__':
    # Preload model in parent process (optional, or rely on global lazy load)
    # load_model()
    
    with Connection(redis_conn):
        worker = Worker(['default'])
        worker.work()
