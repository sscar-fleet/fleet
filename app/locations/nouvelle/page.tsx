import { utilisateurCourant } from '@/lib/agence';
import { versLocal, euros } from '@/lib/format';
import { creerLocation } from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import ChampsClient from '../../_c/ChampsClient';
import Etapes from '../../_c/Etapes';

export const dynamic = 'force-dynamic';

// Nouvelle location en 3 étapes + récapitulatif
export default async function NouvelleLocation({ searchParams }: { searchParams: { vehicule?: string; client?: string } }) {
  const { supabase, profil } = await utilisateurCourant();
  const [{ data: vehicules }, { data: clients }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, prix_jour').not('statut', 'in', '(hors_service,sorti)').order('immatriculation'),
    supabase.from('clients').select('id, nom, prenom, telephone, liste_noire').order('nom'),
  ]);
  const depart = new Date(); depart.setMinutes(0, 0, 0); depart.setHours(depart.getHours() + 1);
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
      <Formulaire action={creerLocation} succes="Réservation créée">
        <Etapes titres={['Voiture et dates', 'Client', 'Prix', 'Vérifier']} recap={[
          { libelle: 'Véhicule', champ: 'vehicule_id' }, { libelle: 'Départ', champ: 'debut' }, { libelle: 'Retour', champ: 'fin_prevue' },
          { libelle: 'Client', champ: 'client_id' }, { libelle: 'Nouveau client', champ: 'nom' }, { libelle: 'Téléphone', champ: 'telephone' },
          { libelle: 'Prix', champ: 'prix_total', suffixe: ' €' }, { libelle: 'Caution', champ: 'caution_montant', suffixe: ' €' },
        ]} />
        <section className="carte" data-etape="0">
          <h2>Quelle voiture, et quand ?</h2>
          <div className="grille">
            <label className="pleine">Véhicule<select name="vehicule_id" defaultValue={searchParams.vehicule ?? ''} required>
              <option value="">Choisir…</option>
              {vehicules.map((v: any) => (
                <option key={v.id} value={v.id}>{v.immatriculation} · {[v.marque, v.modele].filter(Boolean).join(' ')}{v.prix_jour ? ` · ${euros(v.prix_jour)}/jour` : ''}{v.statut !== 'disponible' ? ` (${v.statut === 'loue' ? 'actuellement loué' : 'en maintenance'})` : ''}</option>
              ))}
            </select></label>
            <label>Départ<input name="debut" type="datetime-local" defaultValue={versLocal(depart.toISOString())} required /></label>
            <label>Retour prévu<input name="fin_prevue" type="datetime-local" defaultValue={versLocal(retour.toISOString())} required /></label>
          </div>
        </section>
        <section className="carte" data-etape="1">
          <h2>Pour quel client ?</h2>
          <div className="grille">
            <label className="pleine">Client déjà connu<select name="client_id" defaultValue={searchParams.client ?? ''}>
              <option value="">— Nouveau client —</option>
              {clients?.map((c: any) => <option key={c.id} value={c.id}>{c.nom} {c.prenom ?? ''}{c.telephone ? ' · ' + c.telephone : ''}{c.liste_noire ? ' ⚑ LISTE NOIRE' : ''}</option>)}
            </select></label>
          </div>
          {!searchParams.client && <>
            <p className="gris" style={{ margin: '14px 0 8px' }}>Nouveau client : prenez son permis en photo, les champs se remplissent tout seuls.</p>
            <div className="grille"><ChampsClient obligatoire={false} agenceId={profil.agence_id} /></div>
          </>}
        </section>
        <section className="carte" data-etape="2">
          <h2>Prix et caution</h2>
          <div className="grille">
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
        <span data-valider><Envoyer>Créer la réservation</Envoyer></span>
      </Formulaire>
    </Cadre>
  );
}
