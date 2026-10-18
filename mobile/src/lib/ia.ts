// L'IA de Fleet. Elle tourne sur le serveur du site (la clé reste là-bas, jamais dans le téléphone) :
// l'appli envoie une photo ou une phrase, le serveur répond avec des champs remplis.
import { supabase } from './supabase';

const FLEET = process.env.EXPO_PUBLIC_FLEET_URL ?? 'https://fleet-beryl-seven.vercel.app';

async function appeler<T>(route: string, corps: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`${FLEET}/api/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(corps),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(res.erreur ?? 'L’IA ne répond pas pour le moment.');
  return res as T;
}

// 1. Papiers : permis, pièce d'identité, carte grise → champs remplis (déjà en service sur le site)
export const lirePapier = (image: string, genre: 'permis' | 'identite' | 'carte_grise') =>
  appeler<{ champs: Record<string, string | null> }>('lire', { image, genre });

// 2. Avis d'amende → immatriculation, date, lieu, montant ; le conducteur est retrouvé tout seul
export const lireAmende = (image: string) =>
  appeler<{ champs: Record<string, string | null> }>('lire', { image, genre: 'amende' });

// 3. Dégâts : compare les photos du départ et du retour et signale ce qui a changé
export const comparerPhotos = (depart: string, retour: string, position: string) =>
  appeler<{ changement: boolean; description: string; gravite?: 'leger' | 'moyen' | 'grave' }>('comparer', { depart, retour, position });

// 4. Assistant : « Clio pour Karim demain 9h, 3 jours » → location préparée, à confirmer d'un geste
export const comprendre = (phrase: string) =>
  appeler<{ action: string; champs: Record<string, unknown>; resume: string }>('assistant', { phrase });
