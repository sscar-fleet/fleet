'use client';
import Logo from './_c/Logo';

export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const message = error.message && !error.message.includes('Server Components render') ? error.message : 'Une erreur est survenue.';
  return (
    <main className="page">
      <a href="/"><Logo style={{ height: 40 }} /></a>
      <div className="carte" style={{ marginTop: 24 }}>
        <h1 style={{ marginBottom: 10 }}>Oups</h1>
        <p className="erreur" style={{ fontSize: 16 }}>{message}</p>
        <div className="ligne">
          <button className="bouton principal" onClick={() => reset()}>Réessayer</button>
          <button className="bouton" onClick={() => history.back()}>Revenir en arrière</button>
        </div>
      </div>
    </main>
  );
}
