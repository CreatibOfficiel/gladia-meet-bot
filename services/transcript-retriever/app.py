#!/usr/bin/env python3
"""
Service Transcript Retriever - Récupération des transcriptions (Nouvelle version Whisper)
"""
import os
import requests
import json
from flask import Flask, request, jsonify, render_template_string
from datetime import datetime

app = Flask(__name__)

# Configuration
API_BASE_URL = os.getenv("API_GATEWAY_URL", "http://api-gateway:8000")
API_KEY = os.getenv("API_KEY")
if not API_KEY:
    raise ValueError("API_KEY environment variable is required")

# Headers pour les requêtes API
headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Template HTML
HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Vexa Transcript Retriever (Whisper)</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #333; }
        input { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 4px; font-size: 14px; }
        input:focus { outline: none; border-color: #007bff; }
        small { color: #666; font-size: 12px; }
        button { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; font-size: 14px; font-weight: 500; }
        button:hover { background: #0056b3; }
        button.secondary { background: #6c757d; }
        button.secondary:hover { background: #545b62; }
        .status { margin-top: 20px; padding: 15px; border-radius: 4px; font-size: 14px; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .transcript { background: #f8f9fa; padding: 20px; border-radius: 4px; margin-top: 20px; border: 1px solid #dee2e6; }
        .transcript h3 { margin-top: 0; color: #333; }
        .transcript h4 { color: #555; margin-top: 15px; }
        .transcript-text { background: white; padding: 15px; border: 1px solid #ddd; border-radius: 4px; white-space: pre-wrap; font-family: 'Courier New', monospace; line-height: 1.6; }
        .segment { padding: 10px; margin: 5px 0; background: white; border-left: 3px solid #007bff; border-radius: 3px; }
        .timestamp { color: #007bff; font-weight: bold; margin-right: 10px; }
        .meta-info { background: #e9ecef; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .meta-info strong { color: #333; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📝 Vexa Transcript Retriever</h1>
        <p class="subtitle">Nouvelle version avec Whisper (self-hosted)</p>
        
        <form id="transcriptForm">
            <div class="form-group">
                <label for="meeting_id">Meeting ID (numérique):</label>
                <input type="number" id="meeting_id" name="meeting_id" placeholder="ex: 14" required>
                <small>ID numérique du meeting obtenu lors du lancement du bot</small>
            </div>
            
            <button type="submit">🔍 Retrieve Transcript</button>
            <button type="button" class="secondary" onclick="clearForm()">🗑️ Clear</button>
        </form>
        
        <div id="status"></div>
        <div id="transcript"></div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const meetingId = urlParams.get('meeting_id');
            if (meetingId) {
                document.getElementById('meeting_id').value = meetingId;
            }
        });
        
        document.getElementById('transcriptForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const meetingId = formData.get('meeting_id');
            
            const statusDiv = document.getElementById('status');
            const transcriptDiv = document.getElementById('transcript');
            
            statusDiv.innerHTML = '<div class="info">🔄 Retrieving transcript from database...</div>';
            transcriptDiv.innerHTML = '';
            
            try {
                const response = await fetch('/retrieve/' + meetingId, {
                    method: 'GET'
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    statusDiv.innerHTML = '<div class="success">✅ Transcript retrieved successfully!</div>';
                    
                    let transcriptHtml = '<div class="transcript">';
                    transcriptHtml += '<h3>📄 Transcription Results</h3>';
                    
                    if (result.meta) {
                        transcriptHtml += '<div class="meta-info">';
                        transcriptHtml += '<strong>Meeting ID:</strong> ' + result.meta.meeting_id + '<br>';
                        transcriptHtml += '<strong>Platform:</strong> ' + result.meta.platform + '<br>';
                        transcriptHtml += '<strong>Platform Meeting ID:</strong> ' + result.meta.platform_specific_id + '<br>';
                        transcriptHtml += '<strong>Status:</strong> ' + result.meta.status + '<br>';
                        if (result.transcript && result.transcript.duration) {
                            transcriptHtml += '<strong>Duration:</strong> ' + result.transcript.duration.toFixed(2) + ' seconds<br>';
                        }
                        if (result.transcript && result.transcript.language) {
                            transcriptHtml += '<strong>Language:</strong> ' + result.transcript.language + '<br>';
                        }
                        transcriptHtml += '</div>';
                    }
                    
                    if (result.transcript && result.transcript.transcript_text) {
                        transcriptHtml += '<h4>📝 Full Transcript:</h4>';
                        transcriptHtml += '<div class="transcript-text">' + result.transcript.transcript_text + '</div>';
                    }
                    
                    if (result.transcript && result.transcript.segments && result.transcript.segments.length > 0) {
                        transcriptHtml += '<h4>🎙️ Segments with Timestamps:</h4>';
                        result.transcript.segments.forEach(segment => {
                            transcriptHtml += '<div class="segment">';
                            transcriptHtml += '<span class="timestamp">[' + segment.start.toFixed(1) + 's - ' + segment.end.toFixed(1) + 's]</span>';
                            transcriptHtml += segment.text;
                            transcriptHtml += '</div>';
                        });
                    }
                    
                    if (!result.transcript || !result.transcript.transcript_text) {
                        transcriptHtml += '<p style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">⚠️ No transcript data found for this meeting. The audio may not have been processed yet or the transcription failed.</p>';
                    }
                    
                    transcriptHtml += '</div>';
                    transcriptDiv.innerHTML = transcriptHtml;
                } else {
                    statusDiv.innerHTML = '<div class="error">❌ Error: ' + result.error + '</div>';
                }
            } catch (error) {
                statusDiv.innerHTML = '<div class="error">❌ Network error: ' + error.message + '</div>';
            }
        });
        
        function clearForm() {
            document.getElementById('transcriptForm').reset();
            document.getElementById('status').innerHTML = '';
            document.getElementById('transcript').innerHTML = '';
        }
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    """Page d'accueil"""
    return render_template_string(HTML_TEMPLATE)

@app.route('/retrieve/<int:meeting_id>', methods=['GET'])
def retrieve_transcript(meeting_id):
    """Récupérer une transcription depuis la base de données"""
    try:
        print(f"🔍 Retrieving transcript for meeting ID: {meeting_id}")
        
        # Récupérer le meeting depuis l'API
        url = f"{API_BASE_URL}/meetings/{meeting_id}"
        print(f"📡 Calling API: {url}")
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 404:
            return jsonify({'error': 'Meeting not found'}), 404
        
        if response.status_code != 200:
            print(f"❌ API returned status {response.status_code}: {response.text}")
            return jsonify({'error': f'Failed to get meeting data: {response.status_code}'}), response.status_code
        
        meeting_data = response.json()
        print(f"✅ Meeting data retrieved: {json.dumps(meeting_data, indent=2)}")
        
        # Extraire les données de transcription du champ 'data'
        transcript_data = meeting_data.get('data', {}).get('transcript', {})
        
        result = {
            'meta': {
                'meeting_id': meeting_data.get('id'),
                'platform': meeting_data.get('platform'),
                'platform_specific_id': meeting_data.get('platform_specific_id'),
                'status': meeting_data.get('status'),
                'start_time': meeting_data.get('start_time'),
                'end_time': meeting_data.get('end_time')
            },
            'transcript': transcript_data
        }
        
        return jsonify(result), 200
        
    except requests.RequestException as e:
        print(f"❌ Request error: {e}")
        return jsonify({'error': f'Failed to connect to API: {str(e)}'}), 500
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("🚀 Starting Transcript Retriever (Whisper version)...")
    print(f"📡 API Base URL: {API_BASE_URL}")
    app.run(host='0.0.0.0', port=8080, debug=True)
