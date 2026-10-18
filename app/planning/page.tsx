import { utilisateurCourant } from '@/lib/agence';
import { versJour, depuisParis, JOUR } from '@/lib/format';
import Cadre from '../_c/Cadre';
import GrillePlanning, { chargerPlanning } from '../_c/GrillePlanning';

export const dynamic = 'force-dynamic';
const NB = 14;

export default async function Planning({ searchParams }: { searchParams: { debut?: string } }) {
  const { supabase } = await utilisateurCourant();
  const jour0 = searchParams.debut && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.debut) ? searchParams.debut : versJour(new Date());
  const p = await chargerPlanning(supabase, jour0, NB);
  const debut = new Date(depuisParis(jour0 + 'T00:00')!);
  const decale = (n: number) => versJour(new Date(debut.getTime() + n * JOUR + 12 * 3600 * 1000));

  return (
    <Cadre titre="Planning" tables={['locations', 'entretiens']}
      actions={<>
        <a className="bouton petit" href={`/planning?debut=${decale(-7)}`}>← 7 jours</a>
        <a className="bouton petit" href="/planning">Aujourd&apos;hui</a>
        <a className="bouton petit" href={`/planning?debut=${decale(7)}`}>7 jours →</a>
        <a className="bouton principal" href="/locations/nouvelle">+ Location</a>
      </>}>
      <section className="chiffres">
        <div><span>Remplissage moyen (14 jours)</span><b>{Math.round((p.remplissage.reduce((s, x) => s + x, 0) / NB) * 100)} %</b></div>
        <div><span>Véhicules</span><b>{p.nbV}</b></div>
        <div><span>Locations sur la période</span><b>{p.locations.length}</b></div>
      </section>
      <GrillePlanning p={p} />
      <p className="gris" style={{ fontSize: 13 }}>Toucher une case vide crée une location pour ce véhicule. Turquoise clair : réservée ou terminée · foncé : en cours · orange : maintenance.</p>
    </Cadre>
  );
}
