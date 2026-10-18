import { redirect } from 'next/navigation';
import { supabaseServeur } from '@/lib/supabase';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';

async function creer(formData: FormData) {
  'use server';
  const supabase = supabaseServeur();
  const { error } = await supabase.rpc('creer_agence', {
    nom_agence: String(formData.get('agence') ?? '').trim(),
    nom_gerant: String(formData.get('gerant') ?? '').trim(),
  });
  if (error) {
    if (error.message.includes('déjà une agence')) redirect('/');
    return { erreur: 'Création impossible : ' + error.message };
  }
  redirect('/');
}

export default function Bienvenue() {
  return (
    <main className="connexion">
      <img src="/logo-blanc.svg" alt="SS CAR FLEET" />
      <h1>Bienvenue</h1>
      <Formulaire action={creer}>
        <label>Nom de votre agence<input name="agence" required /></label>
        <label>Votre nom (gérant)<input name="gerant" required /></label>
        <Envoyer>Commencer</Envoyer>
      </Formulaire>
    </main>
  );
}
