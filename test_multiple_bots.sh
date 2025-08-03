#!/bin/bash

echo "🧪 Test du monitoring multi-bots"
echo "================================"

# Lancer plusieurs bots de test
echo "1. Lancement du premier bot..."
curl -X POST -H "Content-Type: application/json" \
  -d '{"native_meeting_id":"test-meeting-1","bot_name":"TestBot1","platform":"google_meet"}' \
  http://localhost:8081/launch

echo -e "\n2. Lancement du deuxième bot..."
sleep 2
curl -X POST -H "Content-Type: application/json" \
  -d '{"native_meeting_id":"test-meeting-2","bot_name":"TestBot2","platform":"google_meet"}' \
  http://localhost:8081/launch

echo -e "\n3. Lancement du troisième bot..."
sleep 2
curl -X POST -H "Content-Type: application/json" \
  -d '{"native_meeting_id":"test-meeting-3","bot_name":"TestBot3","platform":"google_meet"}' \
  http://localhost:8081/launch

echo -e "\n4. Vérification du statut des bots..."
sleep 3
curl -H "X-API-Key: kn3t26Tymei68sVOj59Rfp1ayTCl8F8bDEOHyFHm" http://localhost:8056/bots/status

echo -e "\n5. Test du monitoring multi-bots..."
curl http://localhost:8082/logs/bot

echo -e "\n✅ Test terminé !"
echo "📊 Allez sur http://localhost:8082 pour voir le monitoring multi-bots"
echo "🤖 Allez sur http://localhost:8081 pour lancer plus de bots" 