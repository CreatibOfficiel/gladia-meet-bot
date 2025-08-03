#!/bin/bash

# Vexa Bot Complete - Startup Script
# ===================================

set -e  # Exit on any error

echo "🚀 Starting Vexa Bot Complete..."

# Check if .env exists, if not create it from example
if [ ! -f .env ]; then
    echo "📝 Creating .env file from example..."
    cp env.example .env
    echo "✅ .env file created. Please review and update GLADIA_API_KEY if needed."
fi

# Start the services
echo "🐳 Starting Docker services..."
docker compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Initialize database if needed
echo "🗄️  Initializing database..."
docker compose exec -T admin-api python app/scripts/recreate_db.py <<< "recreate" || {
    echo "⚠️  Database initialization failed, but continuing..."
}

# Wait for database to be fully ready
echo "⏳ Waiting for database to be fully ready..."
sleep 5

# Create default user and API token if they don't exist
echo "👤 Setting up default user and API token..."
DEFAULT_USER_EMAIL="admin@vexa.com"
DEFAULT_USER_NAME="Vexa Admin"

# Check if user already exists
USER_EXISTS=$(curl -s -X GET "http://localhost:8056/admin/users" \
    -H "X-Admin-API-Key: token" \
    -H "Content-Type: application/json" | grep -o '"email":"admin@vexa.com"' || echo "")

if [ -z "$USER_EXISTS" ]; then
    echo "📝 Creating default user..."
    USER_RESPONSE=$(curl -s -X POST "http://localhost:8056/admin/users" \
        -H "X-Admin-API-Key: token" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$DEFAULT_USER_EMAIL\",\"name\":\"$DEFAULT_USER_NAME\",\"max_concurrent_bots\":5}")
    
    USER_ID=$(echo "$USER_RESPONSE" | grep -o '"id":[0-9]*' | grep -o '[0-9]*')
    
    if [ -n "$USER_ID" ]; then
        echo "✅ User created with ID: $USER_ID"
        
        # Create API token for the user
        echo "🔑 Creating API token..."
        TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8056/admin/users/$USER_ID/tokens" \
            -H "X-Admin-API-Key: token" \
            -H "Content-Type: application/json" \
            -d "{}")
        
        API_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        
        if [ -n "$API_TOKEN" ]; then
            echo "✅ API token created: $API_TOKEN"
            
            # Update .env file with the new API token
            sed -i.bak "s/API_KEY=.*/API_KEY=$API_TOKEN/" .env
            echo "📝 Updated .env file with new API token"
            
            # Restart services to pick up new token
            echo "🔄 Restarting services with new API token..."
            docker compose restart bot-launcher transcript-retriever
        else
            echo "⚠️  Failed to create API token"
        fi
    else
        echo "⚠️  Failed to create user"
    fi
else
    echo "ℹ️  Default user already exists"
fi

echo ""
echo "🎉 Vexa Bot Complete is ready!"
echo ""
echo "📋 Available services:"
echo "  - Bot Launcher: http://localhost:8081"
echo "  - Log Monitor: http://localhost:8082"
echo "  - Transcript Retriever: http://localhost:8083"
echo "  - API Gateway: http://localhost:8056"
echo "  - Admin API: http://localhost:8057"
echo "  - Traefik Dashboard: http://localhost:8085"
echo ""
echo "🚀 You can now launch bots via the Bot Launcher interface!" 