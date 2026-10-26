import { utilisateurCourant } from '@/lib/agence';
import { euros, plaque } from '@/lib/format';
import { tarifDe } from '@/lib/transport';
import { kmPeriodeTraccar } from '@/lib/traccar';
import Cadre from '../../_c/Cadre';

export const dynamic = 'force-dynamic';

const moisValide = (m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? m : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 7));
const decaler = (m: string, n: number) => { const d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const finDuMois = (m: string) => { const d = new Date(m + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const nomMois = (m: string) => new Date(m + '-15T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const somme = (l: any[] | null | undefined, f: (x: any) => number) => (l ?? []).reduce((s, x) => s + (Number(f(x)) || 0), 0);

// Coût par camion sur un mois : ce qu'il rapporte (tournées × tarif) moins ce qu'il coûte (loyer, entretien,
// dépenses, amendes payées, sinistres restés à charge), et le coût au kilomètre avec les km du boîtier GPS
export default async function CoutsCamions({ searchParams }: { searchParams: { mois?: string } }) {
  const { supabase } = await utilisateurCourant();
  const mois = moisValide(searchParams.mois);
  const du = `${mois}-01`, au = finDuMois(mois);
  const [{ data: vehicules }, { data: tournees }, { data: donneurs }, { data: tarifs }, { data: entretiens }, { data: depenses }, { data: amendes }, { data: sinistres }, kmGps] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, cout_mensuel, date_entree, statut, traceurs(imei)').order('immatriculation'),
    supabase.from('tournees').select('vehicule_id, tarif, donneur_id, depot_id, statut, jour').gte('jour', du).lte('jour', au).neq('statut', 'annulee'),
    supabase.from('donneurs_ordre').select('*'),
    supabase.from('tarifs_tournee').select('*'),
    supabase.from('entretiens').select('vehicule_id, cout, montant_recu, fin, debut').or(`and(fin.gte.${du},fin.lte.${au}T23:59:59),and(fin.is.null,debut.gte.${du},debut.lte.${au}T23:59:59)`),
    supabase.from('depenses').select('vehicule_id, montant, date').gte('date', du).lte('date', au),
    supabase.from('amendes').select('vehicule_id, montant, statut, date_infraction, chauffeur_id').eq('statut', 'payee').gte('date_infraction', du).lte('date_infraction', `${au}T23:59:59`),
    supabase.from('sinistres').select('vehicule_id, reste_a_charge, retenue_chauffeur, date_sinistre').gte('date_sinistre', du).lte('date_sinistre', `${au}T23:59:59`),
    kmPeriodeTraccar(du, au).catch(() => new Map<string, number>()),
  ]);

  const lignes = (vehicules ?? [])
    .filter((v: any) => v.statut !== 'sorti' || (tournees ?? []).some((t: any) => t.vehicule_id === v.id))
    .map((v: any) => {
      const de = <T,>(l: T[] | null | undefined) => (l ?? []).filter((x: any) => x.vehicule_id === v.id);
      const ts = de(tournees);
      const chiffre = somme(ts, (t) => tarifDe(t, donneurs ?? [], tarifs ?? []) ?? 0);
      const loyer = v.date_entree && v.date_entree > au ? 0 : Number(v.cout_mensuel ?? 0);
      const entretien = somme(de(entretiens), (e) => Number(e.cout ?? 0) - Number(e.montant_recu ?? 0));
      const autres = somme(de(depenses), (d) => d.montant);
      const amendesPayees = somme(de(amendes), (a) => a.montant);
      const sin = somme(de(sinistres), (s) => Number(s.reste_a_charge ?? 0) - Number(s.retenue_chauffeur ?? 0));
      const cout = loyer + entretien + autres + amendesPayees + sin;
      const imei = (v.traceurs as any)?.imei ? String((v.traceurs as any).imei) : null;
      const km = imei ? kmGps.get(imei) ?? null : null;
      return { v, tournees: ts.length, chiffre, loyer, entretien, autres, amendes: amendesPayees, sinistres: sin, cout, marge: chiffre - cout, km, parKm: km ? cout / km : null, parTournee: ts.length ? cout / ts.length : null };
    })
    .filter((l) => l.tournees || l.cout)
    .sort((a, b) => a.marge - b.marge);

  const total = { chiffre: somme(lignes, (l) => l.chiffre), cout: somme(lignes, (l) => l.cout), km: somme(lignes, (l) => l.km ?? 0) };
  const avecKm = lignes.filter((l) => l.km);
  const coutKmMoyen = avecKm.length ? somme(avecKm, (l) => l.cout) / somme(avecKm, (l) => l.km) : null;
  const n = (x: number) => (x ? euros(x) : <span className="gris">—</span>);

  return (
    <Cadre titre="Coût par camion" retour={{ lien: '/tournees', texte: 'Planning' }} tables={['tournees', 'entretiens', 'depenses']}>
      <div className="filtres">
        <a href={`/tournees/couts?mois=${decaler(mois, -1)}`}>‹ Mois précédent</a>
        <a className="actif" href={`/tournees/couts?mois=${mois}`} style={{ textTransform: 'capitalize' }}>{nomMois(mois)}</a>
        <a href={`/tournees/couts?mois=${decaler(mois, 1)}`}>Mois suivant ›</a>
      </div>
      <section className="compteurs">
        <div className="compteur"><span>Chiffre des tournées</span><b>{euros(total.chiffre)}</b></div>
        <div className="compteur"><span>Coûts des camions</span><b>{euros(total.cout)}</b></div>
        <div className="compteur"><span>Marge</span><b style={{ color: total.chiffre - total.cout >= 0 ? 'var(--vert)' : 'var(--rouge)' }}>{euros(total.chiffre - total.cout)}</b></div>
        <div className="compteur"><span>Coût moyen au km</span><b>{coutKmMoyen != null ? `${coutKmMoyen.toFixed(2).replace('.', ',')} €` : '—'}</b><small className="gris">{total.km ? `${total.km.toLocaleString('fr-FR')} km au GPS` : 'km du boîtier GPS'}</small></div>
      </section>
      <section className="carte" style={{ overflowX: 'auto' }}>
        <p className="gris" style={{ marginTop: 0, fontSize: 13.5 }}>Du moins rentable au plus rentable. Hors salaires et carburant (sauf si saisis dans les dépenses).</p>
        {!lignes.length && <p className="gris">Rien sur ce mois.</p>}
        {lignes.length > 0 && (
          <div className="tableau"><table>
            <thead><tr><th>Camion</th><th>Tournées</th><th>Chiffre</th><th>Loyer</th><th>Entretien</th><th>Dépenses</th><th>Amendes</th><th>Sinistres</th><th>Coût</th><th>Marge</th><th>Km</th><th>€ / km</th><th>€ / tournée</th></tr></thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.v.id}>
                  <td style={{ whiteSpace: 'nowrap' }}><a className="lien" href={`/vehicules/${l.v.id}`}><b>{plaque(l.v.immatriculation)}</b></a><br /><span className="gris" style={{ fontSize: 12.5 }}>{[l.v.marque, l.v.modele].filter(Boolean).join(' ')}</span></td>
                  <td>{l.tournees || <span className="gris">0</span>}</td>
                  <td>{n(l.chiffre)}</td>
                  <td>{l.loyer ? euros(l.loyer) : <a className="gris" href={`/vehicules/${l.v.id}`} title="Renseigner le loyer ou le crédit du camion">à saisir</a>}</td>
                  <td>{n(l.entretien)}</td><td>{n(l.autres)}</td><td>{n(l.amendes)}</td><td>{n(l.sinistres)}</td>
                  <td><b>{euros(l.cout)}</b></td>
                  <td><b style={{ color: l.marge >= 0 ? 'var(--vert)' : 'var(--rouge)' }}>{euros(l.marge)}</b></td>
                  <td>{l.km != null ? l.km.toLocaleString('fr-FR') : <span className="gris">—</span>}</td>
                  <td>{l.parKm != null ? `${l.parKm.toFixed(2).replace('.', ',')} €` : <span className="gris">—</span>}</td>
                  <td>{l.parTournee != null ? euros(l.parTournee) : <span className="gris">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </Cadre>
  );
}
