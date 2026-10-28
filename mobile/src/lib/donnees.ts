// Lectures des écrans, avec repli sur le cache quand il n'y a pas de réseau
import { supabase } from './supabase';
import { garder, relire } from './hors-ligne';
import { DEMO, demoLocations, demoAmendes, demoVehicules, demoClients } from './demo';

export type LocationLigne = {
  id: string; numero: number | null; debut: string; fin_prevue: string; statut: string;
  caution_statut: string; caution_montant: number | null; prix_total: number | null;
  km_depart: number | null; km_inclus: number | null; prix_km_sup: number | null; carburant_depart: number | null; signature_contrat_path: string | null;
  vehicules: { id: string; immatriculation: string; marque: string | null; modele: string | null; annee?: number | null; couleur?: string | null; visuel?: string | null; statut: string; km: number | null; prix_jour: number | null } | null;
  clients: { id: string; nom: string; prenom: string | null; telephone: string | null; email: string | null;
    permis_path: string | null; piece_identite_path: string | null; liste_noire: boolean } | null;
  etats_des_lieux: { type: string; statut: string; km?: number | null; carburant?: number | null }[];
};

const CHAMPS = 'id, numero, debut, fin_prevue, statut, caution_statut, caution_montant, prix_total, km_depart, km_inclus, prix_km_sup, carburant_depart, signature_contrat_path, vehicules(id, immatriculation, marque, modele, annee, couleur, visuel, statut, km, prix_jour), clients(id, nom, prenom, telephone, email, permis_path, piece_identite_path, liste_noire), etats_des_lieux(type, statut, km, carburant)';

export async function avecCache<T>(cle: string, lire: () => Promise<T>): Promise<{ donnees: T; horsLigne: boolean; majLe?: string }> {
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
  if (cle === 'aujourdhui') return { departs: ls.filter((l) => l.statut === 'reservee' && l.debut <= finJour(0)), retours: ls.filter((l) => l.statut === 'en_cours' && l.fin_prevue <= finJour(0)),
    demain: ls.filter((l) => l.statut === 'reservee' && l.debut > finJour(0) && l.debut <= finJour(1)), amendes: demoAmendes.filter((a) => a.statut !== 'designee').length };
  if (cle === 'locations') return ls;
  if (cle === 'amendes') return demoAmendes;
  if (cle === 'vehicules') return demoVehicules;
  if (cle === 'clients') return demoClients;
  if (cle.startsWith('vehicule-')) { const v = demoVehicules.find((x) => 'vehicule-' + x.id === cle); return { vehicule: v, locations: ls.filter((l) => l.vehicules?.id === v?.id) }; }
  if (cle.startsWith('client-')) { const c = demoClients.find((x) => 'client-' + x.id === cle); return { client: c, locations: ls.filter((l) => l.clients?.id === c?.id) }; }
  if (cle.startsWith('location-')) { const l = ls.find((x) => 'location-' + x.id === cle); if (l) garder(cle, l).catch(() => {}); return l ? { ...l, jeton_signature: 'demo-' + l.id, signe_distance_le: null } : null; }
  return null;
}

const finJour = (plus = 0) => { const d = new Date(); d.setDate(d.getDate() + plus); d.setHours(23, 59, 59, 999); return d.toISOString(); };

export type Journee = { departs: LocationLigne[]; retours: LocationLigne[]; demain: LocationLigne[]; amendes: number };
export function chargerAujourdhui() {
  return avecCache<Journee>('aujourdhui', async () => {
    const [departs, retours, demain, amendes] = await Promise.all([
      supabase.from('locations').select(CHAMPS).eq('statut', 'reservee').lte('debut', finJour(0)).order('debut'),
      supabase.from('locations').select(CHAMPS).eq('statut', 'en_cours').lte('fin_prevue', finJour(0)).order('fin_prevue'),
      supabase.from('locations').select(CHAMPS).eq('statut', 'reservee').gt('debut', finJour(0)).lte('debut', finJour(1)).order('debut'),
      supabase.from('amendes').select('id', { count: 'exact', head: true }).in('statut', ['a_designer', 'infos_manquantes']),
    ]);
    if (departs.error) throw departs.error;
    if (retours.error) throw retours.error;
    return { departs: (departs.data ?? []) as unknown as LocationLigne[], retours: (retours.data ?? []) as unknown as LocationLigne[],
      demain: (demain.data ?? []) as unknown as LocationLigne[], amendes: amendes.count ?? 0 };
  });
}

export function chargerLocations() {
  return avecCache('locations', async () => {
    const { data, error } = await supabase.from('locations').select(CHAMPS).in('statut', ['reservee', 'en_cours']).order('debut').limit(200);
    if (error) throw error;
    return (data ?? []) as unknown as LocationLigne[];
  });
}

