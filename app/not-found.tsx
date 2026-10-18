export default function Introuvable() {
  return (
    <main className="page">
      <div className="carte" style={{ marginTop: 40 }}>
        <h1>Page introuvable</h1>
        <p className="gris">Cet élément n&apos;existe pas ou a été supprimé.</p>
        <a className="bouton principal" href="/">Retour à l&apos;accueil</a>
      </div>
    </main>
  );
}
