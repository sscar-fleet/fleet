import { utilisateurCourant } from '@/lib/agence';
import { statutLocation, statutCaution, date, heure, euros, debutJour, plaque } from '@/lib/format';
import Cadre from '../_c/Cadre';

export const dynamic = 'force-dynamic';

const filtres: [string, string][] = [
  ['actives', 'Actives'], ['departs', 'Départs du jour'], ['retours', 'Retours du jour'], ['retard', 'En retard'],
  ['reservee', 'À venir'], ['en_cours', 'En cours'], ['terminee', 'Terminées'], ['annulee', 'Annulées'],
];

export default async function Locations({ searchParams }: { searchParams: { filtre?: string } }) {
  const { supabase } = await utilisateurCourant();
  const filtre = searchParams.filtre ?? 'actives';
  const aujourdhui = debutJour(0); const demain = debutJour(1); const maintenant = new Date().toISOString();
  let q = supabase.from('locations')
    .select('id, numero, debut, fin_prevue, fin_reelle, statut, prix_total, caution_statut, caution_montant, vehicules(immatriculation, marque, modele), clients(nom, prenom, liste_noire), dommages(statut)');
  if (filtre === 'actives') q = q.in('statut', ['reservee', 'en_cours']).order('debut');
  else if (filtre === 'departs') q = q.eq('statut', 'reservee').lt('debut', demain).order('debut');
  else if (filtre === 'retours') q = q.eq('statut', 'en_cours').gte('fin_prevue', aujourdhui).lt('fin_prevue', demain).order('fin_prevue');
  else if (filtre === 'retard') q = q.eq('statut', 'en_cours').lt('fin_prevue', maintenant).order('fin_prevue');
  else q = q.eq('statut', filtre).order('debut', { ascending: filtre === 'reservee' }).limit(300);
  const { data: locations } = await q;

  return (
    <Cadre titre="Locations" tables={['locations']}
      actions={<><a className="bouton" href="/export/locations">Exporter</a><a className="bouton principal" href="/locations/nouvelle">+ Nouvelle location</a></>}>
      <div className="filtres">
        {filtres.map(([k, v]) => <a key={k} href={`/locations?filtre=${k}`} className={filtre === k ? 'actif' : ''}>{v}</a>)}
      </div>
      <div className="tableau">
        <table className="cartes">
          <thead><tr><th>Client</th><th>Véhicule</th><th>Dates</th><th>Statut</th><th className="masque-mobile">Prix · caution</th></tr></thead>
          <tbody>
            {(locations ?? []).map((l: any) => {
              const retard = l.statut === 'en_cours' && new Date(l.fin_prevue) < new Date();
              const dommages = (l.dommages ?? []).filter((d: any) => d.statut === 'ouvert').length;
              return (
                <tr key={l.id}>
                  <td><a className="bloc" href={`/locations/${l.id}`}><b>{l.clients?.nom}</b> {l.clients?.prenom}{l.clients?.liste_noire && <span className="retard"> ⚑</span>}<br /><span className="gris">N° {l.numero}</span></a></td>
                  <td><a className="bloc" href={`/locations/${l.id}`}>{plaque(l.vehicules?.immatriculation)}<br /><span className="gris">{[l.vehicules?.marque, l.vehicules?.modele].filter(Boolean).join(' ')}</span></a></td>
                  <td>{date(l.debut)} {heure(l.debut)}<br /><span className="gris">→ {date(l.fin_reelle ?? l.fin_prevue)} {heure(l.fin_reelle ?? l.fin_prevue)}</span></td>
                  <td><span className={`pastille ${retard ? 'retard' : l.statut}`}>{retard ? 'En retard' : statutLocation[l.statut]}</span> {dommages > 0 && <span className="badge rouge" title="Dommages ouverts">{dommages}</span>}</td>
                  <td className="masque-mobile">{euros(l.prix_total)}<br />{l.caution_montant ? <span className={`pastille ${l.caution_statut}`}>{statutCaution[l.caution_statut]}</span> : <span className="gris">sans caution</span>}</td>
                </tr>
              );
            })}
            {!locations?.length && <tr><td colSpan={5}><div className="vide-guide"><b>Rien dans cette liste</b>{filtre === 'actives' ? 'Aucune location en cours ni à venir.' : 'Choisissez un autre filtre.'}<br /><a className="bouton principal" href="/locations/nouvelle">+ Nouvelle location</a></div></td></tr>}
          </tbody>
        </table>
      </div>
    </Cadre>
  );
}
