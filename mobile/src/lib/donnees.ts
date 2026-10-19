// Lectures des écrans, avec repli sur le cache quand il n'y a pas de réseau
import { supabase } from './supabase';
import { garder, relire } from './hors-ligne';
import { DEMO, demoLocations, demoAmendes, demoVehicules, demoClients } from './demo';

export type LocationLigne = {
  id: string; numero: number | null; debut: string; fin_prevue: string; statut: string;
  caution_statut: string; caution_montant: number | null; prix_total: number | null;
  vehicules: { id: string; immatriculation: string; marque: string | null; modele: string | null; statut: string } | null;
  clients: { id: string; nom: string; prenom: string | null; telephone: string | null; email: string | null;
    permis_path: string | null; piece_identite_path: string | null; liste_noire: boolean } | null;
  etats_des_lieux: { type: string; statut: string }[];
};

const CHAMPS = 'id, numero, debut, fin_prevue, statut, caution_statut, caution_montant, prix_total, vehicules(id, immatriculation, marque, modele, statut), clients(id, nom, prenom, telephone, email, permis_path, piece_identite_path, liste_noire), etats_des_lieux(type, statut)';

async function avecCache<T>(cle: string, lire: () => Promise<T>): Promise<{ donnees: T; horsLigne: boolean; majLe?: string }> {
  if (DEMO) return { donnees: demo(cle) as T, horsLigne: false };
  try {
    const donnees = await lire();
    garder(cle, donnees).catch(() => {});
    return { donnees, horsLigne: false };
  } catch {
    const c = await relire<T>(cle);
    if (c) return { donnees: c.valeur, horsLigne: true, majLe: c.majLe };
    throw new Error('Pas de réseau et rien en mémoire pour le moment.');
  }
}

function demo(cle: string): unknown {
  const ls = demoLocations as unknown as LocationLigne[];
  if (cle === 'aujourdhui') return { departs: ls.filter((l) => l.statut === 'reservee'), retours: ls.filter((l) => l.statut === 'en_cours') };
  if (cle === 'locations') return ls;
  if (cle === 'amendes') return demoAmendes;
  if (cle === 'vehicules') return demoVehicules;
  if (cle === 'clients') return demoClients;
  if (cle.startsWith('vehicule-')) { const v = demoVehicules.find((x) => 'vehicule-' + x.id === cle); return { vehicule: v, locations: ls.filter((l) => l.vehicules?.id === v?.id) }; }
  if (cle.startsWith('client-')) { const c = demoClients.find((x) => 'client-' + x.id === cle); return { client: c, locations: ls.filter((l) => l.clients?.id === c?.id) }; }
  if (cle.startsWith('location-')) { const l = ls.find((x) => 'location-' + x.id === cle); if (l) garder(cle, l).catch(() => {}); return l; }
  return null;
}

const finJour = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); };

export function chargerAujourdhui() {
  return avecCache('aujourdhui', async () => {
    const fin = finJour();
    const [departs, retours] = await Promise.all([
      supabase.from('locations').select(CHAMPS).eq('statut', 'reservee').lte('debut', fin).order('debut'),
      supabase.from('locations').select(CHAMPS).eq('statut', 'en_cours').lte('fin_prevue', fin).order('fin_prevue'),
    ]);
    if (departs.error) throw departs.error;
    if (retours.error) throw retours.error;
    return { departs: (departs.data ?? []) as unknown as LocationLigne[], retours: (retours.data ?? []) as unknown as LocationLigne[] };
  });
}

export function chargerLocations() {
  return avecCache('locations', async () => {
    const { data, error } = await supabase.from('locations').select(CHAMPS).in('statut', ['reservee', 'en_cours']).order('debut').limit(200);
    if (error) throw error;
    return (data ?? []) as unknown as LocationLigne[];
  });
}

export function chargerLocation(id: string) {
  return avecCache('location-' + id, async () => {
    const { data, error } = await supabase.from('locations').select(CHAMPS + ', km_depart, km_inclus, prix_km_sup').eq('id', id).single();
    if (error) throw error;
    return data as unknown as LocationLigne & { km_depart: number | null };
  });
}

