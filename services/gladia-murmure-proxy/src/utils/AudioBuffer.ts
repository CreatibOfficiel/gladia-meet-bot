
export class AudioBuffer {
    private buffer: Buffer;
    private size: number;
    private _byteSize: number = 0;

    constructor(maxDurationMs: number = 10000, sampleRate: number = 16000, channels: number = 1, bitDepth: number = 16) {
        const bytesPerSample = bitDepth / 8;
        const bytesPerSecond = sampleRate * channels * bytesPerSample;
        this.size = (maxDurationMs / 1000) * bytesPerSecond;
        this.buffer = Buffer.alloc(0);
    }

    append(data: Buffer) {
        this.buffer = Buffer.concat([this.buffer, data]);
        this._byteSize = this.buffer.length;

        // Trim input if too large (should not happen with regular usage but safety net)
        // If buffer grows beyond max safety size, trim from start
        if (this.buffer.length > this.size) {
            this.buffer = this.buffer.subarray(this.buffer.length - this.size);
            this._byteSize = this.buffer.length;
        }
    }

    /**
     * Get the last N milliseconds of audio
     */
    getWindow(durationMs: number): Buffer {
        const bytesPerSample = 2; // 16-bit
        const sampleRate = 16000;
        const bytesPerSecond = sampleRate * 1 * bytesPerSample;
        const requestedBytes = Math.floor((durationMs / 1000) * bytesPerSecond);
        
        if (this.buffer.length <= requestedBytes) {
            return this.buffer;
        }
        
        return this.buffer.subarray(this.buffer.length - requestedBytes);
    }

    get byteSize(): number {
        return this._byteSize;
    }

    clear() {
        this.buffer = Buffer.alloc(0);
        this._byteSize = 0;
    }
}
