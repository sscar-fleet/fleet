// Mise en page commune des pages légales (accessibles sans être connecté)
export default function PageLegale({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <main className="page legal" style={{ maxWidth: 820 }}>
      <a href="/"><img src="/logo-blanc.svg" alt="SS CAR FLEET" style={{ height: 40 }} /></a>
      <h1 style={{ margin: '24px 0 6px' }}>{titre}</h1>
      <p className="gris" style={{ marginTop: 0 }}>Version du 18 octobre 2026</p>
      {children}
      <p className="gris" style={{ fontSize: 13, marginTop: 32 }}><a href="/confidentialite">Confidentialité</a> · <a href="/conditions">Conditions d&apos;utilisation</a> · <a href="/login">Connexion</a></p>
    </main>
  );
}
