# Transcript Feature - Work In Progress

## Résumé de la session

### Ce qui fonctionne
- Détection du type de page (recherche vs vidéo)
- Extraction de `ytInitialPlayerResponse` depuis les scripts de la page
- Récupération de l'URL des sous-titres (`captionTracks`)
- UI avec toggle timestamps et bouton copier

### Problème principal
**L'API timedtext de YouTube retourne des réponses vides (200 OK, 0 bytes)**

Même avec :
- fetch() depuis le content script
- XMLHttpRequest avec credentials
- Script injecté dans le contexte de la page (inject.js)

La requête vers `https://www.youtube.com/api/timedtext?...` retourne toujours vide.

### Causes possibles
1. **Ad-blocker** bloquant les requêtes (beaucoup de `ERR_BLOCKED_BY_CLIENT` dans la console)
2. **Signature invalide** quand on modifie l'URL
3. **YouTube bloque les extensions** pour cette API spécifique
4. **Sous-titres ASR** (auto-générés) pas accessibles via l'API

### Approches testées
1. ❌ fetch() depuis content script
2. ❌ XMLHttpRequest avec credentials
3. ❌ Injection de script inline (bloqué par CSP)
4. ❌ Injection de script externe via web_accessible_resources
5. ⚠️ Scraping du panel "Transcription" - clique sur le mauvais menu (playlist au lieu de vidéo)

### Prochaines étapes
1. Tester sans ad-blocker
2. Corriger le scraping du panel (trouver le bon bouton "..." de la vidéo, pas de la playlist)
3. Essayer avec une vidéo qui a de vrais sous-titres (pas ASR)
4. Potentiellement utiliser l'API YouTube Data v3 (nécessite clé API)

### Fichiers modifiés
- `manifest.json` - Ajout match pour `/watch*`, web_accessible_resources
- `content.js` - Logique transcript avec multiples fallbacks
- `inject.js` - Script injecté pour fetch depuis contexte page
- `popup.html` - UI transcript section
- `popup.js` - Logique UI transcript

### Pour tester
1. Désactiver l'ad-blocker sur YouTube
2. Aller sur une vidéo avec de vrais sous-titres (pas ASR)
3. Exemple : https://www.youtube.com/watch?v=8jPQjjsBbIc
