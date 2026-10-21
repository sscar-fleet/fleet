import OuvrirFormulaire from '@/app/_c/OuvrirFormulaire';
import { utilisateurCourant } from '@/lib/agence';
import { statutEntretien, typesMaintenance, dateHeure, date, euros, plaque } from '@/lib/format';
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
    q, supabase.from('vehicules').select('id, immatriculation, marque, modele, km').not('statut', 'in', '(hors_service,sorti)').order('immatriculation'),
  ]);

  return (
    <Cadre titre="Maintenance et transferts" tables={['entretiens', 'vehicules']} actions={<><a className="bouton" href="/export/entretiens">Exporter</a><OuvrirFormulaire>+ Maintenance, réparation ou transfert</OuvrirFormulaire></>}>
      <details className="formulaire carte formulaire-haut">
        <summary>Maintenance, réparation ou transfert</summary>
        <Formulaire vider action={A.ajouterEntretien} className="grille">
          <label>Véhicule *<select name="vehicule_id" required><option value="">Choisir…</option>
            {vehicules?.map((v: any) => <option key={v.id} value={v.id}>{plaque(v.immatriculation)} · {[v.marque, v.modele].filter(Boolean).join(' ')}</option>)}</select></label>
          <label>Type<select name="type">{Object.entries(typesMaintenance).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
          <label>Détail<input name="raison" placeholder="Vidange, pneus, prêt à Loc Express…" /></label>
          <label>Garage ou loueur<input name="garage" /></label>
          <label>Retour prévu<input name="retour_prevu" type="datetime-local" /></label>
          <label>Coût pour moi (€)<input name="cout" type="number" step="0.01" /></label>
          <label>Montant reçu (€)<input name="montant_recu" type="number" step="0.01" placeholder="Transfert payé par l'autre loueur" /></label>
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
        <table className="cartes">
          <thead><tr><th>Véhicule</th><th>Type</th><th>Statut</th><th className="masque-mobile">Retour prévu</th><th></th></tr></thead>
          <tbody>
            {(entretiens ?? []).map((e: any) => {
              const retard = e.statut === 'en_cours' && e.retour_prevu && new Date(e.retour_prevu) < new Date();
              return (
                <tr key={e.id}>
                  <td><a className="bloc" href={`/vehicules/${e.vehicules?.id}`}><b>{plaque(e.vehicules?.immatriculation)}</b><br /><span className="gris">{[e.vehicules?.marque, e.vehicules?.modele].filter(Boolean).join(' ')}</span></a></td>
                  <td><a className="bloc" href={`/entretiens/${e.id}`}><b>{typesMaintenance[e.type] ?? 'Entretien'}</b> <span className="lien">· ouvrir la fiche</span></a><br /><span className="gris">{[e.raison, e.garage, e.cout ? 'coût ' + euros(e.cout) : '', e.montant_recu ? 'reçu ' + euros(e.montant_recu) : ''].filter(Boolean).join(' · ')}</span></td>
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
