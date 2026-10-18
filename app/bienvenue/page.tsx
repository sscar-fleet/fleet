import { redirect } from 'next/navigation';
import { supabaseServeur } from '@/lib/supabase';

async function creer(formData: FormData) {
  'use server';
  const supabase = supabaseServeur();
  const { error } = await supabase.rpc('creer_agence', {
    nom_agence: String(formData.get('agence')),
    nom_gerant: String(formData.get('gerant')),
  });
  if (error) throw new Error(error.message);
  redirect('/');
}

export default function Bienvenue() {
  return (
    <main className="connexion">
      <img src="/logo-blanc.svg" alt="SS CAR FLEET" />
      <h1>Bienvenue</h1>
      <form action={creer}>
        <label>Nom de votre agence<input name="agence" required /></label>
        <label>Votre nom (gérant)<input name="gerant" required /></label>
        <button className="bouton principal" type="submit">Commencer</button>
      </form>
    </main>
  );
}
