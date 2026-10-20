import { utilisateurCourant } from '@/lib/agence';
import { versLocal, versJour, euros, JOUR, plaque, tel } from '@/lib/format';
import { creerDevis } from '../../actions';
import Cadre from '../../_c/Cadre';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';

export const dynamic = 'force-dynamic';

export default async function NouveauDevis() {
  const { supabase } = await utilisateurCourant();
  const [{ data: vehicules }, { data: clients }] = await Promise.all([
    supabase.from('vehicules').select('id, immatriculation, marque, modele, prix_jour').not('statut', 'in', '(hors_service,sorti)').order('immatriculation'),
    supabase.from('clients').select('id, nom, prenom, telephone').order('nom'),
  ]);
  const depart = new Date(); depart.setMinutes(0, 0, 0); depart.setHours(depart.getHours() + 24);
  const retour = new Date(depart.getTime() + 3 * JOUR);
  return (
    <Cadre retour={{ lien: '/devis', texte: 'Devis' }} titre="Nouveau devis">
      <Formulaire action={creerDevis}>
        <section className="carte">
          <h2>Client</h2>
          <div className="grille">
            <label className="pleine">Client existant<select name="client_id" defaultValue="">
              <option value="">— Nouveau (remplir ci-dessous) —</option>
              {clients?.map((c: any) => <option key={c.id} value={c.id}>{c.nom} {c.prenom ?? ''}{c.telephone ? ' · ' + tel(c.telephone) : ''}</option>)}
            </select></label>
            <label>Nom<input name="client_nom" placeholder="Prénom Nom" /></label>
            <label>Téléphone<input name="telephone" type="tel" /></label>
            <label>E-mail<input name="email" type="email" /></label>
          </div>
        </section>
        <section className="carte">
          <h2>Location</h2>
          <div className="grille">
            <label className="pleine">Véhicule<select name="vehicule_id" defaultValue="">
              <option value="">À choisir plus tard</option>
              {vehicules?.map((v: any) => <option key={v.id} value={v.id}>{plaque(v.immatriculation)} · {[v.marque, v.modele].filter(Boolean).join(' ')}{v.prix_jour ? ` · ${euros(v.prix_jour)}/j` : ''}</option>)}
            </select></label>
            <label>Départ<input name="debut" type="datetime-local" defaultValue={versLocal(depart.toISOString())} required /></label>
            <label>Retour<input name="fin" type="datetime-local" defaultValue={versLocal(retour.toISOString())} required /></label>
            <label>Prix total (€)<input name="prix_total" type="number" step="0.01" min={0} placeholder="Auto : prix/jour × jours" /></label>
            <label>Km inclus<input name="km_inclus" type="number" min={0} placeholder="Illimités si vide" /></label>
            <label>Prix du km en plus (€)<input name="prix_km_sup" type="number" step="0.01" min={0} /></label>
            <label>Caution (€)<input name="caution" type="number" step="0.01" min={0} /></label>
            <label>Valable jusqu&apos;au<input name="valide_jusqu" type="date" defaultValue={versJour(new Date(Date.now() + 7 * JOUR))} /></label>
            <label className="pleine">Précisions<input name="note" placeholder="Livraison, siège bébé, conducteur additionnel…" /></label>
          </div>
        </section>
        <Envoyer>Créer le devis</Envoyer>
      </Formulaire>
    </Cadre>
  );
}
