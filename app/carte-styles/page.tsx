import StylesCarte from './StylesCarte';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <main style={{ padding: 20, display: 'grid', gap: 14 }}>
      <h1 style={{ margin: 0 }}>Choisir le style de carte</h1>
      <p className="gris" style={{ margin: 0 }}>Même endroit, même repère, six styles. Zoomez et déplacez-vous pour juger.</p>
      <StylesCarte />
    </main>
  );
}
