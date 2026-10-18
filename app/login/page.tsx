'use client';
import Logo from '../_c/Logo';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';

type Mode = 'connexion' | 'creation' | 'oubli';

export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [mode, setMode] = useState<Mode>('connexion');
  const [suite, setSuite] = useState('/');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('next')?.startsWith('/')) setSuite(p.get('next')!);
    if (p.get('email')) setEmail(p.get('email')!);
    if (p.get('lien') === 'expire') setErreur('Ce lien a expiré ou a déjà servi. Recommencez l’opération.');
  }, []);

  const traduire = (m: string) =>
    m.includes('Invalid login') ? 'E-mail ou mot de passe incorrect.'
    : m.includes('Email not confirmed') ? 'Confirmez d’abord votre adresse avec le lien reçu par e-mail.'
    : m.includes('already registered') ? 'Un compte existe déjà avec cet e-mail.'
    : m.includes('Password should') ? 'Le mot de passe doit faire au moins 8 caractères.'
    : m.includes('rate limit') ? 'Trop de demandes. Réessayez dans quelques minutes.'
    : m;

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur(''); setInfo('');
    const supabase = supabaseNavigateur();
    const retour = `${window.location.origin}/auth/callback?next=${encodeURIComponent(suite)}`;
    if (mode === 'oubli') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/mot-de-passe` });
      if (error) return setErreur(traduire(error.message));
      return setInfo('Si un compte existe avec cet e-mail, un lien pour choisir un nouveau mot de passe vient d’être envoyé.');
    }
    if (mode === 'creation') {
      const { data, error } = await supabase.auth.signUp({ email, password: motDePasse, options: { emailRedirectTo: retour } });
      if (error) return setErreur(traduire(error.message));
      if (!data.session) return setInfo('Compte créé. Cliquez sur le lien reçu par e-mail pour l’activer.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
      if (error) return setErreur(traduire(error.message));
    }
    router.push(suite);
    router.refresh();
  }

  return (
    <main className="connexion">
      <Logo />
      <form onSubmit={valider}>
        {mode === 'oubli' && <p className="gris" style={{ margin: 0 }}>Indiquez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.</p>}
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        {mode !== 'oubli' && <label>Mot de passe<input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required minLength={8}
          autoComplete={mode === 'creation' ? 'new-password' : 'current-password'} /></label>}
        {erreur && <p className="erreur">{erreur}</p>}
        {info && <p className="succes">{info}</p>}
        <button className="bouton principal" type="submit">
          {mode === 'creation' ? 'Créer mon compte' : mode === 'oubli' ? 'Recevoir le lien' : 'Se connecter'}
        </button>
        {mode === 'connexion' && <button className="bouton" type="button" onClick={() => setMode('oubli')}>Mot de passe oublié ?</button>}
        <button className="bouton" type="button" onClick={() => { setMode(mode === 'connexion' ? 'creation' : 'connexion'); setErreur(''); setInfo(''); }}>
          {mode === 'connexion' ? 'Nouveau loueur ? Créer un compte' : 'Revenir à la connexion'}
        </button>
      </form>
      <p className="gris" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 24 }}>
        <a href="/confidentialite">Confidentialité</a> · <a href="/conditions">Conditions d&apos;utilisation</a>
      </p>
    </main>
  );
}
