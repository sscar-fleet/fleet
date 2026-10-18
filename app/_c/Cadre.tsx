import { utilisateurCourant } from '@/lib/agence';
import Navigation from './Navigation';
import Direct from './Direct';

// Cadre commun : en-tête, menu, synchronisation en direct
export default async function Cadre({ titre, actions, tables = [], children, retour }: {
  titre?: React.ReactNode; actions?: React.ReactNode; tables?: string[]; children: React.ReactNode; retour?: { lien: string; texte: string };
}) {
  const { profil } = await utilisateurCourant();
  return (
    <main className="page">
      <header className="entete">
        <a href="/" className="logo"><img src="/logo-blanc.svg" alt="SS CAR FLEET" /></a>
        <span className="agence">{profil.agences?.nom}</span>
      </header>
      <Navigation />
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
