'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';

export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [creation, setCreation] = useState(false);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    const supabase = supabaseNavigateur();
    const { error } = creation
      ? await supabase.auth.signUp({ email, password: motDePasse })
      : await supabase.auth.signInWithPassword({ email, password: motDePasse });
    if (error) return setErreur(error.message);
    router.push('/');
    router.refresh();
  }

  return (
    <main className="connexion">
      <img src="/logo-blanc.svg" alt="SS CAR FLEET" />
      <form onSubmit={valider}>
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Mot de passe<input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required minLength={8} /></label>
        {erreur && <p className="erreur">{erreur}</p>}
        <button className="bouton principal" type="submit">{creation ? 'Créer mon compte' : 'Se connecter'}</button>
        <button className="bouton" type="button" onClick={() => setCreation(!creation)}>
          {creation ? "J'ai déjà un compte" : 'Nouveau loueur ? Créer un compte'}
        </button>
      </form>
    </main>
  );
}
