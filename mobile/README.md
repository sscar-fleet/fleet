# SS CAR FLEET — appli téléphone

Le logiciel en version terrain : seulement ce qui fait gagner du temps (aujourd'hui, départs, retours, états des lieux, amendes).
Même base Supabase que le site. Marche sans réseau (file d'attente sur le téléphone).

- `src/app/` : les écrans (Expo Router). Onglets : Aujourd'hui, Locations, Amendes, Plus.
- `src/lib/hors-ligne.ts` : cache et file d'attente hors ligne (SQLite).
- `src/lib/ia.ts` : appels à l'IA du site (papiers, avis d'amende, comparaison des photos, assistant).
- `src/lib/telematique.ts` : emplacement prêt pour les traceurs Seeworld / Teltonika.
- `src/lib/demo.ts` : données d'exemple (`EXPO_PUBLIC_DEMO=1`).

Démarrer : `npm install`, copier `.env.example` en `.env`, puis `npx expo start` et scanner le QR code avec Expo Go.
