import BarreRecherche from './BarreRecherche';
import FleetAI from './FleetAI';
import Cloche from './Cloche';
import Logo from './Logo';
import { utilisateurCourant } from '@/lib/agence';
import Navigation from './Navigation';
import MenuLateral from './MenuLateral';
import Direct from './Direct';
import BoutonTheme from './BoutonTheme';

// Cadre commun : menu à gauche (ordinateur) ou barre du bas (téléphone), recherche, synchronisation en direct
export default async function Cadre({ titre, actions, tables = [], children, retour }: {
  titre?: React.ReactNode; actions?: React.ReactNode; tables?: string[]; children: React.ReactNode; retour?: { lien: string; texte: string };
}) {
  const { supabase, profil } = await utilisateurCourant();
  // Petits compteurs rouges du menu : retours en retard, amendes à traiter
  const [retards, amendes, fps] = await Promise.all([
    supabase.from('locations').select('id', { count: 'exact', head: true }).eq('statut', 'en_cours').lt('fin_prevue', new Date().toISOString()),
    supabase.from('amendes').select('id', { count: 'exact', head: true }).in('statut', ['a_designer', 'infos_manquantes']),
    supabase.from('fps').select('id', { count: 'exact', head: true }).in('statut', ['a_refacturer', 'client_inconnu']),
  ]);
  const pied = (
    <>
      <span className="ml-profil"><b>{profil.nom}</b><span className="gris">{profil.agences?.nom}</span></span>
      <BoutonTheme />
    </>
  );
  return (
    <div className="coque">
      <MenuLateral gerant={profil.role === 'gerant'} compteurs={{ '/locations': retards.count ?? 0, '/amendes': amendes.count ?? 0, '/fps': fps.count ?? 0 }} pied={pied} />
      <FleetAI prenom={String(profil.nom ?? '').split(' ')[0]} />
      <main className="page">
        <header className="entete">
          <a href="/" className="logo"><Logo /></a>
          <BarreRecherche />
          <Cloche />
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
    </div>
  );
}
