import express from 'express';
import { Server } from 'ws';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import cors from 'cors';
import FormData from 'form-data';
import axios from 'axios';

dotenv.config();

const PORT = process.env.PORT || 8084;
const WHISPER_API_URL = process.env.WHISPER_API_URL || 'http://whisper-backend:5000';
const PROXY_PUBLIC_HOST = process.env.PROXY_PUBLIC_HOST || `gladia-proxy:${PORT}`;

console.log(`🚀 Proxy Service running on port ${PORT}`);
console.log(`📡 Target Whisper API: ${WHISPER_API_URL}`);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new Server({ server });

// --- WAV Header Helpers ---
const writeWavHeader = (fd: number, dataLength: number, sampleRate: number = 16000) => {
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4); // ChunkSize
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size
    buffer.writeUInt16LE(1, 20); // AudioFormat (1=PCM)
    buffer.writeUInt16LE(1, 22); // NumChannels
    buffer.writeUInt32LE(sampleRate, 24); // SampleRate
    buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
    buffer.writeUInt16LE(2, 32); // BlockAlign
    buffer.writeUInt16LE(16, 34); // BitsPerSample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40); // Subchunk2Size
    
    fs.writeSync(fd, buffer, 0, 44, 0);
};

// --- HTTP Routes ---
app.get('/v2/live', (req, res) => {
    handleAuthRequest(req, res);
});

app.post('/v2/live', (req, res) => {
    handleAuthRequest(req, res);
});

const handleAuthRequest = (req: any, res: any) => {
    const sessionId = `sess_${Date.now()}`;
    const wsUrl = `ws://${PROXY_PUBLIC_HOST}/v2/live?id=${sessionId}`;
    
    if (req.headers['content-type'] === 'application/json') {
         res.json({ url: wsUrl, id: sessionId });
    } else {
         res.redirect(wsUrl);
    }
}


// --- Health Check Endpoint ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'gladia-murmure-proxy',
    version: '1.0.0',
    config: {
      port: PORT,
      whisper_api: WHISPER_API_URL,
      proxy_host: PROXY_PUBLIC_HOST
    }
  });
});

// --- WebSocket Handling ---
wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const params = new URLSearchParams(req.url?.split('?')[1]);
    const sessionId = params.get('id') || `sess_${Date.now()}`;
    console.log(`[WS] New connection (Session: ${sessionId})`);

    const tempFilePath = path.join('/tmp', `recording_${sessionId}.wav`);
    let fileDescriptor: number | null = null;
    let totalBytesWritten = 0;
    let isRecording = true;

    try {
        fileDescriptor = fs.openSync(tempFilePath, 'w');
        // Write placeholder header
        writeWavHeader(fileDescriptor, 0); 
        console.log(`[Recorder] Recording to ${tempFilePath}`);
    } catch (err) {
        console.error('[Recorder] Failed to create temp file:', err);
        ws.close(1011, "Internal Server Error");
        return;
    }

    // Helper to send JSON to bot
    const sendToBot = (data: any) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    };
    
    // Send initial "init" message
    sendToBot({ type: 'init', request_id: sessionId });

    // Function to finalize and transcribe
    const finalizeAndTranscribe = async () => {
        if (!fileDescriptor) return;

        try {
            // Update WAV header with correct size
            writeWavHeader(fileDescriptor, totalBytesWritten);
            fs.closeSync(fileDescriptor);
            fileDescriptor = null;
            
            console.log(`[Recorder] Finalized ${tempFilePath} (${totalBytesWritten} bytes). Sending to backend (Async)...`);
            
            // Send to Whisper Backend
            const formData = new FormData();
            formData.append('audio', fs.createReadStream(tempFilePath));
            
            // Extract Meeting ID from session ID or pass it if available. 
            // Currently session ID is 'sess_...' or passed via URL.
            // Ideally the bot passes the DB meeting ID in the init.
            // For now, let's assume session ID IS usable or we pass a placeholder if not found.
            // TODO: Ensure Bot passes meeting_id in URL params! e.g. ?id=...&meeting_id=123
            
            const meetingId = params.get('meeting_id') || '0'; // Default to 0/unknown if not passed
            const callbackUrl = 'http://bot-manager:8080/bots/internal/transcript';

            formData.append('meeting_id', meetingId);
            formData.append('callback_url', callbackUrl);

            const response = await axios.post(`${WHISPER_API_URL}/transcribe`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Content-Type': 'multipart/form-data'
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            } as any);

            const responseData = response.data as any;

            console.log(`[Whisper] Job Queued. ID: ${responseData.job_id}, Queued: ${responseData.position_in_queue}`);

            // We don't wait for transcript here anymore. It ends up in Bot Manager.

        } catch (error: any) {
            console.error('[Whisper] Failed to enqueue job:', error.message || error);
        } finally {
            // Cleanup temp file immediately
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
                console.log(`[Recorder] Deleted temp file ${tempFilePath}`);
            }
        }
    };

    ws.on('message', (message: any, isBinary: boolean) => {
        if (!isRecording) return;

        if (isBinary || Buffer.isBuffer(message)) {
            const buf = message as Buffer;
            if (fileDescriptor) {
                fs.writeSync(fileDescriptor, buf);
                totalBytesWritten += buf.length;
            }
        } else {
             // Control messages
             try {
                const msgStr = message.toString();
                const data = JSON.parse(msgStr);
                
                if (data.type === 'stop_recording') {
                    console.log('[WS] Received stop_recording');
                    isRecording = false;
                    finalizeAndTranscribe();
                }
             } catch(e) {}
        }
    });

    ws.on('close', () => {
        console.log(`[WS] Closed connection (Session: ${sessionId})`);
        if (isRecording) {
            isRecording = false;
            finalizeAndTranscribe();
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Proxy Service running on port ${PORT}`);
    console.log(`📡 Target Whisper API: ${WHISPER_API_URL}`);
});
