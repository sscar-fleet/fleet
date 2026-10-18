// Branchement des traceurs GPS (Seeworld / WhatsGPS, Teltonika) : prêt à recevoir les API.
// Tant qu'aucun fournisseur n'est branché, l'appli fonctionne normalement sans position.
// Les traceurs sont déjà dans la base (table traceurs, reliée aux véhicules par vehicules.traceur_id).

export type Position = { lat: number; lng: number; vitesse?: number; contact?: boolean; le: string; adresse?: string };
export type Trajet = { debut: string; fin: string; km: number };

export interface Fournisseur {
  nom: string;
  position(imei: string): Promise<Position | null>;
  trajets?(imei: string, du: string, au: string): Promise<Trajet[]>;
  kilometrage?(imei: string): Promise<number | null>;   // remplira le compteur de l'état des lieux tout seul
  couperMoteur?(imei: string, couper: boolean): Promise<void>; // toujours derrière une confirmation
}

const aucun: Fournisseur = { nom: 'aucun', position: async () => null };

// Les fournisseurs seront appelés par le serveur du site (identifiants d'API côté serveur),
// l'appli ne fera que lire le résultat.
const fournisseurs: Record<string, Fournisseur> = { aucun };
export const fournisseur = (nom?: string | null) => fournisseurs[nom ?? 'aucun'] ?? aucun;
export const telematiqueActive = () => Object.keys(fournisseurs).length > 1;
