import Logo from './Logo';
import { utilisateurCourant } from '@/lib/agence';
import Navigation from './Navigation';
import Direct from './Direct';
import BoutonTheme from './BoutonTheme';

// Cadre commun : logo, recherche, menu, synchronisation en direct
export default async function Cadre({ titre, actions, tables = [], children, retour }: {
  titre?: React.ReactNode; actions?: React.ReactNode; tables?: string[]; children: React.ReactNode; retour?: { lien: string; texte: string };
}) {
  const { profil } = await utilisateurCourant();
  return (
    <main className="page">
      <header className="entete">
        <a href="/" className="logo"><Logo /></a>
        <form action="/recherche" className="recherche" role="search">
          <input name="q" type="search" placeholder="Rechercher : 208, Martin, AB-123…" aria-label="Rechercher" />
        </form>
        <span className="droite">
          <span className="agence">{profil.nom}<br /><span className="gris">{profil.agences?.nom}</span></span>
          <BoutonTheme />
        </span>
      </header>
      <Navigation gerant={profil.role === 'gerant'} />
      {retour && <a className="retour" href={retour.lien}>← {retour.texte}</a>}
      {(titre || actions) && (
        <div className="titre">
          {titre && <h1>{titre}</h1>}
          {actions && <div className="ligne">{actions}</div>}
        </div>
      )}
      {children}
      {tables.length > 0 && <Direct tables={tables} />}
    </main>
  );
}
