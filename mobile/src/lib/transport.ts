// Version transport dans l'appli : tournées du jour et de la semaine, chauffeurs, camions, fin de tournée
import { supabase } from './supabase';
import { avecCache } from './donnees';
import { api } from './site';
import { mettreEnFile, envoyerFile } from './hors-ligne';

export type Tournee = {
  id: string; jour: string; debut: string; fin: string; statut: 'prevue' | 'faite' | 'annulee'; verrouillee: boolean;
  chauffeur_id: string | null; vehicule_id: string | null; donneur_id: string | null; depot_id: string | null; libelle: string | null;
  livres: number | null; absents: number | null; photos: string[] | null;
};
export type Chauffeur = { id: string; prenom: string | null; nom: string; telephone: string | null; ville: string | null; depot_id: string | null };
export type Camion = { id: string; immatriculation: string; marque: string | null; modele: string | null; statut: string; depot_id: string | null };
export type Donneur = { id: string; nom: string; couleur: string | null };
export type DonneesTransport = { tournees: Tournee[]; chauffeurs: Chauffeur[]; camions: Camion[]; donneurs: Donneur[]; depots: { id: string; nom: string }[] };

export const jourParis = (decalage = 0) => { const d = new Date(Date.now() + decalage * 864e5); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };
export const ajouterJours = (j: string, n: number) => { const d = new Date(j + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const lundiDe = (j: string) => ajouterJours(j, -((new Date(j + 'T12:00:00Z').getUTCDay() + 6) % 7));
export const heureCourte = (h?: string | null) => String(h ?? '').slice(0, 5);
export const nomChauffeur = (c?: { prenom?: string | null; nom?: string | null } | null) => (c ? [c.prenom, c.nom].filter(Boolean).join(' ') : '');
export const jourLong = (j: string) => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const jourCourt = (j: string) => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

const CHAMPS = 'id, jour, debut, fin, statut, verrouillee, chauffeur_id, vehicule_id, donneur_id, depot_id, libelle, livres, absents, photos';

// Tournées entre deux jours (inclus), avec ce qu'il faut pour les afficher
export function chargerTransport(du: string, au: string, chauffeurId?: string | null) {
  return avecCache<DonneesTransport>(`transport-${du}-${au}-${chauffeurId ?? 'tous'}`, async () => {
    let q = supabase.from('tournees').select(CHAMPS).gte('jour', du).lte('jour', au).neq('statut', 'annulee').order('jour').order('debut');
    if (chauffeurId) q = q.eq('chauffeur_id', chauffeurId);
    const [t, c, v, d, dep] = await Promise.all([
      q,
      supabase.from('chauffeurs').select('id, prenom, nom, telephone, ville, depot_id').eq('actif', true).order('prenom'),
      supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, depot_id').neq('statut', 'sorti').order('immatriculation'),
      supabase.from('donneurs_ordre').select('id, nom, couleur'),
      supabase.from('depots').select('id, nom').eq('actif', true),
    ]);
    if (t.error) throw t.error;
    return { tournees: (t.data ?? []) as Tournee[], chauffeurs: (c.data ?? []) as Chauffeur[], camions: (v.data ?? []) as Camion[], donneurs: (d.data ?? []) as Donneur[], depots: (dep.data ?? []) as any };
  });
}

// Choix à la main : la tournée est verrouillée (le remplissage automatique n'y touche plus)
export async function affecter(tourneeId: string, champ: 'chauffeur_id' | 'vehicule_id', valeur: string | null) {
  const { error } = await supabase.from('tournees').update({ [champ]: valeur, verrouillee: true }).eq('id', tourneeId);
  if (error) throw error;
}

export async function remplirSemaine(lundi: string) {
  return api<{ message: string }>('mobile/transport/remplir', { lundi });
}

// Fin de tournée par le chauffeur : marche sans réseau (envoyée dès que le réseau revient), photos des bons comprises
export async function terminerTournee(t: { id: string; agence_id: string }, champs: { livres: number | null; absents: number | null; note: string | null }, photos: string[]) {
  const chemins = photos.map((_, i) => `${t.agence_id}/tournees/${t.id}/bl-${Date.now()}-${i}.jpg`);
  const maj = { genre: 'maj' as const, table: 'tournees', id: t.id, champs: { ...champs, statut: 'faite', fin_le: new Date().toISOString(), photos: chemins } };
  if (!photos.length) await mettreEnFile(maj);
  else {
    // Les photos partent d'abord, la tournée est marquée faite une fois la dernière envoyée
    for (let i = 0; i < photos.length; i++) await mettreEnFile({ genre: 'fichier', chemin: chemins[i], uri: photos[i], type: 'image/jpeg', ensuite: i === photos.length - 1 ? maj : undefined });
  }
  envoyerFile().catch(() => {});
}
