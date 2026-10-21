import { utilisateurCourant } from '@/lib/agence';
import { versJour, depuisParis, JOUR } from '@/lib/format';
import Cadre from '../_c/Cadre';
import GrillePlanning, { chargerPlanning } from '../_c/GrillePlanning';

export const dynamic = 'force-dynamic';
const jourValide = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export default async function Planning({ searchParams }: { searchParams: { debut?: string; fin?: string } }) {
  const { supabase } = await utilisateurCourant();
  const aujourdhui = versJour(new Date());
  const debutJ = jourValide(searchParams.debut) ?? aujourdhui;
  const debut = new Date(depuisParis(debutJ + 'T00:00')!);
  const decale = (d: Date, n: number) => versJour(new Date(d.getTime() + n * JOUR + 12 * 3600 * 1000));
  let finJ = jourValide(searchParams.fin) ?? decale(debut, 13);
  if (finJ < debutJ) finJ = debutJ;
  const nb = Math.min(124, Math.round((new Date(depuisParis(finJ + 'T00:00')!).getTime() - debut.getTime()) / JOUR) + 1);
  const p = await chargerPlanning(supabase, debutJ, nb);

  // Raccourcis
  const [a, m] = aujourdhui.split('-').map(Number);
  const moisJ = (k: number) => { const d = new Date(Date.UTC(a, m - 1 + k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`; };
  const finMois = (k: number) => decale(new Date(depuisParis(moisJ(k + 1) + 'T00:00')!), -1);
  const raccourcis: [string, string, string][] = [
    ['14 jours', aujourdhui, decale(new Date(depuisParis(aujourdhui + 'T00:00')!), 13)],
    ['Ce mois', moisJ(0), finMois(0)],
    ['Mois prochain', moisJ(1), finMois(1)],
    ['3 mois', moisJ(0), finMois(2)],
  ];
  const duree = nb;
  const lien = (d: string, f: string) => `/planning?debut=${d}&fin=${f}`;

  return (
    <Cadre titre="Planning" tables={['locations', 'entretiens']}
      actions={<a className="bouton principal" href="/locations/nouvelle">+ Nouvelle location</a>}>
      <div className="filtres" style={{ margin: '0 0 12px' }}>
        {raccourcis.map(([t, d, f]) => <a key={t} href={lien(d, f)} className={d === debutJ && f === finJ ? 'actif' : ''}>{t}</a>)}
        <a href={lien(decale(debut, -duree), decale(debut, -1))}>← Avant</a>
        <a href={lien(decale(debut, duree), decale(debut, 2 * duree - 1))}>Après →</a>
      </div>
      <section className="chiffres">
        <div><span>Remplissage moyen</span><b>{Math.round((p.remplissage.reduce((s, x) => s + x, 0) / nb) * 100)} %</b></div>
        <div><span>Jours affichés</span><b>{nb}</b></div>
        <div><span>Véhicules</span><b>{p.nbV}</b></div>
        <div><span>Locations sur la période</span><b>{p.locations.length}</b></div>
      </section>
      <GrillePlanning p={p} />
      <p className="gris" style={{ fontSize: 13 }}>Cliquez sur une case vide pour créer une location. Pour changer la voiture d&apos;une réservation, attrapez sa barre et lâchez-la sur la ligne d&apos;une autre voiture. Sur les longues périodes, passer sur une case affiche le client. Turquoise clair : réservée ou terminée · foncé : en cours · orange : maintenance ou transfert (⇄). Jusqu&apos;à 4 mois d&apos;un coup.</p>
    </Cadre>
  );
}
