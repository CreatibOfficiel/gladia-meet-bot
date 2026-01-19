#!/usr/bin/env python3
"""
Module d'authentification partagé pour les interfaces admin Flask.
Utilise la table 'configs' en base de données pour les credentials admin.
"""
import os
import hashlib
from functools import wraps
from flask import session, redirect, request, render_template_string
import psycopg2
from psycopg2.extras import RealDictCursor

# Configuration base de données
DB_CONFIG = {
    'host': os.getenv('DATABASE_HOST', 'postgres'),
    'port': os.getenv('DATABASE_PORT', '5432'),
    'user': os.getenv('DATABASE_USER', 'vexa'),
    'password': os.getenv('DATABASE_PASSWORD', 'vexapassword'),
    'dbname': os.getenv('DATABASE_NAME', 'vexa')
}

# Template HTML pour la page de login
LOGIN_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Admin Login</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.2);
            width: 100%;
            max-width: 400px;
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
            font-size: 24px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
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
        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .error {
            background: #fee;
            color: #c00;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            text-align: center;
            border: 1px solid #fcc;
        }
        .logo {
            text-align: center;
            margin-bottom: 20px;
            font-size: 48px;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">🔐</div>
        <h1>Admin Authentication</h1>
        {% if error %}
        <div class="error">{{ error }}</div>
        {% endif %}
        <form method="POST">
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" required autofocus>
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit">Login</button>
        </form>
    </div>
</body>
</html>
"""


def get_db_connection():
    """Créer une connexion à la base de données PostgreSQL."""
    return psycopg2.connect(**DB_CONFIG)


def get_config_value(key: str, default: str = None) -> str:
    """Récupérer une valeur de configuration depuis la table configs."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT value FROM configs WHERE key = %s", (key,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row['value'] if row else default
    except Exception as e:
        print(f"Error getting config {key}: {e}")
        return default


def set_config_value(key: str, value: str, description: str = None, is_secret: bool = False):
    """Définir ou mettre à jour une valeur de configuration."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO configs (key, value, description, is_secret)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                description = COALESCE(EXCLUDED.description, configs.description),
                is_secret = COALESCE(EXCLUDED.is_secret, configs.is_secret),
                updated_at = NOW()
        """, (key, value, description, is_secret))
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error setting config {key}: {e}")
        return False


def hash_password(password: str) -> str:
    """Hash un mot de passe avec SHA-256."""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_credentials(username: str, password: str) -> bool:
    """Vérifier les credentials admin depuis la base de données."""
    stored_username = get_config_value('admin_username')
    stored_password_hash = get_config_value('admin_password_hash')

    # Si pas de config en DB, utiliser les valeurs par défaut de l'environnement
    if not stored_username or not stored_password_hash:
        default_username = os.getenv('ADMIN_USERNAME', 'admin')
        default_password = os.getenv('ADMIN_PASSWORD', 'admin')
        return username == default_username and password == default_password

    # Vérifier avec les valeurs stockées
    password_hash = hash_password(password)
    return username == stored_username and password_hash == stored_password_hash


def render_login_page(error: str = None):
    """Afficher la page de login."""
    return render_template_string(LOGIN_TEMPLATE, error=error)


def require_auth(f):
    """
    Décorateur pour protéger une route Flask avec authentification.
    Affiche un formulaire de login si l'utilisateur n'est pas authentifié.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        # Vérifier si déjà authentifié
        if session.get('authenticated'):
            return f(*args, **kwargs)

        # Traiter la soumission du formulaire de login
        if request.method == 'POST' and 'username' in request.form:
            username = request.form.get('username', '')
            password = request.form.get('password', '')

            if verify_credentials(username, password):
                session['authenticated'] = True
                session['admin_username'] = username
                return redirect(request.url)
            else:
                return render_login_page(error="Identifiants incorrects")

        # Afficher le formulaire de login
        return render_login_page()

    return decorated


def logout():
    """Déconnecter l'utilisateur."""
    session.pop('authenticated', None)
    session.pop('admin_username', None)


def init_default_admin():
    """
    Initialiser les credentials admin par défaut s'ils n'existent pas.
    Utilise les variables d'environnement ADMIN_USERNAME et ADMIN_PASSWORD.
    """
    if not get_config_value('admin_username'):
        username = os.getenv('ADMIN_USERNAME', 'admin')
        password = os.getenv('ADMIN_PASSWORD', 'admin')

        set_config_value('admin_username', username, 'Admin username', is_secret=False)
        set_config_value('admin_password_hash', hash_password(password), 'Admin password hash', is_secret=True)
        print(f"Default admin credentials initialized (username: {username})")


def ensure_configs_table():
    """Créer la table configs si elle n'existe pas."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS configs (
                id SERIAL PRIMARY KEY,
                key VARCHAR(100) UNIQUE NOT NULL,
                value TEXT NOT NULL,
                description VARCHAR(255),
                is_secret BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS ix_configs_key ON configs(key);
        """)
        conn.commit()
        cur.close()
        conn.close()
        print("Configs table ensured")
        return True
    except Exception as e:
        print(f"Error creating configs table: {e}")
        return False
