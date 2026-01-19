import numpy as np


def pcm16_to_float32(audio_bytes: bytes) -> np.ndarray:
    """Convert PCM 16-bit audio to float32 normalized to [-1, 1]."""
    audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
    return audio_np / 32768.0


def resample_audio(audio: np.ndarray, orig_sr: int, target_sr: int = 16000) -> np.ndarray:
    """Resample audio to target sample rate if needed."""
    if orig_sr == target_sr:
        return audio

    # Simple linear interpolation resampling
    duration = len(audio) / orig_sr
    target_length = int(duration * target_sr)

    indices = np.linspace(0, len(audio) - 1, target_length)
    resampled = np.interp(indices, np.arange(len(audio)), audio)

    return resampled.astype(np.float32)
