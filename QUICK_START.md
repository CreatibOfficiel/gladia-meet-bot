# 🚀 Guide de Démarrage Rapide - Vexa Bot Complete

## ⚡ **Démarrage en 3 étapes**

### **1. Configuration**

```bash
# Copier le fichier d'environnement
cp env.example .env

# Éditer et configurer votre clé API Gladia
nano .env
```

**Configuration optionnelle webhook n8n :**
```bash
# Ajouter dans .env pour recevoir des webhooks automatiques
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/vexa-bot-exit
```

### **2. Démarrage automatique**

```bash
# Utiliser le script de démarrage interactif
./start.sh
```

### **3. Accès aux interfaces**

- **Bot Launcher** : http://localhost:8081
- **Log Monitor** : http://localhost:8082
- **Transcript Retriever** : http://localhost:8083

## 🎯 **Utilisation rapide**

### **Lancer un bot**

1. Ouvrir http://localhost:8081
2. Saisir l'ID du meeting Google Meet
3. Cliquer sur "🚀 Launch Bot"

### **Monitorer les logs**

1. Ouvrir http://localhost:8082
2. Le monitoring démarre automatiquement

### **Récupérer une transcription**

1. Ouvrir http://localhost:8083
2. Saisir l'ID du meeting
3. Cliquer sur "🔍 Retrieve Transcript"

### **Webhook n8n automatique**

Si configuré, le système envoie automatiquement un webhook à n8n quand un bot quitte un meeting avec les données minimales nécessaires pour récupérer la transcription.

## 🔧 **Commandes utiles**

```bash
# Test de l'installation
./test_installation.sh

# Démarrage manuel
docker-compose -f docker-compose.test.yml up -d

# Arrêt
./stop.sh

# Logs
docker-compose -f docker-compose.test.yml logs -f

# Statut
docker-compose -f docker-compose.test.yml ps
```

## 📁 **Structure du projet**

```
vexa-bot-complete/
├── vexa/                    # Architecture Vexa existante
├── services/                # Nouveaux services dockerisés
│   ├── bot-launcher/        # Interface web (Port 8081)
│   ├── log-monitor/         # Monitoring (Port 8082)
│   └── transcript-retriever/ # Récupération (Port 8083)
├── scripts/                 # Scripts utilitaires
├── start.sh                 # Script de démarrage
├── stop.sh                  # Script d'arrêt
├── test_installation.sh     # Script de test
└── README.md               # Documentation complète
```
