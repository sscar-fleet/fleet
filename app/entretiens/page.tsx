import { utilisateurCourant } from '@/lib/agence';
import { statutEntretien, dateHeure, date, euros } from '@/lib/format';
import * as A from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';

export const dynamic = 'force-dynamic';

export default async function Entretiens({ searchParams }: { searchParams: { filtre?: string } }) {
  const { supabase } = await utilisateurCourant();
  const filtre = searchParams.filtre ?? 'actifs';
  let q = supabase.from('entretiens').select('*, vehicules(id, immatriculation, marque, modele)');
  q = filtre === 'actifs' ? q.in('statut', ['prevu', 'en_cours']).order('retour_prevu', { nullsFirst: false }) : q.eq('statut', 'termine').order('fin', { ascending: false }).limit(200);
  const [{ data: entretiens }, { data: vehicules }] = await Promise.all([
    q, supabase.from('vehicules').select('id, immatriculation, marque, modele, km').neq('statut', 'hors_service').order('immatriculation'),
  ]);

  return (
    <Cadre titre="Entretien" tables={['entretiens', 'vehicules']} actions={<a className="bouton" href="/export/entretiens">Exporter</a>}>
      <details className="formulaire carte">
        <summary className="bouton principal">+ Mettre un véhicule en maintenance</summary>
        <Formulaire vider action={A.ajouterEntretien} className="grille">
          <label>Véhicule *<select name="vehicule_id" required><option value="">Choisir…</option>
            {vehicules?.map((v: any) => <option key={v.id} value={v.id}>{v.immatriculation} · {[v.marque, v.modele].filter(Boolean).join(' ')}</option>)}</select></label>
          <label>Raison *<input name="raison" placeholder="Vidange, pneus, carrosserie…" required /></label>
          <label>Garage<input name="garage" /></label>
          <label>Retour prévu<input name="retour_prevu" type="datetime-local" /></label>
          <label>Coût (€)<input name="cout" type="number" step="0.01" /></label>
          <label className="pleine">Commentaire<input name="commentaire" /></label>
          <Envoyer name="demarrer" value="oui">Démarrer maintenant</Envoyer>
          <Envoyer className="bouton" name="demarrer" value="non">Prévoir</Envoyer>
        </Formulaire>
      </details>
      <div className="filtres">
        <a href="/entretiens" className={filtre === 'actifs' ? 'actif' : ''}>En cours et prévus</a>
        <a href="/entretiens?filtre=termines" className={filtre !== 'actifs' ? 'actif' : ''}>Terminés</a>
      </div>
      <div className="tableau">
        <table>
          <thead><tr><th>Véhicule</th><th>Raison</th><th>Statut</th><th className="masque-mobile">Retour prévu</th><th></th></tr></thead>
          <tbody>
            {(entretiens ?? []).map((e: any) => {
              const retard = e.statut === 'en_cours' && e.retour_prevu && new Date(e.retour_prevu) < new Date();
              return (
                <tr key={e.id}>
                  <td><a className="bloc" href={`/vehicules/${e.vehicules?.id}`}><b>{e.vehicules?.immatriculation}</b><br /><span className="gris">{[e.vehicules?.marque, e.vehicules?.modele].filter(Boolean).join(' ')}</span></a></td>
                  <td>{e.raison}<br /><span className="gris">{[e.garage, e.commentaire, e.cout ? euros(e.cout) : ''].filter(Boolean).join(' · ')}</span></td>
                  <td><span className={`pastille ${retard ? 'retard' : e.statut}`}>{retard ? 'En retard' : statutEntretien[e.statut]}</span></td>
                  <td className="masque-mobile">{e.statut === 'termine' ? `Fini le ${date(e.fin)}` : dateHeure(e.retour_prevu)}</td>
                  <td>
                    {e.statut === 'prevu' && <Formulaire action={A.demarrerEntretien.bind(null, e.id)}><Envoyer className="bouton petit">Démarrer</Envoyer></Formulaire>}
                    {e.statut === 'en_cours' && <Formulaire action={A.terminerEntretien.bind(null, e.id)}><Envoyer className="bouton petit">Terminer</Envoyer></Formulaire>}
                  </td>
                </tr>
              );
            })}
            {!entretiens?.length && <tr><td colSpan={5} className="vide">Aucun entretien dans cette liste.</td></tr>}
          </tbody>
        </table>
      </div>
    </Cadre>
  );
}
