// Codes d'alerte officiels WhatsGPS (liste transmise par Seeworld le 22/10/2026), traduits en français.
export const CODES_ALARME: Record<number, string> = {
  0: 'Alerte inconnue', 1: 'Vibration détectée', 2: 'Alimentation coupée', 3: 'Batterie faible', 4: 'SOS',
  5: 'Excès de vitesse', 7: 'Véhicule déplacé', 9: 'Sortie de zone autorisée', 10: 'Boîtier démonté',
  12: 'Capteur magnétique', 14: 'Alerte Bluetooth', 15: 'Brouillage du signal', 16: 'Fausse antenne relais (brouilleur)',
  20: 'Portière ouverte', 21: 'Conduite trop longue', 24: 'Arrêt prolongé', 25: 'Boîtier hors ligne',
  28: 'Entrée dans une zone', 29: 'Sortie d’une zone', 30: 'Vol de carburant', 31: 'Contact mis', 32: 'Contact coupé',
  33: 'Choc', 34: 'Arrivée en retard', 35: 'Départ en avance', 37: 'Inclinaison du véhicule',
  40: 'Température élevée', 45: 'Température basse', 50: 'Surtension', 55: 'Tension faible', 60: 'Stationnement',
  70: 'Accélération brutale', 71: 'Freinage brutal', 72: 'Virage brusque', 73: 'Sortie d’itinéraire',
  74: 'Excès de vitesse sur l’itinéraire', 75: 'Stationnement trop long', 76: 'Alerte vocale',
  77: 'Boîtier débranché', 78: 'Boîtier rebranché', 79: 'Remorquage', 80: 'Téléphone au volant', 81: 'Cigarette au volant',
  82: 'Conducteur distrait', 83: 'Comportement anormal du conducteur', 85: 'Sortie de voie', 86: 'Distance de sécurité',
  87: 'Perte du signal vidéo', 88: 'Caméra masquée', 89: 'Panne de stockage', 90: 'Fatigue du conducteur',
  91: 'Risque de collision', 92: 'Climatisation allumée', 93: 'Climatisation éteinte', 94: 'Portière ouverte',
  95: 'Portière fermée', 96: 'Ceinture non attachée', 97: 'Moteur au ralenti', 98: 'Bluetooth déconnecté',
  99: 'Appel à l’aide', 100: 'Passage d’une zone', 101: 'Conduite en horaire interdit', 103: 'Sortie d’une zone',
  104: 'Entrée dans une zone', 105: 'Entrée en zone dangereuse', 106: 'Sortie de la zone sûre', 107: 'Obstacle à l’arrière',
  108: 'Obstacle arrière gauche', 109: 'Obstacle arrière droit', 110: 'Niveau de batterie bas', 111: 'Brouillage détecté',
  114: 'Excès de vitesse dans une zone', 115: 'Excès de vitesse dans une zone', 116: 'Température élevée (capteur)',
  117: 'Température basse (capteur)', 118: 'Retournement du véhicule', 121: 'Carburant bas', 122: 'Choc léger',
  123: 'Choc moyen', 124: 'Choc violent', 125: 'Vol de carburant (réservoir secondaire)', 127: 'Surcharge',
  128: 'Véhicule à vide', 132: 'Stationnement trop long', 134: 'Chute', 136: 'Véhicule immergé',
  137: 'Ouverture de portière non autorisée', 138: 'Portière restée ouverte', 139: 'Humidité élevée (capteur)',
  140: 'Humidité basse (capteur)', 141: 'Changement de voie brusque',
};
// Alertes qui peuvent signaler un vol ou un sinistre : à mettre en avant tout de suite
export const ALARMES_CRITIQUES = new Set([1, 2, 4, 7, 9, 10, 15, 16, 29, 33, 77, 79, 99, 103, 106, 111, 118, 123, 124, 136, 137]);
