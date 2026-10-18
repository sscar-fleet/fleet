import { utilisateurCourant } from '@/lib/agence';
import { versLocal, euros } from '@/lib/format';
import { creerLocation } from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import ChampsClient from '../../_c/ChampsClient';

export const dynamic = 'force-dynamic';

export default async function NouvelleLocation({ searchParams }: { searchParams: { vehicule?: string; client?: string } }) {
  const { supabase } = await utilisateurCourant();
  const [{ data: vehicules }, { data: clients }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, prix_jour').not('statut', 'in', '(hors_service,sorti)').order('immatriculation'),
    supabase.from('clients').select('id, nom, prenom, telephone, liste_noire').order('nom'),
  ]);
  const depart = new Date(); depart.setMinutes(0, 0, 0); depart.setHours(depart.getHours() + 1);
  const retour = new Date(depart.getTime() + 24 * 3600 * 1000);

  return (
    <Cadre retour={{ lien: '/locations', texte: 'Locations' }} titre="Nouvelle location">
      {!vehicules?.length && <div className="alerte-bandeau">Ajoutez d&apos;abord un véhicule dans <a className="lien" href="/vehicules">Véhicules</a>.</div>}
      <Formulaire action={creerLocation}>
        <section className="carte">
          <h2>1. Véhicule et dates</h2>
          <div className="grille">
            <label className="pleine">Véhicule *<select name="vehicule_id" defaultValue={searchParams.vehicule ?? ''} required>
              <option value="">Choisir…</option>
              {vehicules?.map((v: any) => (
                <option key={v.id} value={v.id}>{v.immatriculation} · {[v.marque, v.modele].filter(Boolean).join(' ')}{v.prix_jour ? ` · ${euros(v.prix_jour)}/j` : ''}{v.statut !== 'disponible' ? ` (${v.statut === 'loue' ? 'actuellement loué' : 'en maintenance'})` : ''}</option>
              ))}
            </select></label>
            <label>Départ *<input name="debut" type="datetime-local" defaultValue={versLocal(depart.toISOString())} required /></label>
            <label>Retour prévu *<input name="fin_prevue" type="datetime-local" defaultValue={versLocal(retour.toISOString())} required /></label>
          </div>
        </section>
        <section className="carte">
          <h2>2. Client</h2>
          <div className="grille">
            <label className="pleine">Client existant<select name="client_id" defaultValue={searchParams.client ?? ''}>
              <option value="">— Nouveau client (remplir ci-dessous) —</option>
              {clients?.map((c: any) => <option key={c.id} value={c.id}>{c.nom} {c.prenom ?? ''}{c.telephone ? ' · ' + c.telephone : ''}{c.liste_noire ? ' ⚑ LISTE NOIRE' : ''}</option>)}
            </select></label>
          </div>
          {!searchParams.client && (
            <details className="formulaire" style={{ marginTop: 12 }} open={!clients?.length}>
              <summary className="bouton petit">Nouveau client</summary>
              <div className="grille"><ChampsClient obligatoire={false} /></div>
            </details>
          )}
          <p className="gris" style={{ fontSize: 13, marginBottom: 0 }}>Le permis et la pièce d&apos;identité se scannent sur la fiche de la location.</p>
        </section>
        <section className="carte">
          <h2>3. Prix, kilomètres et caution</h2>
          <div className="grille">
            <label>Prix total (€)<input name="prix_total" type="number" step="0.01" min={0} placeholder="Auto : prix/jour × jours" inputMode="decimal" /></label>
            <label>Km inclus<input name="km_inclus" type="number" min={0} placeholder="Illimité si vide" inputMode="numeric" /></label>
            <label>Prix du km en plus (€)<input name="prix_km_sup" type="number" step="0.01" min={0} inputMode="decimal" /></label>
            <label>Caution (€)<input name="caution_montant" type="number" step="0.01" min={0} inputMode="decimal" /></label>
            <label className="pleine">Note<input name="note" placeholder="Livraison, siège bébé…" /></label>
          </div>
        </section>
        <Envoyer>Créer la réservation</Envoyer>
      </Formulaire>
    </Cadre>
  );
}
