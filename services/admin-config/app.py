#!/usr/bin/env python3
"""
Service Admin Config - Interface de configuration admin
Permet de modifier les configurations stockées en base de données.
"""
import os
from flask import Flask, request, jsonify, render_template_string, redirect, url_for, session, flash
from datetime import datetime

# Import shared auth module
import sys
sys.path.insert(0, '/app')
from shared.auth import (
    require_auth, logout, ensure_configs_table, init_default_admin,
    get_db_connection, get_config_value, set_config_value, hash_password
)
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')

# Template HTML pour l'interface de configuration
HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Admin Configuration</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f6fa;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            font-size: 24px;
        }
        .user-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .user-info span {
            color: #666;
        }
        .logout-btn {
            background: #dc3545;
            color: white;
            padding: 8px 16px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            font-size: 14px;
        }
        .logout-btn:hover {
            background: #c82333;
        }
        .card {
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            overflow: hidden;
        }
        .card-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            font-weight: 600;
        }
        .card-body {
            padding: 20px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group:last-child {
            margin-bottom: 0;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        .label-description {
            font-weight: normal;
            color: #666;
            font-size: 12px;
            margin-left: 5px;
        }
        input[type="text"], input[type="password"] {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e1e1e1;
            border-radius: 6px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        input[readonly] {
            background: #f8f9fa;
            color: #666;
        }
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-secondary:hover {
            background: #5a6268;
        }
        .alert {
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
        }
        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .config-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #eee;
        }
        .config-item:last-child {
            border-bottom: none;
        }
        .config-key {
            font-weight: 500;
            color: #333;
        }
        .config-value {
            color: #666;
            font-family: monospace;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .secret-value {
            color: #999;
            font-style: italic;
        }
        .timestamp {
            color: #999;
            font-size: 12px;
        }
        .nav-links {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
        }
        .nav-links a {
            color: #667eea;
            text-decoration: none;
        }
        .nav-links a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Admin Configuration</h1>
            <div class="user-info">
                <span>Logged in as: {{ session.get('admin_username', 'admin') }}</span>
                <a href="{{ url_for('logout_route') }}" class="logout-btn">Logout</a>
            </div>
        </div>

        <div class="nav-links">
            <a href="http://{{ request.host.split(':')[0] }}:9081">Bot Launcher</a>
            <a href="http://{{ request.host.split(':')[0] }}:9082">Log Monitor</a>
            <a href="http://{{ request.host.split(':')[0] }}:9083">Transcript Retriever</a>
        </div>

        {% with messages = get_flashed_messages(with_categories=true) %}
        {% if messages %}
            {% for category, message in messages %}
            <div class="alert alert-{{ category }}">{{ message }}</div>
            {% endfor %}
        {% endif %}
        {% endwith %}

        <!-- Admin Credentials Section -->
        <div class="card">
            <div class="card-header">Admin Credentials</div>
            <div class="card-body">
                <form method="POST" action="{{ url_for('update_admin_credentials') }}">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" name="admin_username" value="{{ configs.get('admin_username', 'admin') }}" required>
                    </div>
                    <div class="form-group">
                        <label>New Password <span class="label-description">(leave empty to keep current)</span></label>
                        <input type="password" name="admin_password" placeholder="Enter new password">
                    </div>
                    <div class="form-group">
                        <label>Confirm Password</label>
                        <input type="password" name="admin_password_confirm" placeholder="Confirm new password">
                    </div>
                    <button type="submit" class="btn btn-primary">Update Credentials</button>
                </form>
            </div>
        </div>

        <!-- API Configuration Section -->
        <div class="card">
            <div class="card-header">API Configuration</div>
            <div class="card-body">
                <form method="POST" action="{{ url_for('update_config') }}">
                    <input type="hidden" name="config_section" value="api">
                    <div class="form-group">
                        <label>API Token <span class="label-description">(used for bot API authentication)</span></label>
                        <input type="password" name="api_token" placeholder="Current token hidden" value="">
                        <small style="color: #666; display: block; margin-top: 5px;">Leave empty to keep current value</small>
                    </div>
                    <button type="submit" class="btn btn-primary">Update API Config</button>
                </form>
            </div>
        </div>

        <!-- Database Configuration Section -->
        <div class="card">
            <div class="card-header">Database Configuration</div>
            <div class="card-body">
                <form method="POST" action="{{ url_for('update_config') }}">
                    <input type="hidden" name="config_section" value="database">
                    <div class="form-group">
                        <label>Database Host</label>
                        <input type="text" name="db_host" value="{{ configs.get('db_host', 'postgres') }}">
                    </div>
                    <div class="form-group">
                        <label>Database Port</label>
                        <input type="text" name="db_port" value="{{ configs.get('db_port', '5432') }}">
                    </div>
                    <div class="form-group">
                        <label>Database Name</label>
                        <input type="text" name="db_name" value="{{ configs.get('db_name', 'vexa') }}">
                    </div>
                    <div class="form-group">
                        <label>Database User</label>
                        <input type="text" name="db_user" value="{{ configs.get('db_user', 'vexa') }}">
                    </div>
                    <div class="form-group">
                        <label>Database Password <span class="label-description">(leave empty to keep current)</span></label>
                        <input type="password" name="db_password" placeholder="Current password hidden">
                    </div>
                    <button type="submit" class="btn btn-primary">Update Database Config</button>
                </form>
            </div>
        </div>

        <!-- Current Configurations -->
        <div class="card">
            <div class="card-header">All Configurations</div>
            <div class="card-body">
                {% for config in all_configs %}
                <div class="config-item">
                    <div>
                        <div class="config-key">{{ config.key }}</div>
                        {% if config.description %}
                        <div style="color: #999; font-size: 12px;">{{ config.description }}</div>
                        {% endif %}
                    </div>
                    <div style="text-align: right;">
                        {% if config.is_secret %}
                        <div class="config-value secret-value">********</div>
                        {% else %}
                        <div class="config-value">{{ config.value[:50] }}{% if config.value|length > 50 %}...{% endif %}</div>
                        {% endif %}
                        <div class="timestamp">Updated: {{ config.updated_at }}</div>
                    </div>
                </div>
                {% endfor %}
                {% if not all_configs %}
                <p style="color: #666; text-align: center;">No configurations found.</p>
                {% endif %}
            </div>
        </div>
    </div>
</body>
</html>
"""


def get_all_configs():
    """Récupérer toutes les configurations."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT key, value, description, is_secret, updated_at FROM configs ORDER BY key")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        print(f"Error getting configs: {e}")
        return []


def get_configs_dict():
    """Récupérer les configurations sous forme de dictionnaire."""
    configs = get_all_configs()
    return {c['key']: c['value'] for c in configs if not c['is_secret']}


@app.route('/', methods=['GET', 'POST'])
@require_auth
def index():
    """Page d'accueil avec formulaires de configuration."""
    configs = get_configs_dict()
    all_configs = get_all_configs()
    return render_template_string(HTML_TEMPLATE, configs=configs, all_configs=all_configs)


@app.route('/logout')
def logout_route():
    """Déconnexion de l'utilisateur."""
    logout()
    return redirect(url_for('index'))


@app.route('/update-admin', methods=['POST'])
@require_auth
def update_admin_credentials():
    """Mettre à jour les credentials admin."""
    username = request.form.get('admin_username', '').strip()
    password = request.form.get('admin_password', '').strip()
    password_confirm = request.form.get('admin_password_confirm', '').strip()

    if not username:
        flash('Username is required', 'error')
        return redirect(url_for('index'))

    # Update username
    set_config_value('admin_username', username, 'Admin username', is_secret=False)

    # Update password if provided
    if password:
        if password != password_confirm:
            flash('Passwords do not match', 'error')
            return redirect(url_for('index'))
        if len(password) < 4:
            flash('Password must be at least 4 characters', 'error')
            return redirect(url_for('index'))
        set_config_value('admin_password_hash', hash_password(password), 'Admin password hash', is_secret=True)
        flash('Credentials updated successfully. Please login again with new credentials.', 'success')
        logout()
        return redirect(url_for('index'))

    flash('Username updated successfully', 'success')
    return redirect(url_for('index'))


@app.route('/update-config', methods=['POST'])
@require_auth
def update_config():
    """Mettre à jour une configuration."""
    section = request.form.get('config_section', '')

    if section == 'api':
        api_token = request.form.get('api_token', '').strip()
        if api_token:
            set_config_value('api_token', api_token, 'API authentication token', is_secret=True)
            flash('API configuration updated', 'success')
        else:
            flash('No changes made (empty values ignored)', 'success')

    elif section == 'database':
        db_host = request.form.get('db_host', '').strip()
        db_port = request.form.get('db_port', '').strip()
        db_name = request.form.get('db_name', '').strip()
        db_user = request.form.get('db_user', '').strip()
        db_password = request.form.get('db_password', '').strip()

        if db_host:
            set_config_value('db_host', db_host, 'Database host', is_secret=False)
        if db_port:
            set_config_value('db_port', db_port, 'Database port', is_secret=False)
        if db_name:
            set_config_value('db_name', db_name, 'Database name', is_secret=False)
        if db_user:
            set_config_value('db_user', db_user, 'Database user', is_secret=False)
        if db_password:
            set_config_value('db_password', db_password, 'Database password', is_secret=True)

        flash('Database configuration updated', 'success')

    return redirect(url_for('index'))


if __name__ == '__main__':
    print("Admin Config Service starting...")

    # Initialize auth system
    try:
        ensure_configs_table()
        init_default_admin()
        print("Authentication system initialized")
    except Exception as e:
        print(f"Auth initialization warning: {e}")

    app.run(host='0.0.0.0', port=8080, debug=False)
