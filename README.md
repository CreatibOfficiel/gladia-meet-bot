# 🤖 Vexa Bot - Projet Complet Dockerisé

**Projet de transcription automatique pour Google Meet utilisant l'API Gladia - Version complète et organisée**

## 🎯 **Vue d'ensemble**

Ce dossier contient **tout ce qui est nécessaire** pour déployer et utiliser le système Vexa Bot avec transcription Gladia. L'architecture est **100% dockerisée** et prête pour la production.

## 📁 **Structure du projet**

```
vexa-bot-complete/
├── vexa/                    # Architecture Vexa existante
│   ├── docker-compose.yml   # Services principaux
│   └── services/
│       ├── api-gateway/     # API Gateway
│       ├── bot-manager/     # Gestionnaire de bots
│       ├── vexa-bot/        # Bot principal
├── services/                # Nouveaux services dockerisés
│   ├── bot-launcher/        # Interface web pour lancer des bots (Port 8081)
│   ├── log-monitor/         # Monitoring des logs en temps réel (Port 8082)
│   └── transcript-retriever/ # Récupération des transcriptions (Port 8083)
├── scripts/                 # Scripts utilitaires
│   └── test_gladia_final_results.py
├── docker-compose.yml       # Compose principal (tous services)
├── docker-compose.test.yml  # Compose de test (nouveaux services uniquement)
├── README.md               # Ce fichier
├── DEPLOYMENT_GUIDE.md     # Guide de déploiement détaillé
├── CLEANUP_PLAN.md         # Plan de nettoyage et organisation
├── env.gladia.example      # Fichier d'environnement exemple
└── gladia_api_key.txt      # Clé API Gladia (à configurer)
```

## 🚀 **Démarrage rapide**

### **Option 1 : Démarrage automatisé (Recommandé)**

```bash
# Cloner le projet
git clone <repository-url>
cd vexa-bot-complete

# Démarrer avec initialisation automatique
./start.sh
```

Le script `start.sh` fait automatiquement :

- ✅ Création du fichier `.env` depuis `env.example`
- ✅ Démarrage de tous les services Docker
- ✅ Initialisation de la base de données
- ✅ Création d'un utilisateur par défaut (`admin@vexa.com`)
- ✅ Génération d'un token API et mise à jour du `.env`
- ✅ Redémarrage des services avec le nouveau token

### **Option 2 : Démarrage manuel**

```bash
# 1. Prérequis
# - Docker Desktop installé et en cours d'exécution
# - Au moins 8GB de RAM disponible
# - Clé API Gladia valide

# 2. Configuration
cp env.example .env
# Éditer .env et configurer GLADIA_API_KEY

# 3. Démarrage complet
docker-compose up -d

# 4. Initialiser la base de données
docker-compose exec admin-api python app/scripts/recreate_db.py
# Répondre "recreate" quand demandé

# 5. Créer un utilisateur et token API
curl -X POST http://localhost:8056/admin/users \
  -H "X-Admin-API-Key: token" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@vexa.com","name":"Admin","max_concurrent_bots":5}'

curl -X POST http://localhost:8056/admin/users/1/tokens \
  -H "X-Admin-API-Key: token" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### **🧪 Tester l'installation**

```bash
./test_installation.sh
```

Ce script vérifie que tous les services fonctionnent correctement.

### **🔧 Configuration centralisée**

```bash
# Option 1: Démarrage complet (tous les services)
docker-compose up -d

# Option 2: Démarrage des nouveaux services uniquement (pour test)
docker-compose -f docker-compose.test.yml up -d
```

### **📋 Interfaces disponibles**

| Service                  | URL                   | Port | Description                       |
| ------------------------ | --------------------- | ---- | --------------------------------- |
| **Bot Launcher**         | http://localhost:8081 | 8081 | Interface pour lancer des bots    |
| **Log Monitor**          | http://localhost:8082 | 8082 | Monitoring des logs en temps réel |
| **Transcript Retriever** | http://localhost:8083 | 8083 | Récupération des transcriptions   |
| **API Gateway**          | http://localhost:8056 | 8056 | API REST principale               |
| **Admin API**            | http://localhost:8057 | 8057 | API d'administration              |
| **Traefik Dashboard**    | http://localhost:8085 | 8085 | Dashboard de routage              |

## 🎯 **Fonctionnalités principales**

### **✅ Transcription en temps réel**

- **Intégration Gladia** : Connexion WebSocket directe à l'API Gladia
- **Détection automatique de langue** : Support du code-switching et auto-détection
- **Traitement audio avancé** :
  - Mélange de plusieurs flux audio simultanés
  - Conversion PCM 16-bit optimisée
  - Re-échantillonnage à 16kHz
- **Transcription partielle et finale** : Affichage en temps réel des résultats
- **Horodatage relatif** : Synchronisation précise avec l'audio

### **✅ Détection automatique de fin de meeting**

- **Détection de participants** : Le bot quitte après 10 secondes s'il est seul
- **Monitoring continu** : Vérification toutes les 5 secondes du nombre de participants
- **Détection de déconnexion** : Le bot détecte automatiquement si la page se ferme ou devient cachée
- **Gestion des timeouts** : Timeout de 2 minutes pour l'admission en salle d'attente
- **Détection d'activité vocale** : Surveillance en temps réel des participants qui parlent
- **Gestion des reconnexions** : Reconnexion automatique du WebSocket en cas de déconnexion
- **Détection des locuteurs** :
  - Identification automatique des participants qui parlent
  - Envoi d'événements SPEAKER_START/SPEAKER_END
  - Extraction automatique des noms des participants
- **Monitoring DOM** : Observation des changements d'interface pour détecter les nouveaux participants
- **Webhook n8n** : Envoi automatique d'un webhook à n8n quand un bot quitte un meeting

### **✅ Interface web moderne**

- **Bot Launcher** : Interface intuitive pour lancer des bots
- **Log Monitor** : Monitoring en temps réel des logs
- **Transcript Retriever** : Récupération et visualisation des transcriptions

### **✅ Architecture scalable**

- **Services indépendants** : Chaque service peut être mis à l'échelle
- **Réseau Docker** : Communication sécurisée entre services
- **Monitoring intégré** : Logs et métriques en temps réel

## 📖 **Utilisation**

### **1. Lancer un bot**

1. Ouvrir http://localhost:8081
2. Saisir l'ID du meeting Google Meet (ex: `cia-spqx-acb`)
3. Choisir la langue et le nom du bot
4. Cliquer sur "🚀 Launch Bot"

### **2. Monitorer les logs**

1. Ouvrir http://localhost:8082
2. Le monitoring démarre automatiquement
3. Observer les logs des bots et Redis en temps réel

### **3. Récupérer une transcription**

1. Ouvrir http://localhost:8083
2. Saisir l'ID du meeting et optionnellement la session ID
3. Cliquer sur "🔍 Retrieve Transcript"

## 🔧 **Configuration avancée**

### **Variables d'environnement importantes**

```bash
# API Keys
GLADIA_API_KEY=your_gladia_api_key
API_KEY=your_vexa_api_key

