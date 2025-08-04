# 🚀 Guide de Déploiement - Vexa Bot Dockerisé

## 📋 **Prérequis**

- Docker Desktop installé et en cours d'exécution
- Au moins 8GB de RAM disponible
- Clé API Gladia valide

## 🔧 **Installation**

### **1. Cloner le projet**

```bash
git clone <repository-url>
cd gladia-gmeet-bot
```

### **2. Configuration de l'environnement**

```bash
# Copier le fichier d'environnement
cp env.gladia.example .env

# Éditer les variables d'environnement
nano .env
```

**Variables obligatoires :**

```bash
GLADIA_API_KEY=your_gladia_api_key_here
API_KEY=to_be_generate
```

**Variables optionnelles :**

```bash
# Configuration webhook n8n (optionnel)
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/vexa-bot-exit
```

### **3. Démarrer l'architecture Vexa existante**

```bash
# Aller dans le dossier vexa
cd vexa

# Démarrer les services principaux
docker-compose up -d

# Vérifier que tous les services sont actifs
docker-compose ps

# Revenir au dossier racine
cd ..
```

### **4. Construire et démarrer les nouveaux services**

```bash
# Construire les images des nouveaux services
docker-compose -f docker-compose.test.yml build

# Démarrer les nouveaux services
docker-compose -f docker-compose.test.yml up -d

# Vérifier le statut
docker-compose -f docker-compose.test.yml ps
```

## 🌐 **Accès aux interfaces**

Une fois tous les services démarrés, vous pouvez accéder aux interfaces suivantes :

| Service                  | URL                    | Port  | Description                       |
| ------------------------ | ---------------------- | ----- | --------------------------------- |
| **Bot Launcher**         | http://localhost:8081  | 8081  | Interface pour lancer des bots    |
| **Log Monitor**          | http://localhost:8082  | 8082  | Monitoring des logs en temps réel |
| **Transcript Retriever** | http://localhost:8083  | 8083  | Récupération des transcriptions   |
| **API Gateway**          | http://localhost:18056 | 18056 | API REST principale               |

## 🧪 **Test de l'installation**

### **1. Test du Bot Launcher**

1. Ouvrir http://localhost:8081
2. Saisir un ID de meeting Google Meet (ex: `test-meeting-123`)
3. Cliquer sur "🚀 Launch Bot"
4. Vérifier que le bot se lance correctement

### **4. Test du webhook n8n (optionnel)**

Si vous avez configuré `N8N_WEBHOOK_URL` :

1. Lancer un bot et l'arrêter
2. Vérifier que le webhook est envoyé à n8n
3. Les données envoyées incluent : `meeting_id`, `platform`, `native_meeting_id`, `user_id`, `status`, `start_time`, `end_time`

### **2. Test du Log Monitor**

1. Ouvrir http://localhost:8082
2. Vérifier que le monitoring démarre automatiquement
3. Observer les logs des bots et Redis

### **3. Test du Transcript Retriever**

1. Ouvrir http://localhost:8083
2. Saisir l'ID du meeting testé précédemment
3. Cliquer sur "🔍 Retrieve Transcript"

## 🔍 **Vérification des logs**

### **Logs des nouveaux services**

```bash
# Logs du bot launcher
docker-compose -f docker-compose.test.yml logs -f bot-launcher

# Logs du log monitor
docker-compose -f docker-compose.test.yml logs -f log-monitor

# Logs du transcript retriever
docker-compose -f docker-compose.test.yml logs -f transcript-retriever
```

### **Logs des services Vexa**

```bash
cd vexa
docker-compose logs -f bot-manager
docker-compose logs -f api-gateway
```

## 🛠️ **Dépannage**

### **Problèmes courants**

**1. Services ne démarrent pas**

```bash
# Vérifier les logs
docker-compose -f docker-compose.test.yml logs

# Reconstruire les images
docker-compose -f docker-compose.test.yml build --no-cache

# Redémarrer
docker-compose -f docker-compose.test.yml down
docker-compose -f docker-compose.test.yml up -d
```

**2. Erreur de connexion à l'API Gateway**

```bash
# Vérifier que l'API Gateway est actif
cd vexa && docker-compose ps

# Vérifier les logs
docker-compose logs api-gateway
```

**3. Erreur de connexion à Redis**

```bash
# Vérifier que Redis est actif
cd vexa && docker-compose ps redis

# Tester la connexion
docker exec -it vexa_dev-redis-1 redis-cli ping
```

**4. Problème de ports**

```bash
# Vérifier les ports utilisés
netstat -tulpn | grep :808

# Arrêter les services qui utilisent les ports
docker-compose -f docker-compose.test.yml down
```

## 📊 **Monitoring**

### **Statut des conteneurs**

```bash
# Voir tous les conteneurs actifs
docker ps

# Voir les ressources utilisées
docker stats
```

### **Utilisation des ressources**

```bash
# Vérifier l'utilisation CPU et RAM
docker stats --no-stream

# Vérifier l'espace disque
docker system df
```

## 🔄 **Mise à jour**

### **Mise à jour du code**

```bash
# Arrêter les services
docker-compose -f docker-compose.test.yml down

# Reconstruire les images
docker-compose -f docker-compose.test.yml build --no-cache

# Redémarrer
docker-compose -f docker-compose.test.yml up -d
```

### **Mise à jour des variables d'environnement**

```bash
# Éditer le fichier .env
nano .env

# Redémarrer les services
docker-compose -f docker-compose.test.yml restart
```

## 🧹 **Nettoyage**

### **Arrêt complet**

```bash
# Arrêter les nouveaux services
docker-compose -f docker-compose.test.yml down

# Arrêter les services Vexa
cd vexa && docker-compose down

# Nettoyer les images non utilisées
docker image prune -f
```

### **Nettoyage complet**

```bash
# Arrêter et supprimer tous les conteneurs
docker-compose -f docker-compose.test.yml down -v
cd vexa && docker-compose down -v

# Supprimer toutes les images
docker system prune -a -f
```

## 📈 **Performance**

### **Optimisations recommandées**

```bash
# Limiter les ressources des conteneurs
# Ajouter dans docker-compose.test.yml :
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 1G
    reservations:
      cpus: '0.5'
      memory: 512M
```

### **Monitoring avancé**

```bash
# Installer Prometheus et Grafana pour le monitoring
# (Configuration à ajouter selon les besoins)
```

## 🆘 **Support**

En cas de problème :

1. Consulter les logs des services
2. Vérifier la configuration dans `.env`
3. Tester la connectivité réseau
4. Ouvrir une issue sur GitHub avec les logs d'erreur

---

**🎉 Déploiement réussi ! Votre architecture Vexa Bot est maintenant 100% dockerisée !**
