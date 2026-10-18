import { utilisateurCourant } from '@/lib/agence';
import { motifsSortie, date, euros, km, JOUR } from '@/lib/format';
import Cadre from '../../_c/Cadre';

export const dynamic = 'force-dynamic';

// Historique des véhicules sortis ou vendus : rien n'est effacé, tout reste consultable
export default async function Sortis({ searchParams }: { searchParams: { motif?: string } }) {
  const { supabase } = await utilisateurCourant();
  const { data: vehicules } = await supabase.from('vehicules')
    .select('id, immatriculation, marque, modele, km, cout_mensuel, date_entree, date_sortie, motif_sortie, prix_sortie, locations(prix_total, statut), entretiens(cout, montant_recu), depenses(montant), dommages(cout, statut)')
    .eq('statut', 'sorti').order('date_sortie', { ascending: false });

  const toutes = (vehicules ?? []).map((v: any) => {
    const recettes = (v.locations ?? []).filter((l: any) => ['en_cours', 'terminee'].includes(l.statut)).reduce((s: number, l: any) => s + Number(l.prix_total ?? 0), 0)
      + (v.entretiens ?? []).reduce((s: number, e: any) => s + Number(e.montant_recu ?? 0), 0);
    const mois = v.date_entree && v.date_sortie ? Math.max(0, (new Date(v.date_sortie).getTime() - new Date(v.date_entree).getTime()) / (30.44 * JOUR)) : 0;
    const couts = Number(v.cout_mensuel ?? 0) * mois
      + (v.entretiens ?? []).reduce((s: number, e: any) => s + Number(e.cout ?? 0), 0)
      + (v.depenses ?? []).reduce((s: number, d: any) => s + Number(d.montant ?? 0), 0)
      + (v.dommages ?? []).filter((d: any) => d.statut !== 'annule').reduce((s: number, d: any) => s + Number(d.cout ?? 0), 0);
    return { v, recettes, couts, resultat: recettes - couts, mois, nbLocations: (v.locations ?? []).filter((l: any) => l.statut !== 'annulee').length };
  });
  const lignes = toutes.filter((l) => !searchParams.motif || l.v.motif_sortie === searchParams.motif);
  const total = lignes.reduce((s, l) => s + l.resultat, 0);
  const ventes = lignes.reduce((s, l) => s + Number(l.v.prix_sortie ?? 0), 0);
  const nbVendus = toutes.filter((l) => l.v.motif_sortie === 'vendu').length;

  return (
    <Cadre retour={{ lien: '/vehicules', texte: 'Véhicules' }} titre={`Véhicules sortis et vendus (${toutes.length})`}
      actions={<a className="bouton" href="/export/sortis">Exporter</a>}>
      <div className="filtres">
        <a href="/vehicules/sortis" className={!searchParams.motif ? 'actif' : ''}>Tous ({toutes.length})</a>
        {Object.entries(motifsSortie).map(([k, x]) => {
          const n = toutes.filter((l) => l.v.motif_sortie === k).length;
          return n ? <a key={k} href={`/vehicules/sortis?motif=${k}`} className={searchParams.motif === k ? 'actif' : ''}>{x} ({n})</a> : null;
        })}
      </div>
      <section className="chiffres">
        <div><span>Véhicules vendus</span><b>{nbVendus}</b></div>
        <div><span>Total des ventes</span><b>{euros(ventes)}</b></div>
        <div><span>Résultat d&apos;exploitation cumulé</span><b style={{ color: total >= 0 ? 'var(--vert)' : 'var(--rouge)' }}>{euros(total)}</b></div>
      </section>
      <div className="tableau">
        <table>
          <thead><tr><th>Véhicule</th><th>Sortie</th><th>Vente</th><th>Résultat</th><th className="masque-mobile">Dans la flotte</th></tr></thead>
          <tbody>
            {lignes.map(({ v, resultat, recettes, couts, mois, nbLocations }) => (
              <tr key={v.id}>
                <td><a className="bloc" href={`/vehicules/${v.id}`}><b>{v.immatriculation}</b><br /><span className="gris">{[v.marque, v.modele].filter(Boolean).join(' ')} · {km(v.km)}</span></a></td>
                <td>{date(v.date_sortie)}<br /><span className="gris">{motifsSortie[v.motif_sortie] ?? v.motif_sortie ?? ''}</span></td>
                <td>{euros(v.prix_sortie)}</td>
                <td style={{ color: resultat >= 0 ? 'var(--vert)' : 'var(--rouge)', fontWeight: 600 }} title={`Recettes ${euros(recettes)} · coûts ${euros(couts)}`}>{resultat >= 0 ? '+' : ''}{euros(resultat)}<br /><span className="gris" style={{ fontWeight: 400 }}>{nbLocations} location{nbLocations > 1 ? 's' : ''}</span></td>
                <td className="masque-mobile">{date(v.date_entree)} → {date(v.date_sortie)}<br /><span className="gris">{Math.round(mois * 10) / 10} mois</span></td>
              </tr>
            ))}
            {!lignes.length && <tr><td colSpan={5} className="vide">Aucun véhicule sorti de la flotte.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="gris" style={{ fontSize: 13 }}>Un véhicule sorti n&apos;est jamais effacé : locations, états des lieux, photos, dépenses et amendes restent sur sa fiche. Le bouton « Bilan PDF » de la fiche fait une archive complète à garder.</p>
    </Cadre>
  );
}
