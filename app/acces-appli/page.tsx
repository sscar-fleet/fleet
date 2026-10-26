import Logo from '../_c/Logo';
import Deconnexion from '../parametres/Deconnexion';

export const dynamic = 'force-dynamic';

// Employé dont l'accès est limité à l'appli téléphone
export default function AccesAppli() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="carte" style={{ maxWidth: 460, display: 'grid', gap: 14, textAlign: 'center' }}>
        <div style={{ margin: '0 auto' }}><Logo /></div>
        <h1 style={{ margin: 0, fontSize: 24 }}>Votre accès, c’est l’appli</h1>
        <p className="gris" style={{ margin: 0 }}>Votre responsable vous a donné accès à l’appli sur téléphone (vos tournées, ou les départs et retours). Ouvrez ce lien sur votre téléphone et ajoutez-le à l’écran d’accueil.</p>
        <a className="bouton principal" href="/app">Ouvrir l’appli</a>
        <div><Deconnexion /></div>
      </div>
    </main>
  );
}
