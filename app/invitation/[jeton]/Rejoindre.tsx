'use client';
import { useState } from 'react';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';

export default function Rejoindre({ jeton, email, nom, agence, connecte, accepter }: {
  jeton: string; email: string; nom: string; agence: string; connecte: string | null;
  accepter: () => Promise<{ erreur?: string } | void>;
}) {
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [attente, setAttente] = useState(false);
  const suite = `/invitation/${jeton}`;

  async function rejoindre() {
    setAttente(true); setErreur('');
    const r = await accepter();
    if (r && r.erreur) { setErreur(r.erreur); setAttente(false); }
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(''); setInfo('');
    const supabase = supabaseNavigateur();
    const { data, error } = await supabase.auth.signUp({
      email, password: mdp, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(suite)}` },
    });
    if (error) {
      if (error.message.includes('already registered')) return setErreur('Un compte existe déjà avec cet e-mail : connectez-vous.');
      return setErreur(error.message.includes('Password') ? 'Le mot de passe doit faire au moins 8 caractères.' : error.message);
    }
    if (!data.session) return setInfo(`Compte créé. Ouvrez le lien reçu sur ${email} pour terminer.`);
    window.location.reload();
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1>Bonjour {nom}</h1>
      <p style={{ margin: 0 }}><b>{agence}</b> vous invite à utiliser SS CAR FLEET.</p>
      {connecte ? (
        connecte.toLowerCase() === email.toLowerCase() ? (
          <button className="bouton principal" onClick={rejoindre} disabled={attente}>{attente ? 'Un instant…' : `Rejoindre ${agence}`}</button>
        ) : (
          <p className="erreur">Vous êtes connecté avec {connecte}. Déconnectez-vous puis ouvrez de nouveau ce lien avec {email}.</p>
        )
      ) : (
        <form onSubmit={creer} style={{ display: 'grid', gap: 12 }}>
          <label>E-mail<input value={email} disabled /></label>
          <label>Choisissez un mot de passe<input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
          <button className="bouton principal" type="submit">Créer mon accès</button>
          <a className="bouton" href={`/login?next=${encodeURIComponent(suite)}&email=${encodeURIComponent(email)}`}>J&apos;ai déjà un compte</a>
        </form>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
      {info && <p className="succes">{info}</p>}
    </div>
  );
}
