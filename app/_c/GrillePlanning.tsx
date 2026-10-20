import { depuisParis, versJour, JOUR, plaque } from '@/lib/format';

// Calendrier à jauge : une ligne par véhicule, une colonne par jour, jauge de remplissage en haut
export async function chargerPlanning(supabase: any, jour0: string, nb: number) {
  const debut = new Date(depuisParis(jour0 + 'T00:00')!);
  const jours = Array.from({ length: nb }, (_, i) => new Date(depuisParis(versJour(new Date(debut.getTime() + i * JOUR + 12 * 3600 * 1000)) + 'T00:00')!));
  const fin = new Date(jours[nb - 1].getTime() + JOUR);
  const [{ data: vehicules }, { data: locations }, { data: entretiens }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut').not('statut', 'in', '(hors_service,sorti)').order('immatriculation'),
    supabase.from('locations').select('id, numero, vehicule_id, debut, fin_prevue, fin_reelle, statut, clients(nom)')
      .in('statut', ['reservee', 'en_cours', 'terminee']).lt('debut', fin.toISOString()).gt('fin_prevue', debut.toISOString()),
    supabase.from('entretiens').select('vehicule_id, type, garage, debut, retour_prevu, statut').eq('statut', 'en_cours'),
  ]);
  const occupation = (vid: string, j: Date): any => {
    const a = j.getTime(); const b = a + JOUR;
    const loc = (locations ?? []).find((l: any) => l.vehicule_id === vid && new Date(l.debut).getTime() < b && new Date(l.fin_reelle ?? l.fin_prevue).getTime() > a);
    if (loc) return { type: 'loc', l: loc };
    const ent = (entretiens ?? []).find((e: any) => e.vehicule_id === vid && (!e.retour_prevu || new Date(e.retour_prevu).getTime() > a));
    if (ent && b > Date.now()) return { type: 'ent', e: ent };
    return null;
  };
  const nbV = vehicules?.length ?? 0;
  const remplissage = jours.map((j) => (nbV ? (vehicules ?? []).filter((v: any) => occupation(v.id, j)?.type === 'loc').length / nbV : 0));
  return { jours, vehicules: vehicules ?? [], locations: locations ?? [], occupation, remplissage, nbV };
}

export default function GrillePlanning({ p, compact = false }: { p: Awaited<ReturnType<typeof chargerPlanning>>; compact?: boolean }) {
  const aujourdhui = versJour(new Date());
  const serre = p.jours.length > 21; // vue longue (mois, trimestre) : cases étroites, noms dans l'infobulle
  const tz = { timeZone: 'Europe/Paris' } as const;
  const fmt = (j: Date) => serre
    ? <>{j.toLocaleDateString('fr-FR', { ...tz, weekday: 'narrow' })}<br />{j.toLocaleDateString('fr-FR', { ...tz, day: 'numeric' })}</>
    : j.toLocaleDateString('fr-FR', { ...tz, weekday: 'short', day: 'numeric' });
  // Bandeau des mois au-dessus des jours
  const mois: { libelle: string; n: number }[] = [];
  p.jours.forEach((j) => {
    const l = j.toLocaleDateString('fr-FR', { ...tz, month: 'long', year: 'numeric' });
    if (mois.length && mois[mois.length - 1].libelle === l) mois[mois.length - 1].n++; else mois.push({ libelle: l, n: 1 });
  });
  const largeur = serre ? 150 + p.jours.length * 30 : undefined;
  return (
    <div className="planning">
      <table style={{ minWidth: largeur ?? (compact ? 640 : 900) }} className={serre ? 'serre' : ''}>
        <thead>
          <tr><th></th>{mois.map((m, i) => <th key={i} colSpan={m.n} className="mois">{m.libelle}</th>)}</tr>
          <tr><th>Véhicule</th>{p.jours.map((j, i) => <th key={i} className={versJour(j) === aujourdhui ? 'aujourdhui' : ''}>{fmt(j)}</th>)}</tr>
          <tr><th className="gris">Remplissage</th>{p.remplissage.map((r, i) => (
            <th key={i} title={`${Math.round(r * 100)} %`}>
              <div className="jauge"><i style={{ width: `${r * 100}%` }} /></div>
              {!serre && <span className="gris" style={{ fontSize: 10.5 }}>{Math.round(r * 100)} %</span>}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {p.vehicules.map((v: any) => (
            <tr key={v.id}>
              <td><a href={`/vehicules/${v.id}`}><b>{plaque(v.immatriculation)}</b><br /><span className="gris">{[v.marque, v.modele].filter(Boolean).join(' ')}</span></a></td>
              {p.jours.map((j, i) => {
                const o = p.occupation(v.id, j);
                const we = [0, 6].includes(new Date(j.getTime() + 12 * 3600 * 1000).getUTCDay());
                const jour = j.toLocaleDateString('fr-FR', { ...tz, weekday: 'short', day: 'numeric', month: 'short' });
                if (o?.type === 'loc') return (
                  <td key={i} className={`occupe ${o.l.statut}`} title={`${jour} · N° ${o.l.numero} · ${o.l.clients?.nom ?? ''}`}>
                    <a href={`/locations/${o.l.id}`} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{serre ? '\u00a0' : o.l.clients?.nom ?? ''}</a>
                  </td>);
                if (o?.type === 'ent') return o.e?.type === 'transfert'
                  ? <td key={i} className="occupe maintenance" title={`${jour} · transféré${o.e.garage ? ' à ' + o.e.garage : ''}`}>⇄{serre ? '' : ' ' + (o.e.garage ?? '')}</td>
                  : <td key={i} className="occupe maintenance" title={`${jour} · maintenance`}>{serre ? '' : '🔧'}</td>;
                return <td key={i} className={`libre ${we ? 'weekend' : ''}`} title={`${jour} · nouvelle location`}><a href={`/locations/nouvelle?vehicule=${v.id}&jour=${versJour(j)}`} className="case-libre">+</a></td>;
              })}
            </tr>
          ))}
          {!p.nbV && <tr><td colSpan={p.jours.length + 1} className="vide">Ajoutez des véhicules pour voir le planning.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
