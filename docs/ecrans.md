# Écrans de SS CAR FLEET

| Écran | Adresse | Ce qu'on y fait |
| --- | --- | --- |
| Accueil | `/` | 5 compteurs cliquables (départs, retours, retards, alertes, amendes), départs du jour avec voyants, retours, alertes |
| Planning | `/planning` | 14 jours par véhicule, jauge de remplissage, case vide = nouvelle location |
| Locations | `/locations` | Listes filtrées, nouvelle réservation, fiche : contrat signé, facture, caution, prolonger, changer de voiture, historique |
| État des lieux | `/locations/[id]/edl/depart` et `/retour` | 11 photos guidées, km, carburant, checklist, dommages, signature, GPS, PDF |
| Comparaison | `/locations/[id]/comparaison` | Départ à gauche, retour à droite, filtre dommages, décision sur la caution |
| Véhicules | `/vehicules` | Liste, fiche avec rentabilité, papiers et échéances, dommages, entretien, attestation fourrière |
| Clients | `/clients` | Liste avec nombre de locations, fiche avec scans permis / identité, liste noire |
| Amendes | `/amendes` | Saisie d'un avis, conducteur retrouvé par la location, compte à rebours, statuts |
| Entretien | `/entretiens` | Véhicules en maintenance, démarrer / terminer |
| Réglages | `/parametres` | Société, TVA, conditions générales, logo, tampon, Kbis, pièce d'identité et signature du gérant |
| Exports | `/export/[liste]` | CSV pour Excel de chaque liste |

Les PDF (contrat, facture, état des lieux, relevé de dommages, bon de pouvoir fourrière) sont fabriqués dans le navigateur ;
sur téléphone ils s'ouvrent dans le partage (WhatsApp).

À venir (besoin d'un traceur ou d'un partenaire) : position et coupure moteur, anomalies GPS, conduite à risque,
lecture automatique des papiers, assistant IA, amendes automatiques, ajout d'employés.
