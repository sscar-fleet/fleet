import { supabaseAdmin, adminConfigure } from '@/lib/supabaseAdmin';
import { stripeConfigure, modeTest, OPTIONS } from '@/lib/stripe';
import * as P from '../paiements/actions';
import Formulaire from '../_c/Formulaire';
import Envoyer from '../_c/Envoyer';

const MESSAGES: Record<string, string> = {
  ok: 'Compte Stripe relié : vous pouvez encaisser vos clients en ligne.',
  incomplet: 'Il manque encore des informations chez Stripe pour activer les paiements.',
  annule: 'Connexion annulée.', refus: 'Seul le gérant peut relier le compte Stripe.', erreur: 'Stripe n’a pas répondu. Réessayez.',
  deja: 'Ce compte Stripe est déjà relié à une autre agence.', absent: 'Aucun compte Stripe à relier.',
};

// Réglages > Paiements en ligne : relier son compte Stripe, puis choisir ce qu'on propose aux clients
export default async function PaiementsEnLigne({ agence, gerant, retour }: { agence: any; gerant: boolean; retour?: string }) {
  if (!stripeConfigure() || !adminConfigure()) {
    return (
      <section className="carte" id="paiements" style={{ marginTop: 16 }}>
        <h2>Paiements en ligne</h2>
        <p className="gris" style={{ marginBottom: 0 }}>Bientôt : encaissez vos locations, cautions, prolongations et frais par carte, directement sur votre compte.</p>
      </section>
    );
  }
  const { data: sc } = await supabaseAdmin().from('stripe_comptes').select('compte, pret, virements, relie_par').eq('agence_id', agence.id).maybeSingle();
  const options = agence.paiements ?? {};
  const actives = OPTIONS.filter((o) => options[o.cle]).length;

  return (
    <section className="carte" id="paiements" style={{ marginTop: 16 }}>
      <h2>Paiements en ligne {modeTest() && <span className="pastille a_prendre" style={{ fontSize: 12, verticalAlign: 'middle' }}>Mode test</span>}</h2>
      {retour && MESSAGES[retour] && <p className={retour === 'ok' ? 'succes' : 'erreur'} style={{ marginTop: 0 }}>{MESSAGES[retour]}</p>}
      <p className="gris" style={{ fontSize: 13.5, marginTop: 0 }}>
        Vos clients paient par carte, l&apos;argent arrive directement sur <b>votre</b> compte Stripe : Fleet ne le touche jamais et ne prend aucune commission. Seuls les frais Stripe s&apos;appliquent.
      </p>

      {!sc && (gerant ? (
        <div className="ligne" style={{ flexWrap: 'wrap' }}>
          <Formulaire action={P.connecterStripe} succes={false}><Envoyer className="bouton principal">Créer mon compte Stripe</Envoyer></Formulaire>
          {process.env.STRIPE_CONNECT_CLIENT_ID && <Formulaire action={P.connecterExistant} succes={false}><Envoyer className="bouton">J&apos;ai déjà un compte Stripe</Envoyer></Formulaire>}
        </div>
      ) : <p className="gris">Le gérant de l&apos;agence peut activer les paiements en ligne.</p>)}

      {sc && !sc.pret && (
        <div className="alerte-caution">
          <span>Votre compte Stripe est créé, mais Stripe attend encore quelques informations (identité, IBAN) avant d&apos;activer les paiements.</span>
          {gerant && <Formulaire action={P.connecterStripe} succes={false}><Envoyer className="bouton petit principal">Terminer chez Stripe</Envoyer></Formulaire>}
        </div>
      )}

      {sc?.pret && <>
        <p style={{ marginTop: 0 }}><span className="pastille ok">Compte Stripe relié</span>
          {!sc.virements && <span className="gris"> · virements vers votre banque pas encore activés par Stripe</span>}
          {' '}<a className="lien" href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">Ouvrir mon espace Stripe</a></p>
        <Formulaire action={P.optionsPaiement} className="grille" succes={false}>
          <p className="pleine" style={{ margin: 0 }}><b>Ce que vous proposez à vos clients</b> <span className="gris">({actives} sur {OPTIONS.length})</span></p>
          {OPTIONS.map((o) => (
            <label key={o.cle} className="case pleine" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" name={o.cle} defaultChecked={!!options[o.cle]} disabled={!gerant} />
              <span><b>{o.titre}</b><br /><span className="gris" style={{ fontSize: 13 }}>{o.detail}</span></span>
            </label>
          ))}
          {gerant && <Envoyer className="bouton">Enregistrer</Envoyer>}
        </Formulaire>
      </>}
    </section>
  );
}
