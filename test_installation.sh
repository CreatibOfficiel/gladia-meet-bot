#!/bin/bash

# Vexa Bot Complete - Installation Test Script
# ============================================

set -e

echo "🧪 Testing Vexa Bot Complete installation..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Test 1: Check if services are running
print_info "Test 1: Checking if all services are running..."
SERVICES=("postgres" "redis" "api-gateway" "admin-api" "bot-manager" "bot-launcher" "log-monitor" "transcript-retriever" "traefik")

ALL_RUNNING=true
for service in "${SERVICES[@]}"; do
    if docker compose ps | grep -q "$service.*Up"; then
        print_success "$service is running"
    else
        print_error "$service is not running"
        ALL_RUNNING=false
    fi
done

if [ "$ALL_RUNNING" = false ]; then
    print_error "Some services are not running. Please run './start.sh' first."
    exit 1
fi

print_success "All services are running!"
echo ""

# Test 2: Check database connectivity
print_info "Test 2: Testing database connectivity..."
if docker compose exec -T postgres pg_isready -U postgres -d vexa -q; then
    print_success "Database is accessible"
else
    print_error "Database is not accessible"
    exit 1
fi
echo ""

# Test 3: Check API Gateway
print_info "Test 3: Testing API Gateway..."
if curl -s http://localhost:8056/health > /dev/null 2>&1; then
    print_success "API Gateway is responding"
else
    print_warning "API Gateway health check failed, but continuing..."
fi
echo ""

# Test 4: Check Admin API
print_info "Test 4: Testing Admin API..."
if curl -s http://localhost:8057/docs > /dev/null 2>&1; then
    print_success "Admin API is accessible"
else
    print_error "Admin API is not accessible"
    exit 1
fi
echo ""

# Test 5: Check Bot Launcher
print_info "Test 5: Testing Bot Launcher..."
if curl -s http://localhost:8081 > /dev/null 2>&1; then
    print_success "Bot Launcher is accessible"
else
    print_error "Bot Launcher is not accessible"
    exit 1
fi
echo ""

# Test 6: Check if default user exists
print_info "Test 6: Checking if default user exists..."
USER_RESPONSE=$(curl -s -X GET "http://localhost:8056/admin/users" \
    -H "X-Admin-API-Key: token" \
    -H "Content-Type: application/json")

if echo "$USER_RESPONSE" | grep -q "admin@vexa.com"; then
    print_success "Default user exists"
else
    print_warning "Default user not found. You may need to run './start.sh' again."
fi
echo ""

# Test 7: Test bot launch functionality
print_info "Test 7: Testing bot launch functionality..."
LAUNCH_RESPONSE=$(curl -s -X POST http://localhost:8081/launch \
    -H "Content-Type: application/json" \
    -d '{"platform":"google_meet","native_meeting_id":"test-installation","bot_name":"TestInstallationBot"}')

if echo "$LAUNCH_RESPONSE" | grep -q "bot_container_id"; then
    print_success "Bot launch functionality works"
    
    # Get the meeting ID to clean up
    MEETING_ID=$(echo "$LAUNCH_RESPONSE" | grep -o '"id":[0-9]*' | grep -o '[0-9]*')
    
    # Stop the test bot
    print_info "Cleaning up test bot..."
    curl -s -X DELETE "http://localhost:8056/bots/test-installation" \
        -H "X-API-Key: $(grep API_KEY .env | cut -d'=' -f2)" > /dev/null 2>&1 || true
else
    print_error "Bot launch functionality failed"
    echo "Response: $LAUNCH_RESPONSE"
    exit 1
fi
echo ""

# Test 8: Check Redis connectivity
print_info "Test 8: Testing Redis connectivity..."
if docker compose exec -T redis redis-cli ping | grep -q "PONG"; then
    print_success "Redis is responding"
else
    print_error "Redis is not responding"
    exit 1
fi
echo ""

# Test 9: Check Traefik dashboard
print_info "Test 9: Testing Traefik dashboard..."
if curl -s http://localhost:8085 > /dev/null 2>&1; then
    print_success "Traefik dashboard is accessible"
else
    print_warning "Traefik dashboard is not accessible"
fi
echo ""

# Final summary
echo "🎉 Installation test completed!"
echo ""
print_success "All critical components are working correctly!"
echo ""
echo "📋 Available services:"
echo "  - Bot Launcher: http://localhost:8081"
echo "  - Log Monitor: http://localhost:8082"
echo "  - Transcript Retriever: http://localhost:8083"
echo "  - API Gateway: http://localhost:8056"
echo "  - Admin API: http://localhost:8057"
echo "  - Traefik Dashboard: http://localhost:8085"
echo ""
echo "🚀 Your Vexa Bot Complete installation is ready to use!" 