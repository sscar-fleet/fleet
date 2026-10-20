import { utilisateurCourant } from '@/lib/agence';
import { versLocal, versJour, depuisParis, euros, plaque } from '@/lib/format';
import { creerLocation } from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import ChampsClient from '../../_c/ChampsClient';
import Etapes from '../../_c/Etapes';
import ChampDate from '../../_c/ChampDate';
import ChoixClient from '../../_c/ChoixClient';
import AideTarif from '../../_c/AideTarif';
import DispoVehicules from '../../_c/DispoVehicules';
import ChoixVoiture from '../../_c/ChoixVoiture';

export const dynamic = 'force-dynamic';

// Nouvelle location en 3 étapes + vérification
export default async function NouvelleLocation({ searchParams }: { searchParams: { vehicule?: string; client?: string; jour?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const [{ data: vehicules }, { data: clients }, { data: resas }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, prix_jour, assurance_echeance, ct_echeance').not('statut', 'in', '(hors_service,sorti)').order('immatriculation'),
    supabase.from('clients').select('id, nom, prenom, telephone, email, date_permis, liste_noire, permis_path').order('nom'),
    supabase.from('locations').select('vehicule_id, debut, fin_prevue, numero').in('statut', ['reservee', 'en_cours']),
  ]);
  let depart = new Date(); depart.setMinutes(0, 0, 0); depart.setHours(depart.getHours() + 1);
  // Depuis le planning : la date de la case cliquée, à 10 h (ou dans l'heure si c'est aujourd'hui)
  if (searchParams.jour && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.jour) && searchParams.jour > versJour(new Date())) depart = new Date(depuisParis(searchParams.jour + 'T10:00')!);
  const retour = new Date(depart.getTime() + 24 * 3600 * 1000);

  if (!vehicules?.length) {
    return (
      <Cadre retour={{ lien: '/locations', texte: 'Locations' }} titre="Nouvelle location">
        <div className="carte vide-guide"><b>Ajoutez d&apos;abord un véhicule</b>Une location se fait toujours sur un véhicule de votre flotte.
          <br /><a className="bouton principal" href="/vehicules">Ajouter un véhicule</a></div>
      </Cadre>
    );
  }

  return (
    <Cadre retour={{ lien: '/locations', texte: 'Locations' }} titre="Nouvelle location">
      <Formulaire action={creerLocation} succes="Réservation créée"
        confirmerSiVide={{ champ: 'caution_montant', message: 'Aucune caution n’est remplie. Êtes-vous sûr de continuer sans caution ?' }}>
        <Etapes titres={['Voiture et dates', 'Client', 'Prix', 'Vérifier']} recap={[
          { libelle: 'Véhicule', champ: 'vehicule_id' }, { libelle: 'Départ', champ: 'debut' }, { libelle: 'Retour', champ: 'fin_prevue' },
          { libelle: 'Client', champ: 'client_id' }, { libelle: 'Nouveau client', champ: 'nom' }, { libelle: 'Téléphone', champ: 'telephone' },
          { libelle: 'Prix', champ: 'prix_total', suffixe: ' €', alerteSiVide: 'Calculé avec le prix par jour' },
          { libelle: 'Caution', champ: 'caution_montant', suffixe: ' €', alerteSiVide: 'Aucune caution' },
        ]}>
          <section className="carte" data-etape="0">
            <h2>Quelle voiture, et quand ?</h2>
            <DispoVehicules reservations={(resas ?? []).map((r: any) => ({ vehicule_id: r.vehicule_id, debut: r.debut, fin: r.fin_prevue, numero: r.numero }))} />
            <div className="grille" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <ChampDate name="debut" libelle="Départ" defaut={versLocal(depart.toISOString())} mode="depart" />
              <ChampDate name="fin_prevue" libelle="Retour" defaut={versLocal(retour.toISOString())} mode="retour" depuis="debut" />
              <select name="vehicule_id" className="select-masque" defaultValue={searchParams.vehicule ?? ''} required aria-label="Véhicule" tabIndex={-1}>
                <option value="">Choisir…</option>
                {vehicules.map((v: any) => (
                  <option key={v.id} value={v.id} data-prix={v.prix_jour ?? ''} data-nom={`${[v.marque, v.modele].filter(Boolean).join(' ')} ${plaque(v.immatriculation)}`}>
                    {plaque(v.immatriculation)} · {[v.marque, v.modele].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
              <ChoixVoiture voitures={vehicules.map((v: any) => ({ id: v.id, marque: v.marque, modele: v.modele, plaque: plaque(v.immatriculation),
                prix: v.prix_jour ? euros(v.prix_jour) : null, note: v.statut === 'maintenance' ? 'En maintenance aujourd’hui' : null,
                echeances: [v.assurance_echeance && { libelle: 'Assurance', date: v.assurance_echeance }, v.ct_echeance && { libelle: 'Contrôle technique', date: v.ct_echeance }].filter(Boolean) }))} />
            </div>
          </section>
          <section className="carte" data-etape="1">
            <h2>Pour quel client ?</h2>
            <div className="grille">
              <ChoixClient clients={(clients ?? []) as any} defaut={searchParams.client} />
            </div>
            <div data-nouveau-client>
              <p className="gris" style={{ margin: '14px 0 8px' }}>Nouveau client : prenez son permis en photo, les champs se remplissent tout seuls.</p>
              <div className="grille"><ChampsClient obligatoire={false} agenceId={profil.agence_id} clients={(clients ?? []).map((x: any) => ({ id: x.id, nom: x.nom, prenom: x.prenom, telephone: x.telephone }))} /></div>
            </div>
          </section>
          <section className="carte" data-etape="2">
            <h2>Prix et caution</h2>
            <div className="grille">
              <AideTarif />
              <label>Prix total (€)<input name="prix_total" type="number" step="0.01" min={0} placeholder="Calculé avec le prix par jour" inputMode="decimal" /></label>
              <label>Caution (€)<input name="caution_montant" type="number" step="0.01" min={0} inputMode="decimal" /></label>
            </div>
            <details className="options">
              <summary>+ Plus d&apos;options (kilomètres, note)</summary>
              <div className="grille">
                <label>Km inclus<input name="km_inclus" type="number" min={0} placeholder="Illimités si vide" inputMode="numeric" /></label>
                <label>Prix du km en plus (€)<input name="prix_km_sup" type="number" step="0.01" min={0} inputMode="decimal" /></label>
                <label className="pleine">Note<input name="note" placeholder="Livraison, siège bébé…" /></label>
              </div>
            </details>
          </section>
        </Etapes>
        <span data-valider><Envoyer>Créer la réservation</Envoyer></span>
      </Formulaire>
    </Cadre>
  );
}
