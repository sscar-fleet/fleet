# Modèle de données — expliqué simplement

Chaque fiche appartient à une **agence** (le loueur). Un utilisateur ne voit que les fiches de son agence.

| Fiche | Ce qu'elle contient | Reliée à |
| --- | --- | --- |
| Agence | Nom, SIRET, gérant, Kbis, signature, tampon (pour l'attestation fourrière), 2 accès inclus | — |
| Utilisateur | Nom, rôle gérant ou employé | Agence |
| Véhicule | Immatriculation, marque, modèle, km, statut, prix/jour, carte grise, assurance, CT + échéances | Agence, traceur |
| Traceur | IMEI, SIM, fin d'abonnement | Agence |
| Client | Identité, téléphone, permis et pièce d'identité scannés, drapeau liste noire | Agence |
| Location | Dates, prix, forfait km (inclus, départ, retour, prix du km en plus), carburant, caution et son statut | Véhicule, client |
| État des lieux | Départ ou retour, statut, km, carburant, checklist, signature, position GPS, PDF | Location |
| Photo | Une des 10 positions guidées, le compteur, ou libre | État des lieux |
| Dommage | Type, gravité, zone, photo de zone + gros plan, statut ouvert/réparé | Véhicule, location |
| Amende | N° d'avis, date, lieu, montant, échéance, statut (à désigner → payée) | Véhicule, location, client |
| Entretien | Raison, garage, dates, coût, statut | Véhicule |
| Attestation fourrière | Personne autorisée (champ libre), fourrière, PDF | Véhicule |

Statuts utilisés :

- Véhicule : disponible, loué, maintenance, hors service
- Location : réservée, en cours, terminée, annulée
- Caution : à prendre, prise, rendue, encaissée, litige
- État des lieux : en attente, à comparer, terminé
- Amende : à désigner, infos manquantes, désignée, refusée, payée
