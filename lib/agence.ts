import { redirect } from 'next/navigation';
import { cache } from 'react';
import { supabaseServeur } from './supabase';

export type Profil = {
  id: string;
  nom: string;
  role: 'gerant' | 'employe';
  agence_id: string;
  agences: { nom: string; metier?: 'location' | 'transport' | null; regles_transport?: Record<string, unknown> | null } | null;
};

// Renvoie l'utilisateur connecté et son agence, ou redirige vers la connexion / l'inscription.
export const utilisateurCourant = cache(async () => {
  const supabase = supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data } = await supabase
    .from('utilisateurs')
    .select('id, nom, role, agence_id, agences(*)')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (!data) redirect('/bienvenue');
  // Compte en attente d'ouverture, essai terminé ou suspendu : page d'information
  const { data: etat } = await supabase.rpc('etat_compte');
  const e = Array.isArray(etat) ? etat[0] : etat;
  if (e && e.ouvert === false) redirect('/compte');
  // Employé qui n'a accès qu'à l'appli téléphone
  const { data: a } = await supabase.from('utilisateurs').select('acces').eq('id', auth.user.id).maybeSingle();
  if ((a as any)?.acces === 'appli') redirect('/acces-appli');
  return { supabase, profil: data as unknown as Profil, transport: (data as any)?.agences?.metier === 'transport' };
});

// Erreur lisible en français à partir d'une erreur Supabase
export function verifier(error: { message: string; code?: string } | null, contexte = '') {
  if (!error) return;
  let message = error.message;
  if (error.code === '23505') message = 'Cet élément existe déjà (doublon).';
  else if (error.code === '23503') message = 'Cet élément est relié à d’autres données.';
  else if (error.code === '23514') message = 'Une valeur saisie n’est pas valable (dates ou chiffres).';
  else if (error.code === '42501') message = 'Vous n’avez pas le droit de faire cette action.';
  throw new Error(contexte ? `${contexte} : ${message}` : message);
}

// Liens temporaires (1 heure) vers les fichiers privés du stockage
export async function liensFichiers(supabase: any, chemins: (string | null | undefined)[]) {
  const liste = Array.from(new Set(chemins.filter(Boolean))) as string[];
  if (!liste.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from('documents').createSignedUrls(liste, 3600);
  const liens: Record<string, string> = {};
  (data ?? []).forEach((d: any) => { if (d.signedUrl && d.path) liens[d.path] = d.signedUrl; });
  return liens;
}