export type LocationFiche = LocationLigne & { jeton_signature?: string | null; signe_distance_le?: string | null };
export function chargerLocation(id: string) {
  return avecCache<LocationFiche>('location-' + id, async () => {
    const [{ data, error }, distance] = await Promise.all([
      supabase.from('locations').select(CHAMPS).eq('id', id).single(),
      // Colonnes de la signature à distance : absentes tant que la mise à jour n'est pas lancée
      supabase.from('locations').select('jeton_signature, signe_distance_le').eq('id', id).maybeSingle(),
    ]);
    if (error) throw error;
    return { ...(data as unknown as LocationLigne), ...((distance.error ? {} : distance.data) ?? {}) } as LocationFiche;
  });
}

// Photos de l'état des lieux de départ, pour comparer au retour (lien valable 1 h)
export async function photosDepart(locationId: string): Promise<Record<string, string>> {
  if (DEMO) return {};
  try {
    const { data: edl } = await supabase.from('etats_des_lieux').select('id').eq('location_id', locationId).eq('type', 'depart').maybeSingle();
    if (!edl) return {};
    const { data: photos } = await supabase.from('photos_edl').select('position, path').eq('edl_id', edl.id).order('prise_le');
    if (!photos?.length) return {};
    const { data: liens } = await supabase.storage.from('documents').createSignedUrls(photos.map((p) => p.path), 3600);
    const res: Record<string, string> = {};
    photos.forEach((p, i) => { const u = liens?.[i]?.signedUrl; if (u) res[p.position] = u; });
    return res;
  } catch { return {}; }
}

export type AmendeLigne = { id: string; date_infraction: string; type: string | null; montant: number | null; statut: string; lieu: string | null;
  vehicules: { immatriculation: string } | null; clients: { nom: string; prenom: string | null } | null; chauffeurs?: { nom: string; prenom: string | null } | null };
export function chargerAmendes() {
  return avecCache('amendes', async () => {
    // Version transport : le chauffeur retrouvé par le planning (base pas encore à jour : on relit sans lui)
    let { data, error } = await supabase.from('amendes').select('id, date_infraction, type, montant, statut, lieu, vehicules(immatriculation), clients(nom, prenom), chauffeurs(nom, prenom)')
      .order('date_infraction', { ascending: false }).limit(100);
    if (error) ({ data, error } = await supabase.from('amendes').select('id, date_infraction, type, montant, statut, lieu, vehicules(immatriculation), clients(nom, prenom)')
      .order('date_infraction', { ascending: false }).limit(100) as any);
    if (error) throw error;
    return (data ?? []) as unknown as AmendeLigne[];
  });
}

// Tous les voyants verts = départ possible tout de suite
export function voyantsDepart(l: LocationLigne) {
  return [
    { ok: !!(l.clients?.permis_path && l.clients?.piece_identite_path) && !l.clients?.liste_noire, titre: l.clients?.liste_noire ? 'Liste noire' : 'Papiers' },
    { ok: l.caution_statut === 'prise' || !l.caution_montant, titre: 'Caution' },
    { ok: l.vehicules?.statut === 'disponible', titre: 'Voiture' },
  ];
}

// Deux périodes se chevauchent-elles ?
export const chevauche = (a1: string | Date, a2: string | Date, b1: string, b2: string) => new Date(a1) < new Date(b2) && new Date(b1) < new Date(a2);

// --- Flotte
export type VehiculeLigne = { id: string; carte_grise_path?: string | null; immatriculation: string; marque: string | null; modele: string | null; annee?: number | null; couleur?: string | null; visuel?: string | null; statut: string; km: number | null;
  prix_jour: number | null; assurance_echeance: string | null; ct_echeance: string | null };
const CHAMPS_V = 'id, immatriculation, marque, modele, annee, couleur, visuel, statut, km, prix_jour, assurance_echeance, ct_echeance, carte_grise_path';

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

// Stock : véhicules et locations en cours ou réservées, pour l'écran Stock et le bandeau de Journée
export async function chargerStock() {
  const [v, l] = await Promise.all([chargerVehicules(), chargerLocations()]);
  return { donnees: { vehicules: v.donnees as VehiculeLigne[], locations: l.donnees as LocationLigne[] }, horsLigne: v.horsLigne || l.horsLigne, majLe: v.majLe ?? l.majLe };
}

// Lien temporaire (1 h) vers un document rangé dans l'espace de l'agence
export async function lienDocument(chemin: string): Promise<string | null> {
  const { data } = await supabase.storage.from('documents').createSignedUrl(chemin, 3600);
  return data?.signedUrl ?? null;
}