export type AmendeLigne = { id: string; date_infraction: string; type: string | null; montant: number | null; statut: string; lieu: string | null;
  vehicules: { immatriculation: string } | null; clients: { nom: string; prenom: string | null } | null };
export function chargerAmendes() {
  return avecCache('amendes', async () => {
    const { data, error } = await supabase.from('amendes').select('id, date_infraction, type, montant, statut, lieu, vehicules(immatriculation), clients(nom, prenom)')
      .order('date_infraction', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []) as unknown as AmendeLigne[];
  });
}

// Tous les voyants verts = départ possible tout de suite
export function voyantsDepart(l: LocationLigne) {
  return [
    { ok: !!(l.clients?.permis_path && l.clients?.piece_identite_path) && !l.clients?.liste_noire, titre: 'Client vérifié' },
    { ok: l.caution_statut === 'prise' || !l.caution_montant, titre: 'Caution' },
    { ok: l.vehicules?.statut === 'disponible', titre: 'Voiture prête' },
  ];
}

// --- Flotte
export type VehiculeLigne = { id: string; immatriculation: string; marque: string | null; modele: string | null; statut: string; km: number | null;
  prix_jour: number | null; assurance_echeance: string | null; ct_echeance: string | null };
const CHAMPS_V = 'id, immatriculation, marque, modele, statut, km, prix_jour, assurance_echeance, ct_echeance';

export function chargerVehicules() {
  return avecCache('vehicules', async () => {
    const { data, error } = await supabase.from('vehicules').select(CHAMPS_V).neq('statut', 'sorti').order('immatriculation');
    if (error) throw error;
    return (data ?? []) as VehiculeLigne[];
  });
}

export function chargerVehicule(id: string) {
  return avecCache('vehicule-' + id, async () => {
    const [{ data: v, error }, { data: locs }] = await Promise.all([
      supabase.from('vehicules').select(CHAMPS_V).eq('id', id).single(),
      supabase.from('locations').select(CHAMPS).eq('vehicule_id', id).in('statut', ['reservee', 'en_cours']).order('debut').limit(5),
    ]);
    if (error) throw error;
    return { vehicule: v as VehiculeLigne, locations: (locs ?? []) as unknown as LocationLigne[] };
  });
}

// --- Clients
export type ClientLigne = { id: string; nom: string; prenom: string | null; telephone: string | null; email: string | null; adresse: string | null;
  date_permis: string | null; permis_path: string | null; piece_identite_path: string | null; liste_noire: boolean };
const CHAMPS_C = 'id, nom, prenom, telephone, email, adresse, date_permis, permis_path, piece_identite_path, liste_noire';

export function chargerClients() {
  return avecCache('clients', async () => {
    const { data, error } = await supabase.from('clients').select(CHAMPS_C).order('nom').limit(500);
    if (error) throw error;
    return (data ?? []) as ClientLigne[];
  });
}

export function chargerClient(id: string) {
  return avecCache('client-' + id, async () => {
    const [{ data: c, error }, { data: locs }, papiers] = await Promise.all([
      supabase.from('clients').select(CHAMPS_C).eq('id', id).single(),
      supabase.from('locations').select(CHAMPS).eq('client_id', id).order('debut', { ascending: false }).limit(10),
      // Les colonnes verso / domicile peuvent ne pas exister encore : on les lit à part
      supabase.from('clients').select('permis_verso_path, piece_identite_verso_path, justificatif_domicile_path').eq('id', id).maybeSingle(),
    ]);
    if (error) throw error;
    return { client: { ...(c as ClientLigne), ...((papiers.data as object) ?? {}) } as ClientLigne & Record<string, string | null>, locations: (locs ?? []) as unknown as LocationLigne[] };
  });
}

// Conducteur au moment d'une infraction : la location en cours ce jour-là
export async function retrouverConducteur(vehiculeId: string, quand: string) {
  const { data } = await supabase.from('locations').select('id, client_id, debut, fin_prevue, fin_reelle, clients(nom, prenom)')
    .eq('vehicule_id', vehiculeId).neq('statut', 'annulee').lte('debut', quand).order('debut', { ascending: false }).limit(5);
  return ((data ?? []) as any[]).find((l) => new Date(l.fin_reelle ?? l.fin_prevue) >= new Date(quand)) ?? null;
}
