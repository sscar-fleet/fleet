import Logo from '../_c/Logo';
import { redirect } from 'next/navigation';
import { supabaseServeur } from '@/lib/supabase';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';

// Première connexion : l'entreprise choisit son métier (location ou transport), puis donne son nom.
// Le métier se change ensuite à tout moment dans Réglages.
async function creer(formData: FormData) {
  'use server';
  const supabase = supabaseServeur();
  const metier = formData.get('metier') === 'transport' ? 'transport' : 'location';
  const { data: agence, error } = await supabase.rpc('creer_agence', {
    nom_agence: String(formData.get('agence') ?? '').trim(),
    nom_gerant: String(formData.get('gerant') ?? '').trim(),
  });
  if (error) {
    if (error.message.includes('déjà une agence')) redirect('/');
    return { erreur: 'Création impossible : ' + error.message };
  }
  if (metier === 'transport' && agence) await supabase.from('agences').update({ metier }).eq('id', agence);
  redirect('/');
}

export default function Bienvenue() {
  return (
    <main className="connexion bienvenue">
      <Logo />
      <h1>Bienvenue</h1>
      <Formulaire action={creer}>
        <fieldset className="choix-metier">
          <legend>Votre activité</legend>
          <label>
            <input type="radio" name="metier" value="location" defaultChecked required />
            <span><b>Location de véhicules</b><small>Réservations, contrats, états des lieux, cautions</small></span>
          </label>
          <label>
            <input type="radio" name="metier" value="transport" />
            <span><b>Transport et livraison</b><small>Tournées, chauffeurs, planning de la semaine</small></span>
          </label>
        </fieldset>
        <label>Nom de votre entreprise<input name="agence" required /></label>
        <label>Votre nom (gérant)<input name="gerant" required /></label>
        <Envoyer>Commencer</Envoyer>
        <p className="gris" style={{ fontSize: 13, margin: 0 }}>Vous pourrez changer d&apos;activité à tout moment dans Réglages : véhicules, GPS et amendes sont gardés.</p>
      </Formulaire>
    </main>
  );
}
