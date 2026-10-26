import PageLegale from '../_c/PageLegale';

export const metadata = { title: 'Assistance · SS CAR FLEET' };

// Page d'assistance publique (demandée par l'App Store)
export default function Support() {
  return (
    <PageLegale titre="Assistance">
      <p>Une question, un souci de connexion ou une idée pour améliorer Fleet ? Écrivez-nous, nous répondons en général dans la journée.</p>
      <p><b>E-mail</b> : <a className="lien" href="mailto:fleet@sscarsystem.com">fleet@sscarsystem.com</a></p>
      <h2>Questions fréquentes</h2>
      <h3>Comment créer mon compte ?</h3>
      <p>Sur <a className="lien" href="/login">app.sscarfleet.com</a>, touchez « Créer un compte », choisissez votre activité (location ou transport) et donnez le nom de votre entreprise. Nous activons votre compte et vous recontactons pour la mise en place.</p>
      <h3>J&apos;ai oublié mon mot de passe</h3>
      <p>Sur la page de connexion, touchez « Mot de passe oublié ? » : un lien vous est envoyé par e-mail.</p>
      <h3>Je suis chauffeur, comment avoir l&apos;appli ?</h3>
      <p>Votre responsable vous envoie une invitation depuis Fleet. Ouvrez le lien, créez votre accès avec l&apos;adresse indiquée, puis connectez-vous dans l&apos;appli SS CAR FLEET.</p>
      <h3>Je ne reçois pas les notifications</h3>
      <p>Dans l&apos;appli, ouvrez Mon compte puis Notifications et vérifiez que les alertes voulues sont activées. Vérifiez aussi que les notifications de l&apos;appli sont autorisées dans les réglages de votre téléphone.</p>
      <h3>Supprimer mon compte</h3>
      <p>Écrivez-nous depuis l&apos;adresse de votre compte à <a className="lien" href="mailto:fleet@sscarsystem.com">fleet@sscarsystem.com</a> : votre compte et vos données sont supprimés sous 30 jours.</p>
      <p className="gris">SS CAR FLEET est édité par SS CAR SYSTEM DEVELOPPEMENT, 60 rue François 1er, 75008 Paris.</p>
    </PageLegale>
  );
}
