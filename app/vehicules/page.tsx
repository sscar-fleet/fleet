import OuvrirFormulaire from '@/app/_c/OuvrirFormulaire';
import { utilisateurCourant, liensFichiers } from '@/lib/agence';
import { statutVehicule, carburants, km, echeance, date, plaque } from '@/lib/format';
import ProvenanceVehicule from '../_c/ProvenanceVehicule';
import { ajouterVehicule } from '../actions';
import Cadre from '../_c/Cadre';
import Formulaire from '../_c/Formulaire';
import Scanner from '../_c/Scanner';
import ApercuModele from '../_c/ApercuModele';
import LogoMarque from '../_c/LogoMarque';
import Envoyer from '../_c/Envoyer';

export const dynamic = 'force-dynamic';

export default async function Vehicules({ searchParams }: { searchParams: { statut?: string; q?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const { data: tous } = await supabase.from('vehicules')
    .select('id, immatriculation, marque, modele, statut, km, assurance_echeance, ct_echeance, photo_path').order('immatriculation');
  const q = (searchParams.q ?? '').toLowerCase().trim();
  const vehicules = (tous ?? []).filter((v: any) =>
    (searchParams.statut ? v.statut === searchParams.statut : v.statut !== 'sorti') &&
    (!q || `${plaque(v.immatriculation)} ${v.marque ?? ''} ${v.modele ?? ''}`.toLowerCase().includes(q)));
  const photos = await liensFichiers(supabase, vehicules.map((v: any) => v.photo_path));
  const compte = (s: string) => (tous ?? []).filter((v: any) => v.statut === s).length;

  return (
    <Cadre titre={`Véhicules (${(tous ?? []).filter((v: any) => v.statut !== 'sorti').length})`} tables={['vehicules']}
      actions={<><a className="bouton" href="/vehicules/sortis">Sortis et vendus</a><a className="bouton" href="/export/vehicules">Exporter</a><OuvrirFormulaire>+ Ajouter un véhicule</OuvrirFormulaire></>}>
      <details className="formulaire carte formulaire-haut" open={!tous?.length}>
        <summary>Nouveau véhicule</summary>
        <Formulaire action={ajouterVehicule} className="grille" succes="Véhicule ajouté">
          <Scanner genre="carte_grise" agenceId={profil.agence_id} champChemin="carte_grise_path" libelle="Carte grise" />
          <input type="hidden" name="carte_grise_path" />
          <label>Immatriculation *<input name="immatriculation" placeholder="AB123CD" required autoCapitalize="characters" autoComplete="off" /></label>
          <label>Marque *<input name="marque" placeholder="Peugeot" required /></label>
          <label>Modèle *<input name="modele" placeholder="208" required /></label>
          <ApercuModele />
          <label>Kilométrage<input name="km" type="number" min={0} inputMode="numeric" /></label>
          <ProvenanceVehicule />
          <details className="options pleine">
            <summary>+ Plus d&apos;options (prix, papiers, coût du véhicule)</summary>
            <div className="grille">
              <label>Prix par jour (€)<input name="prix_jour" type="number" min={0} step="0.01" inputMode="decimal" /></label>
              <label>Carburant<select name="carburant" defaultValue=""><option value="">—</option>
                {Object.entries(carburants).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>Fin d&apos;assurance<input name="assurance_echeance" type="date" /></label>
              <label>Prochain contrôle technique<input name="ct_echeance" type="date" /></label>
              <label data-cout>Coût mensuel (€)<input name="cout_mensuel" type="number" min={0} step="0.01" inputMode="decimal" placeholder="Loyer, crédit ou amortissement" /></label>
              <label data-cout>Prix d&apos;achat (€)<input name="prix_achat" type="number" min={0} step="0.01" inputMode="decimal" placeholder="Si acheté comptant" /></label>
              <label>Entré dans la flotte le<input name="date_entree" type="date" /></label>
            </div>
          </details>
          <Envoyer>Ajouter le véhicule</Envoyer>
        </Formulaire>
        <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>La photo de la carte grise est rangée dans la fiche, et une photo du modèle est trouvée automatiquement. Assurance et contrôle technique s&apos;ajoutent ensuite sur la fiche.</p>
      </details>

      <div className="filtres">
        <a href="/vehicules" className={!searchParams.statut ? 'actif' : ''}>Tous</a>
        {Object.entries(statutVehicule).filter(([k]) => k !== 'sorti').map(([k, v]) => (
          <a key={k} href={`/vehicules?statut=${k}`} className={searchParams.statut === k ? 'actif' : ''}>{v} ({compte(k)})</a>
        ))}
        <form style={{ flex: '1 1 180px' }}><input name="q" defaultValue={searchParams.q} placeholder="Rechercher une immatriculation…" /></form>
      </div>

      <div className="tableau">
        <table className="cartes">
          <thead><tr><th>Immat</th><th>Véhicule</th><th>Statut</th><th className="masque-mobile">Km</th><th className="masque-mobile">Papiers</th></tr></thead>
          <tbody>
            {vehicules.map((v: any) => {
              const a = echeance(v.assurance_echeance); const c = echeance(v.ct_echeance);
              const pire = a === 'depasse' || c === 'depasse' ? 'depasse' : a || c;
              return (
                <tr key={v.id}>
                  <td><a className="bloc ligne" href={`/vehicules/${v.id}`} style={{ flexWrap: 'nowrap' }}>{photos[v.photo_path] ? <img className="vignette" src={photos[v.photo_path]} alt="" /> : <LogoMarque marque={v.marque} modele={v.modele} />}<b>{plaque(v.immatriculation)}</b></a></td>
                  <td><a className="bloc" href={`/vehicules/${v.id}`}>{[v.marque, v.modele].filter(Boolean).join(' ') || '—'}</a></td>
                  <td><span className={`pastille ${v.statut}`}>{statutVehicule[v.statut]}</span>{v.financement === 'pret' ? <span className="pastille" style={{ marginLeft: 6 }} title={v.pret_par ? `Prêté par ${v.pret_par}` : 'Prêté par un confrère'}>Prêt</span> : null}</td>
                  <td className="masque-mobile">{km(v.km)}</td>
                  <td className="masque-mobile">
                    {!v.assurance_echeance && !v.ct_echeance ? <span className="gris">À compléter</span>
                      : <span className={`pastille ${pire || 'ok'}`}>{pire === 'depasse' ? 'Expiré' : pire === 'proche' ? 'Bientôt' : 'À jour'}{pire && ` · ${date(a ? v.assurance_echeance : v.ct_echeance)}`}</span>}
                  </td>
                </tr>
              );
            })}
            {!vehicules.length && <tr><td colSpan={5}><div className="vide-guide"><b>{tous?.length ? 'Aucun véhicule dans ce filtre' : 'Ajoutez votre premier véhicule'}</b>{tous?.length ? 'Changez de filtre ou de recherche.' : 'Prenez la carte grise en photo : marque, modèle et immatriculation se remplissent seuls.'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Cadre>
  );
}
