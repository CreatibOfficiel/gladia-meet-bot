#!/bin/bash

echo "🛑 Arrêt Vexa Bot Complete"
echo "=========================="

# Couleurs pour l'affichage
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Demander le mode d'arrêt
echo ""
echo "Choisissez le mode d'arrêt :"
echo "1) Arrêt simple (garder les données)"
echo "2) Arrêt complet (supprimer les conteneurs)"
echo "3) Nettoyage complet (supprimer tout)"
echo ""
read -p "Votre choix (1-3) : " choice

case $choice in
    1)
        print_info "Arrêt simple des services..."
        # Arrêter les services de test
        if docker-compose -f docker-compose.test.yml ps | grep -q "Up"; then
            docker-compose -f docker-compose.test.yml down
            print_success "Services de test arrêtés"
        fi
        
        # Arrêter les services complets
        if docker-compose ps | grep -q "Up"; then
            docker-compose down
            print_success "Services complets arrêtés"
        fi
        ;;
    2)
        print_info "Arrêt complet des services..."
        # Arrêter et supprimer les conteneurs de test
        if docker-compose -f docker-compose.test.yml ps | grep -q "Up"; then
            docker-compose -f docker-compose.test.yml down
            print_success "Conteneurs de test supprimés"
        fi
        
        # Arrêter et supprimer les conteneurs complets
        if docker-compose ps | grep -q "Up"; then
            docker-compose down
            print_success "Conteneurs complets supprimés"
        fi
        ;;
    3)
        print_warning "Nettoyage complet - ATTENTION : toutes les données seront supprimées !"
        read -p "Êtes-vous sûr ? (y/N) : " confirm
        if [[ $confirm =~ ^[Yy]$ ]]; then
            print_info "Nettoyage complet en cours..."
            
            # Arrêter et supprimer tout
            docker-compose -f docker-compose.test.yml down -v 2>/dev/null
            docker-compose down -v 2>/dev/null
            
            # Supprimer les images
            docker image prune -f
            
            # Supprimer les volumes non utilisés
            docker volume prune -f
            
            # Supprimer les réseaux non utilisés
            docker network prune -f
            
            print_success "Nettoyage complet terminé"
        else
            print_info "Nettoyage annulé"
            exit 0
        fi
        ;;
    *)
        print_error "Choix invalide. Arrêt simple par défaut."
        docker-compose -f docker-compose.test.yml down 2>/dev/null
        docker-compose down 2>/dev/null
        ;;
esac

print_success "Arrêt terminé !"
echo ""
echo "📋 Services arrêtés :"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 Bot Launcher        : Arrêté"
echo "📊 Log Monitor         : Arrêté"
echo "📝 Transcript Retriever: Arrêté"
echo "🔗 API Gateway         : Arrêté"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

print_success "✨ Vexa Bot Complete est arrêté !" 