import { redirect } from 'next/navigation';
import { supabaseServeur } from './supabase';

// Renvoie l'utilisateur connecté et son agence, ou redirige vers l'inscription.
export async function utilisateurCourant() {
  const supabase = supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data: profil } = await supabase
    .from('utilisateurs')
    .select('id, nom, role, agence_id, agences(nom)')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (!profil) redirect('/bienvenue');
  return { supabase, profil };
}
