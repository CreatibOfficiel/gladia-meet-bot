#!/usr/bin/env python3
"""
Service Transcript Retriever - Récupération des transcriptions finales
Version dockerisée de save_transcript.py
"""
import os
import requests
import json
import time
from flask import Flask, request, jsonify, render_template_string
from datetime import datetime

app = Flask(__name__)

# Configuration
API_BASE_URL = os.getenv("API_GATEWAY_URL", "http://api-gateway:8000")
API_KEY = os.getenv("API_KEY")
if not API_KEY:
    raise ValueError("API_KEY environment variable is required")
GLADIA_API_KEY = os.getenv("GLADIA_API_KEY", "7a36b5ee-8402-4c4b-b1a4-3f9146748fb4")

# Headers pour les requêtes API
headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Template HTML pour l'interface de récupération
HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Vexa Transcript Retriever</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 1000px; margin: 0 auto; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        textarea { height: 200px; font-family: monospace; }
        button { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        button:hover { background: #0056b3; }
        button.secondary { background: #6c757d; }
        button.secondary:hover { background: #545b62; }
        .status { margin-top: 20px; padding: 15px; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .transcript { background: #f8f9fa; padding: 15px; border-radius: 4px; margin-top: 20px; }
        .transcript h3 { margin-top: 0; }
        .download-links { margin-top: 15px; }
        .download-links a { display: inline-block; margin-right: 15px; color: #007bff; text-decoration: none; }
        .download-links a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📝 Vexa Transcript Retriever</h1>
        
        <form id="transcriptForm">
            <div class="form-group">
                <label for="meeting_id">Meeting ID:</label>
                <input type="text" id="meeting_id" name="meeting_id" placeholder="ex: cia-spqx-acb" required>
            </div>
            
            <div class="form-group">
                <label for="session_id">Session ID:</label>
                <input type="text" id="session_id" name="session_id" placeholder="ex: 9" required>
                <small>Session ID obtenu lors du lancement du bot (ex: 9, 10, etc.)</small>
            </div>
            
            <button type="submit">🔍 Retrieve Transcript</button>
            <button type="button" class="secondary" onclick="clearForm()">🗑️ Clear</button>
        </form>
        
        <div id="status"></div>
        <div id="transcript"></div>
    </div>

    <script>
        // Auto-fill session_id from URL parameter if present
        document.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('session_id');
            if (sessionId) {
                document.getElementById('session_id').value = sessionId;
            }
        });
        
        document.getElementById('transcriptForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = {
                meeting_id: formData.get('meeting_id'),
                session_id: formData.get('session_id') || null
            };
            
            const statusDiv = document.getElementById('status');
            const transcriptDiv = document.getElementById('transcript');
            
            statusDiv.innerHTML = '<div class="info">🔄 Retrieving transcript...</div>';
            transcriptDiv.innerHTML = '';
            
            try {
                const response = await fetch('/retrieve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    statusDiv.innerHTML = '<div class="success">✅ Transcript retrieved successfully!</div>';
                    
                    // Display transcript
                    let transcriptHtml = '<div class="transcript">';
                    transcriptHtml += '<h3>📄 Transcript Results</h3>';
                    
                    if (result.session_info) {
                        transcriptHtml += '<p><strong>Session ID:</strong> ' + result.session_info.session_id + '</p>';
                        transcriptHtml += '<p><strong>Status:</strong> ' + result.session_info.status + '</p>';
                        transcriptHtml += '<p><strong>Audio Duration:</strong> ' + result.session_info.audio_duration + ' seconds</p>';
                    }
                    
                    if (result.transcript_text) {
                        transcriptHtml += '<h4>Full Transcript:</h4>';
                        transcriptHtml += '<textarea readonly>' + result.transcript_text + '</textarea>';
                    }
                    
                    if (result.utterances && result.utterances.length > 0) {
                        transcriptHtml += '<h4>Utterances:</h4>';
                        transcriptHtml += '<ul>';
                        result.utterances.forEach(utterance => {
                            transcriptHtml += '<li><strong>' + utterance.start + 's-' + utterance.end + 's:</strong> ' + utterance.text + '</li>';
                        });
                        transcriptHtml += '</ul>';
                    }
                    
                    transcriptHtml += '<div class="download-links">';
                    transcriptHtml += '<a href="/download/json/' + data.meeting_id + '" target="_blank">📥 Download JSON</a>';
                    transcriptHtml += '<a href="/download/txt/' + data.meeting_id + '" target="_blank">📥 Download TXT</a>';
                    transcriptHtml += '</div>';
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
    """Page d'accueil avec interface de récupération"""
    return render_template_string(HTML_TEMPLATE)

@app.route('/retrieve', methods=['POST'])
def retrieve_transcript():
    """Récupérer une transcription"""
    try:
        data = request.json
        session_id = data.get('session_id')  # Notre ID interne (1, 2, 3, etc.) ou UUID Gladia
        
        if not session_id:
            return jsonify({'error': 'Session ID is required'}), 400
        
        print(f"🔍 Retrieving transcript for session: {session_id}")
        
        # Si le session_id ressemble à un UUID Gladia, l'utiliser directement
        if len(session_id) == 36 and '-' in session_id:
            print(f"📡 Using Gladia session ID directly: {session_id}")
            gladia_result = get_gladia_final_results(session_id)
            if gladia_result:
                return jsonify(gladia_result), 200
            else:
                return jsonify({'error': 'No transcript found for this session'}), 404
        else:
            # Récupérer le gladia_session_id depuis la base de données
            try:
                response = requests.get(f"{API_BASE_URL}/meetings/{session_id}", headers=headers)
                if response.status_code == 200:
                    meeting_data = response.json()
                    gladia_session_id = meeting_data.get('gladia_session_id')
                    
                    if not gladia_session_id:
                        return jsonify({'error': 'No Gladia session ID found for this meeting'}), 404
                    
                    print(f"📡 Found Gladia session ID: {gladia_session_id}")
                    
                    # Récupérer les résultats finaux depuis Gladia
                    gladia_result = get_gladia_final_results(gladia_session_id)
                    if gladia_result:
                        return jsonify(gladia_result), 200
                    else:
                        return jsonify({'error': 'No transcript found for this session'}), 404
                else:
                    return jsonify({'error': f'Failed to get meeting data: {response.status_code}'}), response.status_code
                    
            except Exception as e:
                return jsonify({'error': f'Error retrieving meeting data: {str(e)}'}), 500
            
    except Exception as e:
        error_msg = f"Error retrieving transcript: {str(e)}"
        print(f"❌ {error_msg}")
        return jsonify({'error': error_msg}), 500

def get_gladia_final_results(session_id):
    """Récupérer les résultats finaux depuis l'API Gladia"""
    try:
        # Appel à l'API Gladia pour récupérer les résultats finaux
        gladia_url = f"https://api.gladia.io/v2/live/{session_id}"
        headers_gladia = {
            "X-GLADIA-KEY": GLADIA_API_KEY,
            "Content-Type": "application/json"
        }
        
        response = requests.get(gladia_url, headers=headers_gladia, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            
            # Extraire les informations importantes
            session_info = {
                'session_id': session_id,
                'status': result.get('status', 'unknown'),
                'audio_duration': result.get('audio_duration', 0)
            }
            
            transcript_text = ""
            utterances = []
            
            if result.get('result') and result['result'].get('transcription'):
                transcription = result['result']['transcription']
                transcript_text = transcription.get('full_transcript', "")
                
                # Extraire les utterances
                for utterance in transcription.get('utterances', []):
                    utterances.append({
                        'text': utterance.get('text', ''),
                        'start': utterance.get('start', 0),
                        'end': utterance.get('end', 0),
                        'language': utterance.get('language', 'unknown')
                    })
            
            return {
                'session_info': session_info,
                'transcript_text': transcript_text,
                'utterances': utterances,
                'raw_result': result
            }
        else:
            print(f"Gladia API error: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"Error calling Gladia API: {e}")
        return None

@app.route('/download/json/<meeting_id>')
def download_json(meeting_id):
    """Télécharger la transcription en JSON"""
    # Cette fonction simulerait le téléchargement d'un fichier JSON
    # Pour l'instant, retourne un message
    return jsonify({'message': f'JSON download for meeting {meeting_id} would be implemented here'})

@app.route('/download/txt/<meeting_id>')
def download_txt(meeting_id):
    """Télécharger la transcription en TXT"""
    # Cette fonction simulerait le téléchargement d'un fichier TXT
    # Pour l'instant, retourne un message
    return jsonify({'message': f'TXT download for meeting {meeting_id} would be implemented here'})

if __name__ == '__main__':
    print("📝 Transcript Retriever Service starting...")
    print(f"📡 API Gateway URL: {API_BASE_URL}")
    print(f"🔑 Gladia API Key: {GLADIA_API_KEY[:8]}...")
    app.run(host='0.0.0.0', port=8080, debug=False) 