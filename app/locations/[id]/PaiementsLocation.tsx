import { supabaseAdmin, adminConfigure } from '@/lib/supabaseAdmin';
import { stripeConfigure, JOURS_EMPREINTE } from '@/lib/stripe';
import { lienWhatsApp } from '@/lib/whatsapp';
import { euros, dateHeure, joursEntre } from '@/lib/format';
import * as P from '../../paiements/actions';
import Formulaire from '../../_c/Formulaire';
import Envoyer from '../../_c/Envoyer';
import Copier from '../../_c/Copier';

const STATUT: Record<string, [string, string]> = {
  en_attente: ['Lien envoyé, pas encore payé', 'a_prendre'], paye: ['Payé', 'ok'], autorise: ['Caution bloquée sur la carte', 'prise'],
  carte_enregistree: ['Carte enregistrée en garantie', 'prise'], retenu: ['Caution retenue', 'ok'], libere: ['Caution rendue', 'termine'],
  rembourse: ['Remboursé', 'termine'], echoue: ['Échoué', 'depasse'], expire: ['Lien expiré', 'termine'], annule: ['Annulé', 'termine'],
};
const TYPE: Record<string, string> = { location: 'Location', caution: 'Caution', prolongation: 'Prolongation', frais: 'Frais' };

// Onglet « Paiements » d'une location : envoyer un lien de paiement, gérer la caution par carte, rembourser
export default async function PaiementsLocation({ l, agenceId, options, client }: { l: any; agenceId: string; options: Record<string, boolean>; client: any }) {
  if (!stripeConfigure() || !adminConfigure()) return null;
  const admin = supabaseAdmin();
  const [{ data: sc }, { data: paiements }] = await Promise.all([
    admin.from('stripe_comptes').select('pret').eq('agence_id', agenceId).maybeSingle(),
    admin.from('paiements').select('*').eq('location_id', l.id).eq('agence_id', agenceId).order('created_at', { ascending: false }),
  ]);
  const liste: any[] = paiements ?? [];
  const actif = !!sc?.pret && Object.values(options ?? {}).some(Boolean);
  if (!actif && !liste.length) {
    return (
      <section className="carte">
        <h2>Paiements en ligne</h2>
        <p className="gris">Encaissez la location, la caution, une prolongation ou des frais par carte, sur votre compte.</p>
        <a className="bouton" href="/parametres#paiements">Activer dans Réglages</a>
      </section>
    );
  }
  const ouverte = l.statut === 'reservee' || l.statut === 'en_cours';
  const dejaPaye = liste.filter((p) => p.type === 'location' && p.statut === 'paye').reduce((t, p) => t + Number(p.montant), 0);
  const resteLocation = Math.max(0, Number(l.prix_total ?? 0) - dejaPaye);
  const cautionActive = liste.find((p) => p.type === 'caution' && ['autorise', 'carte_enregistree'].includes(p.statut));
  const carte = liste.find((p) => p.statut === 'carte_enregistree');
  const longue = joursEntre(new Date().toISOString(), l.fin_prevue) > JOURS_EMPREINTE;
  const message = (p: any) => `Bonjour ${client?.prenom ?? ''}, voici le lien sécurisé pour régler : ${p.libelle} (${euros(p.montant)}). ${p.lien}`;

  const formulaire = (type: 'location' | 'caution' | 'prolongation' | 'frais', titre: string, aide: string, montant?: number | null, motif?: string) => (
    <details className="formulaire">
      <summary className="bouton">{titre}</summary>
      <Formulaire action={P.demanderPaiement.bind(null, l.id, type)} className="grille" succes={false}>
        <p className="gris pleine" style={{ margin: 0, fontSize: 13.5 }}>{aide}</p>
        <label>Montant (€)<input name="montant" type="number" step="0.01" min={0.5} defaultValue={montant ? Number(montant).toFixed(2) : ''} required /></label>
        {motif !== undefined && <label>{type === 'frais' ? 'Motif' : 'Détail'}<input name="motif" placeholder={motif} required={type === 'frais'} /></label>}
        <Envoyer className="bouton principal">Créer le lien de paiement</Envoyer>
      </Formulaire>
    </details>
  );

  return (
    <section className="carte">
      <h2>Paiements en ligne</h2>
      {actif && <div className="ligne" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {options.location && resteLocation > 0 && formulaire('location', `Faire payer la location (${euros(resteLocation)})`, 'Le client reçoit un lien et paie par carte. L’argent arrive sur votre compte Stripe.', resteLocation)}
        {options.caution && ouverte && !cautionActive && formulaire('caution', 'Prendre la caution par carte',
          longue ? `Location longue : la carte du client est enregistrée, et débitée seulement en cas de dégâts, même après le retour.` : `Le montant est bloqué sur la carte du client (sans être débité) et libéré au retour.`, l.caution_montant)}
        {options.prolongation && ouverte && formulaire('prolongation', 'Faire payer une prolongation', 'Pensez aussi à prolonger la date de retour dans l’onglet Modifier.', null, '2 jours supplémentaires')}
        {options.frais && formulaire('frais', 'Faire payer des frais', 'Dégâts, carburant manquant, retard, frais d’amende…', null, 'Carburant manquant')}
        {options.frais && carte && (
          <details className="formulaire">
            <summary className="bouton">Débiter la carte enregistrée</summary>
            <Formulaire action={P.debiterCarte.bind(null, l.id)} className="grille" succes={false} confirmer="Débiter ce montant sur la carte du client ?">
              <p className="gris pleine" style={{ margin: 0, fontSize: 13.5 }}>Débit immédiat sur la carte laissée en garantie. Prévenez le client avant.</p>
              <label>Montant (€)<input name="montant" type="number" step="0.01" min={0.5} required /></label>
              <label>Motif<input name="motif" placeholder="Rayure portière arrière" required /></label>
              <Envoyer className="bouton principal">Débiter</Envoyer>
            </Formulaire>
          </details>
        )}
      </div>}

      {!liste.length && <p className="gris">Aucun paiement en ligne pour cette location.</p>}
      {liste.map((p) => {
        const [lib, classe] = STATUT[p.statut] ?? [p.statut, ''];
        return (
          <div key={p.id} className="fichier" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span><b>{TYPE[p.type]} · {euros(p.montant)}</b> <span className={`pastille ${classe}`}>{lib}</span><br />
              <span className="gris" style={{ fontSize: 13 }}>{p.libelle} · {dateHeure(p.paye_le ?? p.created_at)}
                {p.retenu ? ` · ${euros(p.retenu)} retenus${p.motif ? ' : ' + p.motif : ''}` : ''}
                {p.statut === 'en_attente' && p.expire_le ? ` · lien valable jusqu’au ${dateHeure(p.expire_le)}` : ''}</span></span>
            <span className="ligne" style={{ flexWrap: 'wrap' }}>
              {p.statut === 'en_attente' && p.lien && <>
                {client?.telephone && <a className="bouton petit principal" target="_blank" rel="noreferrer" href={lienWhatsApp(client.telephone, message(p))}>WhatsApp</a>}
                {client?.email && <a className="bouton petit" href={`mailto:${client.email}?subject=${encodeURIComponent(p.libelle)}&body=${encodeURIComponent(message(p))}`}>E-mail</a>}
                <Copier texte={p.lien} />
                <Formulaire action={P.annulerLien.bind(null, p.id)} succes={false} confirmer="Annuler ce lien de paiement ?"><Envoyer className="bouton petit">Annuler</Envoyer></Formulaire>
              </>}
              {['autorise', 'carte_enregistree'].includes(p.statut) && <>
                <Formulaire action={P.libererCaution.bind(null, p.id)} succes={false} confirmer="Rendre la caution au client ?"><Envoyer className="bouton petit principal">Rendre la caution</Envoyer></Formulaire>
                <details className="formulaire">
                  <summary className="bouton petit">Garder une partie</summary>
                  <Formulaire action={P.retenirCaution.bind(null, p.id)} className="grille" succes={false} confirmer="Garder ce montant sur la caution ?">
                    <label>Montant gardé (€)<input name="montant" type="number" step="0.01" min={0.5} max={p.montant} required /></label>
                    <label>Motif<input name="motif" placeholder="Rayure, carburant manquant…" required /></label>
                    <Envoyer className="bouton principal">Garder</Envoyer>
                  </Formulaire>
                </details>
              </>}
              {['paye', 'retenu'].includes(p.statut) && p.stripe_intent && (
                <Formulaire action={P.rembourser.bind(null, p.id)} succes={false} confirmer={`Rembourser ${euros(p.statut === 'retenu' ? p.retenu : p.montant)} au client ?`}><Envoyer className="bouton petit">Rembourser</Envoyer></Formulaire>
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}
