#!/bin/bash

# 🔒 Script de nettoyage Docker sécurisé
# Ce script nettoie Docker SANS supprimer les volumes de données critiques
# Version: 1.0
# Auteur: Système de protection des volumes

set -e  # Arrêter le script en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'affichage avec couleurs
print_step() {
    echo -e "${BLUE}🔧 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_danger() {
    echo -e "${RED}🚨 $1${NC}"
}

# En-tête du script
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}🧹 NETTOYAGE DOCKER SÉCURISÉ${NC}"
echo -e "${BLUE}🔒 Protection des volumes de données activée${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "docker-compose.yml" ]; then
    print_danger "ERREUR: docker-compose.yml non trouvé. Vous devez être dans le répertoire du projet."
    exit 1
fi

# Afficher l'espace disque avant nettoyage
print_step "Espace disque avant nettoyage :"
df -h | head -2
echo ""

print_step "État Docker avant nettoyage :"
docker system df
echo ""

# 1. Arrêter les containers
print_step "Arrêt des containers..."
docker compose down
print_success "Containers arrêtés"
echo ""

# 2. Lister les volumes protégés AVANT le nettoyage
print_warning "Volumes de données protégés (ne seront PAS supprimés) :"
docker volume ls | grep -E "(postgres-data|redis-data)" || echo "Aucun volume de données trouvé"
echo ""

# 3. Supprimer les containers arrêtés
print_step "Suppression des containers arrêtés..."
CONTAINERS_REMOVED=$(docker container prune -f 2>&1 | grep "Total reclaimed space" || echo "0 B")
print_success "Containers supprimés : $CONTAINERS_REMOVED"
echo ""

# 4. Supprimer les images non utilisées
print_step "Suppression des images non utilisées..."
IMAGES_REMOVED=$(docker image prune -a -f 2>&1 | grep "Total reclaimed space" || echo "0 B")
print_success "Images supprimées : $IMAGES_REMOVED"
echo ""

# 5. Supprimer les réseaux non utilisés  
print_step "Suppression des réseaux non utilisés..."
NETWORKS_REMOVED=$(docker network prune -f 2>&1 | grep "Total reclaimed space" || echo "0 B")
print_success "Réseaux supprimés : $NETWORKS_REMOVED"
echo ""

# 6. Supprimer le cache de build
print_step "Suppression du cache de build..."
BUILD_CACHE_REMOVED=$(docker builder prune -a -f 2>&1 | grep "Total reclaimed space" || echo "0 B")
print_success "Cache de build supprimé : $BUILD_CACHE_REMOVED"
echo ""

# 7. IMPORTANT: Vérifier que les volumes critiques sont toujours là
print_warning "VÉRIFICATION : Volumes de données après nettoyage :"
POSTGRES_VOLUME=$(docker volume ls | grep "postgres-data" || echo "")
REDIS_VOLUME=$(docker volume ls | grep "redis-data" || echo "")

if [ -n "$POSTGRES_VOLUME" ]; then
    print_success "✓ Volume PostgreSQL préservé : $POSTGRES_VOLUME"
else
    print_danger "✗ ATTENTION : Volume PostgreSQL introuvable !"
fi

if [ -n "$REDIS_VOLUME" ]; then
    print_success "✓ Volume Redis préservé : $REDIS_VOLUME"
else
    print_danger "✗ ATTENTION : Volume Redis introuvable !"
fi
echo ""

# 8. Redémarrer les services
print_step "Redémarrage des services..."
docker compose up -d
print_success "Services redémarrés"
echo ""

# 9. Afficher l'espace libéré
print_step "État final :"
docker system df
echo ""

print_step "Espace disque après nettoyage :"
df -h | head -2
echo ""

# 10. Résumé final
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}✅ NETTOYAGE TERMINÉ AVEC SUCCÈS${NC}"
echo -e "${GREEN}===========================================${NC}"
print_success "Containers supprimés : $CONTAINERS_REMOVED"
print_success "Images supprimées : $IMAGES_REMOVED" 
print_success "Réseaux supprimés : $NETWORKS_REMOVED"
print_success "Cache supprimé : $BUILD_CACHE_REMOVED"
echo ""

print_warning "VOLUMES DE DONNÉES PROTÉGÉS :"
docker volume ls | grep -E "(postgres-data|redis-data)" | while read line; do
    print_success "🔒 $line"
done
echo ""

print_danger "RAPPEL SÉCURITÉ :"
echo -e "${RED}🚨 Pour supprimer les volumes (DANGER - PERTE DE DONNÉES) :${NC}"
echo -e "${RED}   docker volume rm vexa-bot_postgres-data${NC}"
echo -e "${RED}   docker volume rm vexa-bot_redis-data${NC}"
echo ""

print_success "Utilisation recommandée : ./scripts/docker-cleanup-safe.sh"
print_success "Documentation : VOLUME_PROTECTION.md"
