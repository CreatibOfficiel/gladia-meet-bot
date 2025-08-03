#!/usr/bin/env python3
"""
Script pour tester la récupération des résultats finaux de Gladia
"""
import requests
import json
import time

def get_gladia_final_results(session_id):
    """Récupère les résultats finaux d'une session Gladia"""
    api_key = "7a36b5ee-8402-4c4b-b1a4-3f9146748fb4"
    api_url = f"https://api.gladia.io/v2/live/{session_id}"
    
    headers = {
        "X-Gladia-Key": api_key,
    }
    
    try:
        print(f"📡 Récupération des résultats finaux pour la session: {session_id}")
        response = requests.get(api_url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Résultats récupérés avec succès!")
            print(f"📊 Données: {json.dumps(result, indent=2)}")
            return result
        else:
            print(f"❌ Erreur API: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return None

def stop_gladia_session(session_id):
    """Arrête une session Gladia en envoyant stop_recording"""
    api_key = "7a36b5ee-8402-4c4b-b1a4-3f9146748fb4"
    api_url = f"https://api.gladia.io/v2/live/{session_id}/stop"
    
    headers = {
        "X-Gladia-Key": api_key,
    }
    
    try:
        print(f"🛑 Arrêt de la session: {session_id}")
        response = requests.post(api_url, headers=headers, timeout=10)
        
        if response.status_code in [200, 201]:
            print("✅ Session arrêtée avec succès!")
            return True
        else:
            print(f"❌ Erreur lors de l'arrêt: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False

if __name__ == "__main__":
    # Session ID du bot actuel (à récupérer depuis les logs)
    session_id = "c5dded88-ea69-4702-8c3c-fa884b9c1765"
    
    print("🎯 Test de récupération des résultats finaux Gladia")
    print("=" * 50)
    
    # Option 1: Récupérer les résultats sans arrêter
    print("\n1️⃣ Récupération des résultats actuels...")
    result = get_gladia_final_results(session_id)
    
    if result:
        print("✅ Résultats disponibles!")
        
        # Afficher les transcriptions si disponibles
        if result.get("result") and result["result"].get("transcription", {}).get("utterances"):
            print("\n🎤 TRANSCRIPTIONS TROUVÉES:")
            for utterance in result["result"]["transcription"]["utterances"]:
                print(f"   • {utterance.get('text', '')}")
        else:
            print("❌ Pas de transcriptions dans les résultats (session en cours de traitement)")
    else:
        print("❌ Pas de résultats disponibles ou session invalide")
    
    # Option 2: Arrêter la session et récupérer les résultats finaux
    print("\n2️⃣ Arrêt de la session et récupération des résultats finaux...")
    if stop_gladia_session(session_id):
        time.sleep(5)  # Attendre le traitement
        final_result = get_gladia_final_results(session_id)
        
        if final_result:
            print("🎉 Résultats finaux récupérés!")
            
            # Afficher les transcriptions finales
            if final_result.get("result") and final_result["result"].get("transcription", {}).get("utterances"):
                print("\n🎤 TRANSCRIPTIONS FINALES:")
                for utterance in final_result["result"]["transcription"]["utterances"]:
                    print(f"   • {utterance.get('text', '')}")
            else:
                print("❌ Pas de transcriptions finales")
        else:
            print("❌ Pas de résultats finaux disponibles") 