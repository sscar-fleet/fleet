import { utilisateurCourant } from '@/lib/agence';
import { euros } from '@/lib/format';
import { ajouterJours } from '@/lib/transport';
import { rapportJour, heureParis } from '@/lib/rapportTransport';
import Cadre from '../../_c/Cadre';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Rapport du matin : la journée de chaque camion (hier par défaut), les anomalies en premier
export default async function Rapport({ searchParams }: { searchParams: { jour?: string } }) {
  const { supabase } = await utilisateurCourant();
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const jour = searchParams.jour && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.jour) ? searchParams.jour : ajouterJours(aujourdhui, -1);
  const { lignes, total } = await rapportJour(supabase, jour);
  const titre = new Date(jour + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return (
    <Cadre titre={`Rapport du ${titre}`} retour={{ lien: '/tournees', texte: 'Planning des tournées' }}
      actions={<>
        <a className="bouton petit" href={`/tournees/rapport?jour=${ajouterJours(jour, -1)}`} aria-label="Jour précédent">←</a>
        {jour < aujourdhui && <a className="bouton petit" href={`/tournees/rapport?jour=${ajouterJours(jour, 1)}`} aria-label="Jour suivant">→</a>}
        <a className="bouton petit" href={`/tournees/rapport/csv?jour=${jour}`}>Excel</a>
      </>}>
      <section className="compteurs">
        <div className="compteur"><span>Tournées</span><b>{total.tournees}</b>{total.faites ? <small className="gris">{total.faites} terminées dans l&apos;appli</small> : null}</div>
        <div className="compteur"><span>Kilomètres</span><b>{total.km.toLocaleString('fr-FR')} km</b></div>
        <div className="compteur"><span>Chiffre</span><b>{euros(total.chiffre)}</b></div>
        <div className="compteur"><span>Anomalies</span><b style={{ color: total.anomalies ? 'var(--orange)' : 'var(--vert)' }}>{total.anomalies}</b></div>
      </section>
      <section className="carte" style={{ overflowX: 'auto' }}>
        {!lignes.length ? <p className="gris">Aucun camion n&apos;a roulé ni n&apos;avait de tournée ce jour-là.</p> : (
          <table>
            <thead><tr><th>Camion</th><th>Chauffeur(s)</th><th>Départ</th><th>Fin</th><th>Km</th><th>Tournées</th><th>Chiffre</th><th>À regarder</th></tr></thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.vehicule_id}>
                  <td><a href={`/vehicules/${l.vehicule_id}`}><b>{l.plaque}</b></a> <span className="gris">{l.modele}</span></td>
                  <td>{l.chauffeurs || <span className="gris">—</span>}</td>
                  <td>{heureParis(l.depart)}</td><td>{heureParis(l.fin)}</td>
                  <td>{l.km != null ? `${l.km} km` : '—'}</td>
                  <td>{l.tournees}</td><td>{euros(l.chiffre)}</td>
                  <td style={{ color: 'var(--orange)', fontWeight: 700 }}>{l.anomalies.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total.sansCamion > 0 && <p style={{ color: 'var(--orange)', fontWeight: 700 }}>{total.sansCamion} tournée{total.sansCamion > 1 ? 's' : ''} sans camion ce jour-là.</p>}
        <p className="gris" style={{ fontSize: 13 }}>Départ, fin et kilomètres viennent du traceur (boîtiers branchés sur le serveur SS CAR SYSTEM).</p>
      </section>
    </Cadre>
  );
}
