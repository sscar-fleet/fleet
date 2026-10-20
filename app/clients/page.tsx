import OuvrirFormulaire from '@/app/_c/OuvrirFormulaire';
import { tel } from '@/lib/format';
import { papiersComplets } from '@/app/_c/PapiersClient';
import { utilisateurCourant } from '@/lib/agence';
import { ajouterClient } from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';
import ChampsClient from '../_c/ChampsClient';

export const dynamic = 'force-dynamic';

export default async function Clients({ searchParams }: { searchParams: { q?: string; filtre?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: tous } = await supabase.from('clients')
    .select('id, nom, prenom, telephone, email, liste_noire, permis_path, permis_verso_path, piece_identite_path, piece_identite_verso_path, justificatif_domicile_path, locations(id, statut)').order('nom');
  const q = (searchParams.q ?? '').toLowerCase().trim();
  const clients = (tous ?? []).filter((c: any) =>
    (searchParams.filtre !== 'liste_noire' || c.liste_noire) &&
    (!q || `${c.nom} ${c.prenom ?? ''} ${c.telephone ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q)));

  return (
    <Cadre titre={`Clients (${tous?.length ?? 0})`} tables={['clients']} actions={<><a className="bouton" href="/export/clients">Exporter</a><OuvrirFormulaire>+ Nouveau client</OuvrirFormulaire></>}>
      <details className="formulaire carte formulaire-haut">
        <summary>Nouveau client</summary>
        <Formulaire action={ajouterClient} className="grille">
          <ChampsClient agenceId={profil.agence_id} clients={(tous ?? []).map((x: any) => ({ id: x.id, nom: x.nom, prenom: x.prenom, telephone: x.telephone }))} />
          <Envoyer>Créer la fiche</Envoyer>
        </Formulaire>
        <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Permis et pièce d&apos;identité se scannent ensuite sur la fiche du client, avec le téléphone.</p>
      </details>
      <div className="filtres">
        <a href="/clients" className={!searchParams.filtre ? 'actif' : ''}>Tous</a>
        <a href="/clients?filtre=liste_noire" className={searchParams.filtre === 'liste_noire' ? 'actif' : ''}>Liste noire</a>
        <form style={{ flex: '1 1 180px' }}><input name="q" defaultValue={searchParams.q} placeholder="Nom, téléphone, e-mail…" /></form>
      </div>
      <div className="tableau">
        <table className="cartes">
          <thead><tr><th>Client</th><th>Téléphone</th><th>Locations</th><th className="masque-mobile">Papiers</th><th className="masque-mobile">Statut</th></tr></thead>
          <tbody>
            {clients.map((c: any) => {
              const nb = (c.locations ?? []).filter((l: any) => l.statut !== 'annulee').length;
              const enCours = (c.locations ?? []).some((l: any) => l.statut === 'en_cours');
              const papiers = papiersComplets(c);
              return (
                <tr key={c.id}>
                  <td><a className="bloc" href={`/clients/${c.id}`}><b>{c.nom}</b> {c.prenom}</a></td>
                  <td>{c.telephone ? <a className="lien" href={`tel:${c.telephone}`}>{tel(c.telephone)}</a> : '—'}</td>
                  <td>{nb > 0 ? <span className="badge gris">{nb}</span> : <span className="gris">0</span>}{nb >= 3 && <span className="gris"> fidèle</span>}</td>
                  <td className="masque-mobile"><span className={`pastille ${papiers ? 'ok' : 'proche'}`}>{papiers ? 'Complets' : 'À scanner'}</span></td>
                  <td className="masque-mobile">{c.liste_noire ? <span className="pastille depasse">Liste noire</span> : enCours ? <span className="pastille en_cours">En location</span> : <span className="gris">—</span>}</td>
                </tr>
              );
            })}
            {!clients.length && <tr><td colSpan={5}><div className="vide-guide"><b>{tous?.length ? 'Aucun client trouvé' : 'Pas encore de client'}</b>{tous?.length ? 'Essayez une autre recherche.' : 'Les clients se créent tout seuls à la première location, ou avec « + Nouveau client ».'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Cadre>
  );
}
