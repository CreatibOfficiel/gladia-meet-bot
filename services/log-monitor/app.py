#!/usr/bin/env python3
"""
Service Log Monitor - Monitoring des logs en temps réel
Version dockerisée de watch_bot_logs.py
"""
import os
import json
import subprocess
import time
from flask import Flask, request, jsonify, render_template_string
from datetime import datetime

app = Flask(__name__)

# Template HTML pour l'interface de monitoring multi-bots
HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Vexa Log Monitor</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .controls { display: flex; gap: 10px; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        button.stop { background: #dc3545; }
        button.stop:hover { background: #c82333; }
        .bots-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(600px, 1fr)); gap: 20px; }
        .bot-panel { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; }
        .bot-header { background: #e9ecef; padding: 10px; border-bottom: 1px solid #dee2e6; font-weight: bold; }
        .bot-info { background: #f1f3f4; padding: 8px; border-bottom: 1px solid #dee2e6; font-size: 12px; }
        .log-content { padding: 15px; font-family: monospace; white-space: pre-wrap; max-height: 300px; overflow-y: auto; font-size: 11px; }
        .status { margin-bottom: 20px; padding: 15px; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .no-bots { text-align: center; padding: 40px; color: #6c757d; font-style: italic; }
        .gladia-session { color: #28a745; font-weight: bold; }
        .meeting-id { color: #007bff; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Vexa Multi-Bot Monitor</h1>
            <div class="controls">
                <button onclick="startMonitoring()">▶️ Start Monitoring</button>
                <button class="stop" onclick="stopMonitoring()">⏹️ Stop Monitoring</button>
                <button onclick="clearLogs()">🗑️ Clear Logs</button>
            </div>
        </div>
        
        <div id="status"></div>
        <div id="botsContainer" class="bots-container">
            <div class="no-bots">No active bots found. Start monitoring to see bot logs.</div>
        </div>
    </div>

    <script>
        let monitoringInterval;
        
        function startMonitoring() {
            document.getElementById('status').innerHTML = '<div class="info">🔄 Starting monitoring...</div>';
            
            // Start monitoring immediately
            updateLogs();
            
            // Then update every 3 seconds
            monitoringInterval = setInterval(updateLogs, 3000);
        }
        
        function stopMonitoring() {
            if (monitoringInterval) {
                clearInterval(monitoringInterval);
                monitoringInterval = null;
            }
            document.getElementById('status').innerHTML = '<div class="info">⏹️ Monitoring stopped</div>';
        }
        
        function clearLogs() {
            document.getElementById('botsContainer').innerHTML = '<div class="no-bots">Logs cleared...</div>';
        }
        
        async function updateLogs() {
            try {
                // Get bot logs
                const botResponse = await fetch('/logs/bot');
                const botData = await botResponse.json();
                
                if (botData.bots && botData.bots.length > 0) {
                    let html = '';
                    botData.bots.forEach(bot => {
                        html += `
                            <div class="bot-panel">
                                <div class="bot-header">🤖 Bot: ${bot.container}</div>
                                <div class="bot-info">
                                    📅 Meeting ID: <span class="meeting-id">${bot.meeting_id}</span> | 
                                    📊 Status: ${bot.status} | 
                                    🎤 Gladia Session: <span class="gladia-session">${bot.gladia_session}</span>
                                </div>
                                <div class="log-content">${bot.logs || 'No logs available'}</div>
                            </div>
                        `;
                    });
                    document.getElementById('botsContainer').innerHTML = html;
                } else {
                    document.getElementById('botsContainer').innerHTML = '<div class="no-bots">No active bots found</div>';
                }
                
                document.getElementById('status').innerHTML = '<div class="success">✅ Monitoring active - Last update: ' + new Date().toLocaleTimeString() + '</div>';
            } catch (error) {
                document.getElementById('status').innerHTML = '<div class="error">❌ Error updating logs: ' + error.message + '</div>';
            }
        }
        
        // Auto-start monitoring when page loads
        window.onload = function() {
            startMonitoring();
        };
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    """Page d'accueil avec interface de monitoring"""
    return render_template_string(HTML_TEMPLATE)

@app.route('/logs/bot')
def get_bot_logs():
    """Obtenir les logs de tous les bots actifs"""
    try:
        # Récupérer tous les bots actifs
        result = subprocess.run(
            ['docker', 'ps', '--filter', 'name=vexa-bot', '--format', '{{.Names}}\t{{.Status}}'],
            capture_output=True, text=True, timeout=5
        )
        
        if result.returncode == 0 and result.stdout.strip():
            bot_containers = result.stdout.strip().split('\n')
            # Filtrer pour ne garder que les vrais bots (pas les services)
            real_bots = []
            for line in bot_containers:
                if line.strip() and line.startswith('vexa-bot-') and not line.startswith('vexa-bot-complete-'):
                    parts = line.split('\t')
                    if len(parts) >= 2:
                        real_bots.append({
                            'name': parts[0],
                            'status': parts[1]
                        })
            
            if not real_bots:
                return jsonify({'bots': []})
            
            # Récupérer les logs de chaque bot
            bots_logs = []
            for bot in real_bots:
                try:
                    # Extraire l'ID du meeting du nom du conteneur
                    meeting_id = "Unknown"
                    if '-' in bot['name']:
                        parts = bot['name'].split('-')
                        if len(parts) >= 3:
                            meeting_id = parts[2]  # vexa-bot-13-89cd44f8 -> 13
                    
                    # Récupérer le vrai Meeting ID depuis la base de données
                    try:
                        import requests
                        # Récupérer le token API depuis l'environnement
                        api_key = os.getenv("API_KEY")
                        if not api_key:
                            raise Exception("API_KEY not found in environment")
                        
                        app.logger.info(f"Fetching meeting data for ID: {meeting_id}")
                        response = requests.get(f"http://api-gateway:8000/meetings/{meeting_id}", 
                                              headers={"X-API-Key": api_key}, 
                                              timeout=5)
                        app.logger.info(f"Response status: {response.status_code}")
                        
                        if response.status_code == 200:
                            meeting_data = response.json()
                            app.logger.info(f"Meeting data: {meeting_data}")
                            real_meeting_id = meeting_data.get('platform_specific_id', 'Unknown')
                            gladia_session_id = meeting_data.get('gladia_session_id')
                            meeting_id = f"{meeting_id} ({real_meeting_id})"
                            
                            # Mettre à jour le gladia_session_id si disponible
                            if gladia_session_id:
                                bot['gladia_session'] = gladia_session_id
                            else:
                                bot['gladia_session'] = "Not found"
                        else:
                            app.logger.error(f"API returned status {response.status_code}: {response.text}")
                    except Exception as e:
                        app.logger.error(f"Error fetching meeting data: {e}")
                        pass  # Si on ne peut pas récupérer, on garde l'ID interne
                    
                    # Récupérer les logs du bot
                    log_result = subprocess.run(
                        ['docker', 'logs', '--tail', '15', bot['name']],
                        capture_output=True, text=True, timeout=5
                    )
                    
                    if log_result.returncode == 0:
                        logs = log_result.stdout
                        # Filtrer les logs importants
                        important_logs = []
                        for line in logs.split('\n'):
                            if any(keyword in line for keyword in ['🎤', '🎵', '✅', '❌', 'Error', 'session_id', 'Participants', 'Gladia session', 'WebSocket']):
                                important_logs.append(line)
                        
                        # Utiliser le gladia_session_id récupéré depuis l'API, sinon essayer de l'extraire des logs
                        gladia_session = bot.get('gladia_session', "Not found")
                        if gladia_session == "Not found":
                            # Fallback : essayer d'extraire depuis les logs
                            for line in important_logs:
                                if 'session_id' in line and 'Gladia session initialized' in line:
                                    try:
                                        import re
                                        match = re.search(r'Gladia session initialized: ([a-f0-9-]+)', line)
                                        if match:
                                            gladia_session = match.group(1)
                                    except:
                                        pass
                        
                        bots_logs.append({
                            'container': bot['name'],
                            'meeting_id': meeting_id,
                            'status': bot['status'],
                            'gladia_session': gladia_session,
                            'logs': '\n'.join(important_logs[-30:])  # Dernières 30 lignes importantes
                        })
                    else:
                        bots_logs.append({
                            'container': bot['name'],
                            'meeting_id': meeting_id,
                            'status': bot['status'],
                            'gladia_session': 'Error reading logs',
                            'logs': f'Error reading logs: {log_result.stderr}'
                        })
                        
                except Exception as e:
                    bots_logs.append({
                        'container': bot['name'],
                        'meeting_id': 'Error',
                        'status': bot['status'],
                        'gladia_session': 'Error',
                        'logs': f'Error processing bot: {str(e)}'
                    })
            
            return jsonify({'bots': bots_logs})
        
        return jsonify({'bots': []})
        
    except Exception as e:
        return jsonify({'error': f'Error getting bot logs: {str(e)}'})

# Route Redis supprimée car on utilise Gladia directement

@app.route('/containers')
def get_containers():
    """Obtenir la liste des conteneurs actifs"""
    try:
        result = subprocess.run(
            ['docker', 'ps', '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'],
            capture_output=True, text=True, timeout=5
        )
        
        if result.returncode == 0:
            containers = []
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    parts = line.split('\t')
                    if len(parts) >= 2:
                        containers.append({
                            'name': parts[0],
                            'status': parts[1],
                            'ports': parts[2] if len(parts) > 2 else ''
                        })
            
            return jsonify({'containers': containers})
        
        return jsonify({'error': 'Failed to get containers'})
        
    except Exception as e:
        return jsonify({'error': f'Error getting containers: {str(e)}'})

if __name__ == '__main__':
    print("📊 Log Monitor Service starting...")
    print("✅ Multi-bot monitoring ready (Redis removed)")
    
    app.run(host='0.0.0.0', port=8080, debug=False) 