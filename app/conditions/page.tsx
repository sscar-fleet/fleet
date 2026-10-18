import PageLegale from '../_c/PageLegale';

export const metadata = { title: 'Conditions d’utilisation · SS CAR FLEET' };

export default function Conditions() {
  return (
    <PageLegale titre="Conditions d'utilisation">
      <h2>1. Le service</h2>
      <p>SS CAR FLEET, édité par SS CAR SYSTEM DEVELOPPEMENT (SAS, RCS Paris 941 416 372, 60 rue François 1er, 75008 Paris), est un logiciel en ligne
        de gestion pour loueurs de véhicules : réservations, clients, états des lieux, contrats, factures, amendes, entretien et pilotage de la flotte.</p>

      <h2>2. Compte et accès</h2>
      <p>Le compte est ouvert par le gérant de l&apos;agence, qui peut ajouter des employés. Chacun garde son mot de passe secret.
        Le gérant reste responsable de l&apos;usage fait par ses employés et peut retirer leur accès à tout moment.</p>

      <h2>3. Données du loueur</h2>
      <p>Les données saisies appartiennent au loueur. Il s&apos;engage à ne collecter que ce qui est nécessaire, à informer ses clients et à respecter
        les durées de conservation décrites dans la <a className="lien" href="/confidentialite">politique de confidentialité</a>. Il peut exporter ses listes à tout moment.</p>

      <h2>4. Paiements</h2>
      <p>Fleet n&apos;encaisse aucun paiement pour le compte du loueur : loyers et cautions sont réglés directement entre le loueur et ses clients.
        Les documents produits par Fleet (contrats, factures, attestations) sont établis sous la responsabilité du loueur, qui vérifie leurs mentions.</p>

      <h2>5. Prix</h2>
      <p>Abonnement mensuel selon l&apos;offre choisie, sans engagement de durée. Le suivi GPS et les traceurs SS CAR SYSTEM sont proposés en option.</p>

      <h2>6. Disponibilité</h2>
      <p>Nous faisons le maximum pour que Fleet soit disponible en permanence, sauvegardé et à jour. Des interruptions courtes peuvent avoir lieu pour maintenance.
        Notre responsabilité est limitée aux dommages directs et au montant des sommes payées sur les 12 derniers mois.</p>

      <h2>7. Fin du contrat</h2>
      <p>Le loueur peut arrêter à tout moment. Ses données lui sont restituées sur demande puis supprimées dans un délai de 3 mois.</p>

      <h2>8. Droit applicable</h2>
      <p>Droit français. En cas de désaccord, nous cherchons d&apos;abord une solution amiable ; à défaut, les tribunaux de Paris sont compétents.</p>
    </PageLegale>
  );
}
