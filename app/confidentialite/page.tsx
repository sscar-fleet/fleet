import PageLegale from '../_c/PageLegale';

export const metadata = { title: 'Confidentialité · SS CAR FLEET' };

export default function Confidentialite() {
  return (
    <PageLegale titre="Politique de confidentialité">
      <h2>Qui fait quoi</h2>
      <p>SS CAR FLEET est un logiciel édité par <b>SS CAR SYSTEM DEVELOPPEMENT</b>, SAS immatriculée au RCS de Paris sous le numéro 941 416 372,
        dont le siège est au 60 rue François 1er, 75008 Paris. Contact : <a className="lien" href="mailto:fleet@sscarsystem.com">fleet@sscarsystem.com</a>.</p>
      <p>Le <b>loueur</b> qui utilise Fleet est responsable des données de ses propres clients (article 4 du RGPD). SS CAR SYSTEM DEVELOPPEMENT agit
        pour lui en tant que <b>sous-traitant</b> (article 28 du RGPD) : nous hébergeons et traitons ces données uniquement pour faire fonctionner Fleet,
        sur ses instructions, et ne les utilisons jamais pour notre propre compte.</p>

      <h2>Données traitées</h2>
      <ul>
        <li><b>Clients du loueur</b> : identité, coordonnées, date de naissance, numéro et date du permis, copies du permis et de la pièce d&apos;identité,
          historique des locations, signatures, amendes.</li>
        <li><b>Véhicules</b> : immatriculation, papiers (carte grise, assurance, contrôle technique), photos des états des lieux, dommages, position GPS au moment de l&apos;état des lieux.</li>
        <li><b>Chauffeurs</b> (version transport) : identité, téléphone, date et lieu de naissance, adresse, numéro et date du permis, photo du permis,
          tournées effectuées, photos des bons de livraison et des sinistres, position GPS du camion pendant les tournées.</li>
        <li><b>Utilisateurs de Fleet</b> (loueur, transporteur, employés, chauffeurs) : nom, e-mail, mot de passe chiffré, actions effectuées,
          identifiant de l&apos;appareil pour les notifications (si elles sont activées).</li>
      </ul>

      <h2>Pourquoi</h2>
      <p>Gérer les réservations, les contrats et les factures, prouver l&apos;état du véhicule au départ et au retour, désigner le conducteur en cas d&apos;amende,
        et suivre la rentabilité de la flotte. Base légale : l&apos;exécution du contrat de location et l&apos;intérêt légitime du loueur (preuve, recouvrement),
        ainsi que ses obligations légales (désignation du conducteur).</p>

      <h2>Où sont les données</h2>
      <p>La base de données et les fichiers (photos, documents) sont hébergés par <b>Supabase</b> dans l&apos;Union européenne, à <b>Paris</b>.
        Le site est servi par <b>Vercel</b>. La lecture automatique des papiers envoie la photo du document à un service d&apos;intelligence artificielle
        (<b>Anthropic</b>) uniquement pour en extraire le texte ; la photo n&apos;est pas conservée par ce service pour entraîner ses modèles.</p>
      <p>Les fichiers sont privés : chaque loueur ne voit que les siens, et les liens vers les documents expirent au bout d&apos;une heure.</p>

      <h2>Combien de temps</h2>
      <ul>
        <li>Copies du permis et de la pièce d&apos;identité : pendant la relation avec le client, puis <b>1 an au plus après sa dernière location</b>
          (délai utile pour désigner le conducteur en cas d&apos;amende).</li>
        <li>Contrats, factures et états des lieux : <b>10 ans</b> pour les pièces comptables, 5 ans pour les autres documents (prescription civile).</li>
        <li>À la fin de l&apos;abonnement du loueur : ses données lui sont restituées sur demande (exports CSV et PDF) puis supprimées dans un délai de 3 mois.</li>
      </ul>

      <h2>Droits des personnes</h2>
      <p>Les clients d&apos;un loueur exercent leurs droits (accès, rectification, effacement, opposition, limitation, portabilité) auprès de ce loueur.
        Nous l&apos;aidons à y répondre. Toute personne peut aussi écrire à <a className="lien" href="mailto:fleet@sscarsystem.com">fleet@sscarsystem.com</a>
        ou saisir la CNIL (cnil.fr).</p>

      <h2>Sécurité</h2>
      <p>Connexions chiffrées (HTTPS), mots de passe jamais stockés en clair, séparation stricte des données de chaque loueur au niveau de la base,
        accès employés limités et retirables par le gérant.</p>
    </PageLegale>
  );
}
