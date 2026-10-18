'use client';
import { useState } from 'react';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';

// Arrivée depuis le lien « mot de passe oublié » : la session est ouverte, on choisit le nouveau mot de passe
export default function NouveauMotDePasse() {
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState(false);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    if (mdp !== mdp2) return setErreur('Les deux mots de passe ne sont pas identiques.');
    const { error } = await supabaseNavigateur().auth.updateUser({ password: mdp });
    if (error) return setErreur(error.message.includes('session') ? 'Le lien a expiré. Refaites « Mot de passe oublié ».' : error.message);
    setFait(true);
    setTimeout(() => { window.location.href = '/'; }, 1200);
  }

  return (
    <main className="connexion">
      <img src="/logo-blanc.svg" alt="SS CAR FLEET" />
      <h1>Nouveau mot de passe</h1>
      <form onSubmit={valider}>
        <label>Nouveau mot de passe<input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
        <label>Encore une fois<input type="password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
        {erreur && <p className="erreur">{erreur}</p>}
        {fait && <p className="succes">Mot de passe changé. Ouverture de Fleet…</p>}
        <button className="bouton principal" type="submit" disabled={fait}>Enregistrer</button>
      </form>
    </main>
  );
}