# URLs des services
API_GATEWAY_URL=http://api-gateway:8080
REDIS_URL=redis://redis:6379

# Configuration webhook n8n (optionnel)
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/vexa-bot-exit
```

## 📊 **Monitoring et logs**

### **Logs des services**

```bash
# Logs du bot launcher
docker-compose logs -f bot-launcher

# Logs du log monitor
docker-compose logs -f log-monitor

# Logs du transcript retriever
docker-compose logs -f transcript-retriever

# Logs des services Vexa
cd vexa && docker-compose logs -f bot-manager
```

### **Statut des conteneurs**

```bash
# Voir tous les conteneurs actifs
docker-compose ps

# Voir les ressources utilisées
docker stats
```

## 🛠️ **Développement**

### **Ajouter un nouveau service**

1. Créer le dossier dans `services/`
2. Ajouter `Dockerfile`, `requirements.txt`, `app.py`
3. Configurer dans `docker-compose.yml`
4. Documenter dans ce README

### **Tests**

```bash
# Test des nouveaux services
docker-compose -f docker-compose.test.yml up -d

# Test complet
docker-compose up -d

# Vérification des logs
docker-compose logs -f
```

## 🔍 **Dépannage**

### **Problèmes courants**

**Bot ne se lance pas :**

```bash
# Vérifier les logs du bot manager
docker-compose logs bot-manager

# Vérifier la clé API Gladia
echo $GLADIA_API_KEY
```

**Pas de transcription :**

```bash
# Vérifier les logs du bot
docker-compose logs vexa-bot-*

# Vérifier la connexion à Gladia
curl -H "X-GLADIA-KEY: $GLADIA_API_KEY" https://api.gladia.io/v2/live
```

**Services ne démarrent pas :**

```bash
# Reconstruire les images
docker-compose build --no-cache

# Redémarrer tous les services
docker-compose down && docker-compose up -d
```

## 📈 **Performance**

### **Ressources recommandées**

- **CPU** : 4 cores minimum
- **RAM** : 8GB minimum
- **Stockage** : 20GB minimum

### **Optimisations**

- Utiliser des volumes Docker pour la persistance
- Configurer des limites de ressources
- Monitorer l'utilisation avec `docker stats`

## 🧹 **Nettoyage**

### **Arrêt complet**

```bash
# Arrêter tous les services
docker-compose down

# Nettoyer les images non utilisées
docker image prune -f
```

### **Nettoyage complet**

```bash
# Arrêter et supprimer tous les conteneurs
docker-compose down -v

# Supprimer toutes les images
docker system prune -a -f
```

## 📄 **Documentation**

- **DEPLOYMENT_GUIDE.md** : Guide de déploiement détaillé
- **CLEANUP_PLAN.md** : Plan de nettoyage et organisation
- **README.md** : Documentation principale

## 🆘 **Support**

En cas de problème :

1. Consulter la documentation
2. Vérifier les logs des services
3. Consulter le guide de dépannage
4. Ouvrir une issue sur GitHub

---

## 🎉 **Résultat final**

**Votre projet Vexa Bot est maintenant :**

- ✅ **100% dockerisé** et prêt pour la production
- ✅ **Architecture moderne** avec interfaces web
- ✅ **Détection automatique** de fin de meeting
- ✅ **Documentation complète** pour le déploiement
- ✅ **Migration vers Gladia** entièrement réussie

**Félicitations ! Vous avez maintenant une architecture complète, moderne et scalable pour la transcription automatique de Google Meet ! 🚀**
