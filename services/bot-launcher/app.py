#!/usr/bin/env python3
"""
Service Bot Launcher - Interface utilisateur pour lancer des bots
Version dockerisée de launch_meet_bot.py
"""
import os
import requests
import json
import time
from flask import Flask, request, jsonify, render_template
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

# Template HTML simple pour l'interface

@app.route('/')
def index():
    """Page d'accueil avec interface utilisateur"""
    return render_template('template.html')

@app.route('/launch', methods=['POST'])
def launch_bot():
    """Lancer un bot pour un meeting"""
    try:
        data = request.json
        
        # Validation des données
        if not data.get('native_meeting_id'):
            return jsonify({'error': 'Meeting ID is required'}), 400
        
        print(f"🚀 Launching bot for meeting: {data['native_meeting_id']}")
        
        # Appel à l'API Gateway
        response = requests.post(f"{API_BASE_URL}/bots", headers=headers, json=data)
        
        if response.status_code == 201:
            result = response.json()
            print(f"✅ Bot launched successfully: {result}")
            return jsonify(result), 201
        else:
            error_msg = f"Failed to launch bot: {response.status_code} - {response.text}"
            print(f"❌ {error_msg}")
            return jsonify({'error': error_msg}), response.status_code
            
    except Exception as e:
        error_msg = f"Error launching bot: {str(e)}"
        print(f"❌ {error_msg}")
        return jsonify({'error': error_msg}), 500

@app.route('/status')
def get_bot_status():
    """Obtenir le statut de tous les bots"""
    try:
        response = requests.get(f"{API_BASE_URL}/bots/status", headers=headers)
        
        if response.status_code == 200:
            return jsonify(response.json()), 200
        else:
            return jsonify({'error': f'Status check failed: {response.status_code}'}), response.status_code
            
    except Exception as e:
        return jsonify({'error': f'Error checking status: {str(e)}'}), 500

@app.route('/stop/<meeting_id>', methods=['DELETE'])
def stop_bot(meeting_id):
    """Arrêter un bot"""
    try:
        response = requests.delete(f"{API_BASE_URL}/bots/google_meet/{meeting_id}", headers=headers)
        
        if response.status_code == 200:
            return jsonify({'message': 'Bot stopped successfully'}), 200
        else:
            return jsonify({'error': f'Failed to stop bot: {response.status_code}'}), response.status_code
            
    except Exception as e:
        return jsonify({'error': f'Error stopping bot: {str(e)}'}), 500

if __name__ == '__main__':
    print("🤖 Bot Launcher Service starting...")
    print(f"📡 API Gateway URL: {API_BASE_URL}")
    app.run(host='0.0.0.0', port=8080, debug=False) 