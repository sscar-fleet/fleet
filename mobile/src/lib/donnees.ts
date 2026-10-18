// Lectures des écrans, avec repli sur le cache quand il n'y a pas de réseau
import { supabase } from './supabase';
import { garder, relire } from './hors-ligne';
import { DEMO, demoLocations, demoAmendes } from './demo';

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
