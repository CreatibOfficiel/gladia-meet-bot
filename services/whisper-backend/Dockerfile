FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (needed for soundfile/torchaudio sometimes, essentially libs for audio processing)
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    build-essential \
    cmake \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the model during build to speed up first boot?
# OR we let it download on first run (simpler for now over persistent volume).
# Ideally we mount a volume for /root/.cache/huggingface

COPY app.py .
COPY worker.py .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Create temp uploads directory
RUN mkdir -p /app/temp_uploads

EXPOSE 5000

CMD ["./entrypoint.sh"]
