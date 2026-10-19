// Mode démonstration (EXPO_PUBLIC_DEMO=1) : l'appli tourne avec des données d'exemple, sans compte ni réseau
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

// Horaires calés sur l'heure actuelle pour que la journée ait toujours l'air vivante
const dans = (minutes: number) => { const d = new Date(Date.now() + minutes * 60000); d.setMinutes(Math.round(d.getMinutes() / 5) * 5, 0, 0); return d.toISOString(); };
const jours = (j: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + j); d.setHours(h, 0, 0, 0); return d.toISOString(); };

const v = (id: string, immatriculation: string, marque: string, modele: string, statut = 'disponible', km = 40000, prix_jour = 45) => ({ id, immatriculation, marque, modele, statut, km, prix_jour });
const cl = (id: string, prenom: string, nom: string, ok = true, telephone = '06 12 34 56 78') =>
  ({ id, prenom, nom, telephone, email: 'exemple@exemple.fr', permis_path: ok ? 'x' : null, piece_identite_path: ok ? 'x' : null, liste_noire: false });
const base = { km_inclus: 300, prix_km_sup: 0.35, carburant_depart: null as number | null, km_depart: null as number | null, signature_contrat_path: null as string | null };

export const demoLocations = [
  { ...base, id: 'd1', numero: 12, debut: dans(35), fin_prevue: jours(3, 10), statut: 'reservee', caution_statut: 'a_prendre', caution_montant: 800, prix_total: 135, vehicules: v('v1', 'AB123CD', 'Peugeot', '208', 'disponible', 42350, 45), clients: cl('c1', 'Karim', 'Benali', false), etats_des_lieux: [] },
  { ...base, id: 'd2', numero: 13, debut: dans(190), fin_prevue: jours(2, 18), statut: 'reservee', caution_statut: 'prise', caution_montant: 500, prix_total: 100, vehicules: v('v2', 'EF456GH', 'Renault', 'Clio V', 'disponible', 61200, 50), clients: cl('c2', 'Inès', 'Moreau'), etats_des_lieux: [] },
  { ...base, id: 'r1', numero: 9, debut: jours(-3, 10), fin_prevue: dans(-80), statut: 'en_cours', caution_statut: 'prise', caution_montant: 800, prix_total: 160, km_depart: 22950, carburant_depart: 75, vehicules: v('v3', 'IJ789KL', 'Mercedes', 'Classe A', 'loue', 23000, 80), clients: cl('c3', 'Yanis', 'Laurent'), etats_des_lieux: [{ type: 'depart', statut: 'termine' }] },
  { ...base, id: 'r2', numero: 10, debut: jours(-1, 18), fin_prevue: dans(130), statut: 'en_cours', caution_statut: 'prise', caution_montant: 500, prix_total: 70, km_depart: 87900, carburant_depart: 100, vehicules: v('v4', 'MN012OP', 'Dacia', 'Sandero', 'loue', 88000, 35), clients: cl('c4', 'Sarah', 'Petit'), etats_des_lieux: [{ type: 'depart', statut: 'termine' }] },
  { ...base, id: 'd3', numero: 14, debut: jours(1, 9), fin_prevue: jours(4, 9), statut: 'reservee', caution_statut: 'a_prendre', caution_montant: 1500, prix_total: 540, vehicules: v('v6', 'UV678WX', 'Audi', 'RS3', 'disponible', 18400, 180), clients: cl('c5', 'Lucas', 'Martin'), etats_des_lieux: [] },
];

export const demoAmendes = [
  { id: 'a1', date_infraction: jours(-12, 15), type: 'Excès de vitesse', montant: 135, statut: 'a_designer', lieu: 'Paris 15e', vehicules: { immatriculation: 'IJ789KL' }, clients: { nom: 'Laurent', prenom: 'Yanis' } },
  { id: 'a3', date_infraction: jours(-5, 9), type: 'Feu rouge', montant: 135, statut: 'infos_manquantes', lieu: 'Saint-Denis', vehicules: { immatriculation: 'QR345ST' }, clients: null },
  { id: 'a2', date_infraction: jours(-20, 11), type: 'Stationnement', montant: 35, statut: 'designee', lieu: 'Boulogne', vehicules: { immatriculation: 'AB123CD' }, clients: { nom: 'Moreau', prenom: 'Inès' } },
];

const ech = (j: number) => jours(j, 0).slice(0, 10);
export const demoVehicules = [
  { id: 'v1', immatriculation: 'AB123CD', marque: 'Peugeot', modele: '208', statut: 'disponible', km: 42350, prix_jour: 45, assurance_echeance: ech(60), ct_echeance: ech(200) },
  { id: 'v2', immatriculation: 'EF456GH', marque: 'Renault', modele: 'Clio V', statut: 'disponible', km: 61200, prix_jour: 50, assurance_echeance: ech(17), ct_echeance: ech(300) },
  { id: 'v3', immatriculation: 'IJ789KL', marque: 'Mercedes', modele: 'Classe A', statut: 'loue', km: 23000, prix_jour: 80, assurance_echeance: ech(120), ct_echeance: ech(6) },
  { id: 'v4', immatriculation: 'MN012OP', marque: 'Dacia', modele: 'Sandero', statut: 'loue', km: 88000, prix_jour: 35, assurance_echeance: null, ct_echeance: null },
  { id: 'v5', immatriculation: 'QR345ST', marque: 'Toyota', modele: 'Yaris', statut: 'maintenance', km: 51000, prix_jour: 48, assurance_echeance: null, ct_echeance: null },
  { id: 'v6', immatriculation: 'UV678WX', marque: 'Audi', modele: 'RS3', statut: 'disponible', km: 18400, prix_jour: 180, assurance_echeance: ech(90), ct_echeance: ech(700) },
];
export const demoClients = [cl('c1', 'Karim', 'Benali', false), cl('c2', 'Inès', 'Moreau'), cl('c3', 'Yanis', 'Laurent'), cl('c4', 'Sarah', 'Petit'), cl('c5', 'Lucas', 'Martin'),
  { ...cl('c6', 'Kevin', 'Durand'), liste_noire: true }]
  .map((c) => ({ ...c, adresse: '8 bd Voltaire, 75011 Paris', date_permis: '2019-05-12' }));
