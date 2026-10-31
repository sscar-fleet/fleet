# Appli SS CAR FLEET 1.0.1 — à envoyer à Apple APRÈS l'acceptation de la 1.0

## Ce qui change
- Photos des modèles (trois quarts avant, sans fond, dans la couleur du véhicule) à la place des logos :
  Aujourd'hui, Flotte, Véhicules, fiche véhicule, location, changement de voiture, nouvelle location, stock.
  Mêmes règles que le site : icône pour les véhicules de plus de 15 ans ou réglés sur « Icône », logo si le modèle est inconnu.
  La clé Car Image reste sur le serveur ; l'appli affiche /api/visuel avec le jeton du loueur.
- Mise à jour à distance (expo-updates) : les prochaines retouches d'affichage arriveront sur les téléphones
  sans repasser par Apple (`eas update --channel production`).

- Suppression du compte depuis l'appli (Mon compte > « Supprimer mon compte ») : exigence Apple (règle 5.1.1 v).
  Employé : supprimé tout de suite. Gérant : demande signalée dans l'admin Fleet, faite sous 7 jours.

## Fichiers
- Nouveaux : src/lib/visuel.ts, src/composants/VisuelVehicule.tsx
- Modifiés : src/lib/donnees.ts, src/app/(onglets)/index.tsx, src/app/(onglets)/flotte.tsx, src/app/vehicules.tsx,
  src/app/vehicule/[id].tsx, src/app/location/[id].tsx, src/app/nouvelle.tsx, src/app/stock.tsx, src/app/compte.tsx
- Réglages : package.json (expo-updates), eas.json (channel production)

## app.json (à modifier à la main sur le Mac, ne pas écraser le fichier)
- "version": "1.0.1"
- ajouter dans "expo" :
  "runtimeVersion": { "policy": "appVersion" },
  "updates": { "url": "https://u.expo.dev/e429f033-ea19-45f7-989f-bb4031bb043f", "checkAutomatically": "ON_LOAD", "fallbackToCacheTimeout": 0 }

## Sur le Mac
1. npx expo install expo-updates
2. eas build --platform ios --profile production
3. eas submit --platform ios --profile production
