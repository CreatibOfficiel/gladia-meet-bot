# 📜 Scripts Utilitaires

Ce dossier contient les scripts utilitaires pour le projet Vexa Bot.

## 📁 Contenu

### `test_gladia_final_results.py`

Script de test pour récupérer les résultats finaux de l'API Gladia.

**Utilisation :**

```bash
python3 test_gladia_final_results.py
```

**Fonctionnalités :**

- Récupération des résultats finaux d'une session Gladia
- Affichage des transcriptions et utterances
- Test de l'API Gladia

## 🔧 Configuration

Assurez-vous que les variables d'environnement suivantes sont configurées :

- `GLADIA_API_KEY` : Clé API Gladia

## 📝 Notes

Ces scripts sont destinés aux tests et au développement. Pour la production, utilisez les services dockerisés dans le dossier `services/`.
