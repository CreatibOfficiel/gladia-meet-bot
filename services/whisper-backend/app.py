import os
import logging
import uuid
from flask import Flask, request, jsonify
from redis import Redis
from rq import Queue
from worker import process_audio  # Import function to be queued

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis & RQ
REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
redis_conn = Redis(host=REDIS_HOST, port=REDIS_PORT)
q = Queue(connection=redis_conn)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok", 
        "queue_length": len(q),
        "mode": "async"
    }), 200

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Async endpoint.
    Expects: file 'audio', form-data 'callback_url', 'meeting_id'
    Returns: 202 Accepted + job_id
    """
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    audio_file = request.files['audio']
    callback_url = request.form.get('callback_url')
    meeting_id = request.form.get('meeting_id')

    if not callback_url or not meeting_id:
         return jsonify({"error": "Missing callback_url or meeting_id"}), 400

    job_id = str(uuid.uuid4())
    filename = f"{job_id}_{audio_file.filename}"
    temp_path = f"/app/temp_uploads/{filename}" # Shared volume path or local container path

    # Ensure dir exists
    os.makedirs(os.path.dirname(temp_path), exist_ok=True)
    
    logger.info(f"Received job for Meeting {meeting_id}. Saving to {temp_path}")
    audio_file.save(temp_path)

    # Enqueue job
    # Increase job timeout to 30 minutes for long audio transcription
    job = q.enqueue(process_audio, temp_path, meeting_id, callback_url, job_timeout=1800)
    
    logger.info(f"Job enqueued: {job.id}")

    return jsonify({
        "status": "queued",
        "job_id": job.get_id(),
        "position_in_queue": len(q)
    }), 202

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
