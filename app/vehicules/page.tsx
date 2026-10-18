import { utilisateurCourant } from '@/lib/agence';
import { statutVehicule, carburants, financements, km, echeance, date } from '@/lib/format';
import { ajouterVehicule } from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Scanner from '../_c/Scanner';
import Envoyer from '../_c/Envoyer';

export const dynamic = 'force-dynamic';

export default async function Vehicules({ searchParams }: { searchParams: { statut?: string; q?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: tous } = await supabase.from('vehicules')
    .select('id, immatriculation, marque, modele, statut, km, assurance_echeance, ct_echeance').order('immatriculation');
  const q = (searchParams.q ?? '').toLowerCase().trim();
  const vehicules = (tous ?? []).filter((v: any) =>
    (searchParams.statut ? v.statut === searchParams.statut : v.statut !== 'sorti') &&
    (!q || `${v.immatriculation} ${v.marque ?? ''} ${v.modele ?? ''}`.toLowerCase().includes(q)));
  const compte = (s: string) => (tous ?? []).filter((v: any) => v.statut === s).length;

  return (
    <Cadre titre={`Véhicules (${(tous ?? []).filter((v: any) => v.statut !== 'sorti').length})`} tables={['vehicules']}
      actions={<><a className="bouton" href="/vehicules/sortis">Sortis et vendus</a><a className="bouton" href="/export/vehicules">Exporter</a></>}>
      <details className="formulaire carte" open={!tous?.length}>
        <summary className="bouton principal">+ Ajouter un véhicule</summary>
        <Formulaire action={ajouterVehicule} className="grille">
          <Scanner genre="carte_grise" agenceId={profil.agence_id} champChemin="carte_grise_path" libelle="Photo de la carte grise : remplissage automatique" />
          <input type="hidden" name="carte_grise_path" />
          <label>Immatriculation *<input name="immatriculation" placeholder="AB-123-CD" required /></label>
          <label>Marque<input name="marque" placeholder="Peugeot" /></label>
          <label>Modèle<input name="modele" placeholder="208" /></label>
          <label>Carburant<select name="carburant" defaultValue=""><option value="">—</option>
            {Object.entries(carburants).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Kilométrage<input name="km" type="number" min={0} inputMode="numeric" /></label>
          <label>Prix par jour (€)<input name="prix_jour" type="number" min={0} step="0.01" inputMode="decimal" /></label>
          <label>Fin d&apos;assurance<input name="assurance_echeance" type="date" /></label>
          <label>Prochain contrôle technique<input name="ct_echeance" type="date" /></label>
          <label>Financement<select name="financement" defaultValue=""><option value="">—</option>
            {Object.entries(financements).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Coût mensuel (€)<input name="cout_mensuel" type="number" min={0} step="0.01" inputMode="decimal" placeholder="Loyer, crédit ou amortissement" /></label>
          <label>Entré dans la flotte le<input name="date_entree" type="date" /></label>
          <Envoyer>Ajouter le véhicule</Envoyer>
        </Formulaire>
        <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>La photo de la carte grise est rangée dans la fiche. Assurance et contrôle technique s&apos;ajoutent ensuite sur la fiche.</p>
      </details>

      <div className="filtres">
        <a href="/vehicules" className={!searchParams.statut ? 'actif' : ''}>Tous</a>
        {Object.entries(statutVehicule).filter(([k]) => k !== 'sorti').map(([k, v]) => (
          <a key={k} href={`/vehicules?statut=${k}`} className={searchParams.statut === k ? 'actif' : ''}>{v} ({compte(k)})</a>
        ))}
        <form style={{ flex: '1 1 180px' }}><input name="q" defaultValue={searchParams.q} placeholder="Rechercher une immatriculation…" /></form>
      </div>

      <div className="tableau">
        <table>
          <thead><tr><th>Immat</th><th>Véhicule</th><th>Statut</th><th className="masque-mobile">Km</th><th className="masque-mobile">Papiers</th></tr></thead>
          <tbody>
            {vehicules.map((v: any) => {
              const a = echeance(v.assurance_echeance); const c = echeance(v.ct_echeance);
              const pire = a === 'depasse' || c === 'depasse' ? 'depasse' : a || c;
              return (
                <tr key={v.id}>
                  <td><a className="bloc" href={`/vehicules/${v.id}`}><b>{v.immatriculation}</b></a></td>
                  <td><a className="bloc" href={`/vehicules/${v.id}`}>{[v.marque, v.modele].filter(Boolean).join(' ') || '—'}</a></td>
                  <td><span className={`pastille ${v.statut}`}>{statutVehicule[v.statut]}</span></td>
                  <td className="masque-mobile">{km(v.km)}</td>
                  <td className="masque-mobile">
                    {!v.assurance_echeance && !v.ct_echeance ? <span className="gris">À compléter</span>
                      : <span className={`pastille ${pire || 'ok'}`}>{pire === 'depasse' ? 'Expiré' : pire === 'proche' ? 'Bientôt' : 'À jour'}{pire && ` · ${date(a ? v.assurance_echeance : v.ct_echeance)}`}</span>}
                  </td>
                </tr>
              );
            })}
            {!vehicules.length && <tr><td colSpan={5} className="vide">Aucun véhicule.</td></tr>}
          </tbody>
        </table>
      </div>
    </Cadre>
  );
}
