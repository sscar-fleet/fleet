export default function Entete({ agence }: { agence: string }) {
  return (
    <header className="entete">
      <a href="/"><img src="/logo-blanc.svg" alt="SS CAR FLEET" /></a>
      <nav className="nav">
        <a href="/">Accueil</a>
        <a href="/vehicules">Véhicules</a>
        <span className="masque-mobile" style={{ color: 'var(--gris)', alignSelf: 'center' }}>{agence}</span>
      </nav>
    </header>
  );
}
