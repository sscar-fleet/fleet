import { utilisateurCourant } from '@/lib/agence';
import { depuisParis, versJour, JOUR } from '@/lib/format';
import Cadre from '../_c/Cadre';

export const dynamic = 'force-dynamic';
const NB = 14;

export default async function Planning({ searchParams }: { searchParams: { debut?: string } }) {
  const { supabase } = await utilisateurCourant();
  const jour0 = searchParams.debut && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.debut) ? searchParams.debut : versJour(new Date());
  const debut = new Date(depuisParis(jour0 + 'T00:00')!);
  const jours = Array.from({ length: NB }, (_, i) => new Date(depuisParis(versJour(new Date(debut.getTime() + i * JOUR + 12 * 3600 * 1000)) + 'T00:00')!));
  const fin = new Date(jours[NB - 1].getTime() + JOUR);
  const aujourdhui = versJour(new Date());

  const [{ data: vehicules }, { data: locations }, { data: entretiens }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut').neq('statut', 'hors_service').order('immatriculation'),
    supabase.from('locations').select('id, numero, vehicule_id, debut, fin_prevue, fin_reelle, statut, clients(nom)')
      .in('statut', ['reservee', 'en_cours', 'terminee']).lt('debut', fin.toISOString()).gt('fin_prevue', debut.toISOString()),
    supabase.from('entretiens').select('vehicule_id, debut, retour_prevu, fin, statut').in('statut', ['prevu', 'en_cours']),
  ]);

  const occupation = (vid: string, j: Date) => {
    const a = j.getTime(); const b = a + JOUR;
    const loc = (locations ?? []).find((l: any) => l.vehicule_id === vid && new Date(l.debut).getTime() < b && new Date(l.fin_reelle ?? l.fin_prevue).getTime() > a);
    if (loc) return { type: 'loc', l: loc };
    const ent = (entretiens ?? []).find((e: any) => e.vehicule_id === vid && e.statut === 'en_cours' && (!e.retour_prevu || new Date(e.retour_prevu).getTime() > a) && a < Date.now() + JOUR * 30);
    if (ent && a + JOUR > Date.now()) return { type: 'ent' };
    return null;
  };
  const nbV = vehicules?.length ?? 0;
  const remplissage = jours.map((j) => (nbV ? (vehicules ?? []).filter((v: any) => occupation(v.id, j)?.type === 'loc').length / nbV : 0));
  const decale = (n: number) => versJour(new Date(debut.getTime() + n * JOUR + 12 * 3600 * 1000));
  const fmt = (j: Date) => j.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric' });

  return (
    <Cadre titre="Planning" tables={['locations', 'entretiens']}
      actions={<>
        <a className="bouton petit" href={`/planning?debut=${decale(-7)}`}>← 7 jours</a>
        <a className="bouton petit" href="/planning">Aujourd&apos;hui</a>
        <a className="bouton petit" href={`/planning?debut=${decale(7)}`}>7 jours →</a>
        <a className="bouton principal" href="/locations/nouvelle">+ Location</a>
      </>}>
      <section className="chiffres">
        <div><span>Remplissage moyen (14 jours)</span><b>{Math.round((remplissage.reduce((s, x) => s + x, 0) / NB) * 100)} %</b></div>
        <div><span>Véhicules</span><b>{nbV}</b></div>
        <div><span>Locations sur la période</span><b>{locations?.length ?? 0}</b></div>
      </section>
      <div className="planning">
        <table>
          <thead>
            <tr><th>Véhicule</th>{jours.map((j, i) => <th key={i} className={versJour(j) === aujourdhui ? 'aujourdhui' : ''}>{fmt(j)}</th>)}</tr>
            <tr><th className="gris">Remplissage</th>{remplissage.map((r, i) => (
              <th key={i} title={`${Math.round(r * 100)} %`}><div className="jauge"><i style={{ width: `${r * 100}%` }} /></div></th>
            ))}</tr>
          </thead>
          <tbody>
            {(vehicules ?? []).map((v: any) => (
              <tr key={v.id}>
                <td><a href={`/vehicules/${v.id}`}><b>{v.immatriculation}</b><br /><span className="gris">{[v.marque, v.modele].filter(Boolean).join(' ')}</span></a></td>
                {jours.map((j, i) => {
                  const o: any = occupation(v.id, j);
                  const we = [0, 6].includes(new Date(j.getTime() + 12 * 3600 * 1000).getUTCDay());
                  if (o?.type === 'loc') return (
                    <td key={i} className={`occupe ${o.l.statut}`} title={`N° ${o.l.numero} · ${o.l.clients?.nom ?? ''}`}>
                      <a href={`/locations/${o.l.id}`} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.l.clients?.nom ?? ''}</a>
                    </td>);
                  if (o?.type === 'ent') return <td key={i} className="occupe maintenance" title="Maintenance">🔧</td>;
                  return <td key={i} className={we ? 'weekend' : ''}><a href={`/locations/nouvelle?vehicule=${v.id}`} style={{ display: 'block', color: 'transparent' }}>+</a></td>;
                })}
              </tr>
            ))}
            {!nbV && <tr><td colSpan={NB + 1} className="vide">Ajoutez des véhicules pour voir le planning.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="gris" style={{ fontSize: 13 }}>Toucher une case vide crée une location pour ce véhicule. Turquoise clair : réservée ou terminée · foncé : en cours · orange : maintenance.</p>
    </Cadre>
  );
}
