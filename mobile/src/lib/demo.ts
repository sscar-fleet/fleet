// Mode démonstration (EXPO_PUBLIC_DEMO=1) : l'appli tourne avec des données d'exemple, sans compte ni réseau
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

const h = (heures: number) => { const d = new Date(); d.setHours(heures, 0, 0, 0); return d.toISOString(); };
const dans = (jours: number, heures: number) => { const d = new Date(); d.setDate(d.getDate() + jours); d.setHours(heures, 0, 0, 0); return d.toISOString(); };

const v = (id: string, immatriculation: string, marque: string, modele: string, statut = 'disponible') => ({ id, immatriculation, marque, modele, statut });
const cl = (id: string, prenom: string, nom: string, ok = true) => ({ id, prenom, nom, telephone: '06 12 34 56 78', email: 'exemple@exemple.fr', permis_path: ok ? 'x' : null, piece_identite_path: ok ? 'x' : null, liste_noire: false });

export const demoLocations = [
  { id: 'd1', numero: 12, debut: h(9), fin_prevue: dans(3, 9), statut: 'reservee', caution_statut: 'a_prendre', caution_montant: 800, prix_total: 180, vehicules: v('v1', 'AB123CD', 'Peugeot', '208'), clients: cl('c1', 'Karim', 'Exemple', false), etats_des_lieux: [] },
  { id: 'd2', numero: 13, debut: h(14), fin_prevue: dans(1, 14), statut: 'reservee', caution_statut: 'prise', caution_montant: 500, prix_total: 60, vehicules: v('v2', 'EF456GH', 'Renault', 'Clio V'), clients: cl('c2', 'Inès', 'Exemple'), etats_des_lieux: [] },
  { id: 'r1', numero: 9, debut: dans(-3, 10), fin_prevue: h(8), statut: 'en_cours', caution_statut: 'prise', caution_montant: 800, prix_total: 240, vehicules: v('v3', 'IJ789KL', 'Citroën', 'C3', 'loue'), clients: cl('c3', 'Yanis', 'Exemple'), etats_des_lieux: [{ type: 'depart', statut: 'termine' }] },
  { id: 'r2', numero: 10, debut: dans(-1, 18), fin_prevue: h(18), statut: 'en_cours', caution_statut: 'prise', caution_montant: 500, prix_total: 70, vehicules: v('v4', 'MN012OP', 'Dacia', 'Sandero', 'loue'), clients: cl('c4', 'Sarah', 'Exemple'), etats_des_lieux: [{ type: 'depart', statut: 'termine' }] },
];

export const demoAmendes = [
  { id: 'a1', date_infraction: dans(-12, 15), type: 'Excès de vitesse', montant: 135, statut: 'a_designer', lieu: 'Paris 15e', vehicules: { immatriculation: 'IJ789KL' }, clients: { nom: 'Exemple', prenom: 'Yanis' } },
  { id: 'a2', date_infraction: dans(-20, 11), type: 'Stationnement', montant: 35, statut: 'designee', lieu: 'Boulogne', vehicules: { immatriculation: 'AB123CD' }, clients: { nom: 'Exemple', prenom: 'Inès' } },
];
