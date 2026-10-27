// Parcours découverte des 5 premiers jours : des missions courtes qui montrent la puissance de Fleet.
// Chaque mission se coche toute seule quand le loueur l'a vraiment faite (données de l'agence),
// ou, pour les écrans à découvrir, quand il les a ouverts (trace « Découverte : … » dans l'historique).

export type Mission = { cle: string; titre: string; pourquoi: string; lien: string; bouton: string; minutes: number };
export type Jour = { n: number; titre: string; badge: string; missions: Mission[] };

export const JOURS: Jour[] = [
  { n: 1, titre: 'Votre agence en place', badge: 'Agence prête', missions: [
    { cle: 'agence', titre: 'Renseigner l’agence', pourquoi: 'Vos contrats et factures sortent à votre nom, avec votre signature.', lien: '/parametres?guide=agence', bouton: 'Réglages', minutes: 0 },
    { cle: 'flotte', titre: 'Importer votre flotte', pourquoi: 'Votre Excel, des photos de cartes grises ou quelques lignes dictées : Fleet AI remplit tout.', lien: '/import?guide=flotte', bouton: 'Importer', minutes: 5 },
    { cle: 'client', titre: 'Créer un client avec son permis', pourquoi: 'Une photo du permis, et la fiche se remplit toute seule.', lien: '/clients?guide=client', bouton: 'Essayer', minutes: 4 },
  ] },
  { n: 2, titre: 'Votre première location', badge: 'Première clé remise', missions: [
    { cle: 'location', titre: 'Créer une location en une minute', pourquoi: 'Client, voiture, dates : le contrat est prêt à signer.', lien: '/locations/nouvelle?guide=location', bouton: 'Commencer', minutes: 10 },
    { cle: 'appli', titre: 'Installer l’appli sur votre téléphone', pourquoi: 'Tout ce qui se fait devant la voiture se fait au pouce, même sans réseau.', lien: '/acces-appli?guide=appli', bouton: 'Installer', minutes: 0 },
    { cle: 'edl', titre: 'Faire un état des lieux sur le téléphone', pourquoi: 'Photos guidées, compteur lu tout seul, signature au doigt, PDF envoyé au client.', lien: '/acces-appli?guide=edl', bouton: 'Voir comment', minutes: 12 },
  ] },
  { n: 3, titre: 'Les amendes sans y penser', badge: 'Zéro amende oubliée', missions: [
    { cle: 'amende', titre: 'Enregistrer une amende ou un FPS en photo', pourquoi: 'Fleet retrouve le conducteur au moment de l’infraction et prépare la désignation.', lien: '/amendes?guide=amende', bouton: 'Essayer', minutes: 15 },
    { cle: 'planning', titre: 'Déplacer une location dans le planning', pourquoi: 'Glissez une location pour la déplacer, tirez son bord pour la prolonger.', lien: '/planning?guide=planning', bouton: 'Ouvrir', minutes: 3 },
  ] },
  { n: 4, titre: 'Fleet AI travaille pour vous', badge: 'Assistant adopté', missions: [
    { cle: 'ia', titre: 'Poser une question à Fleet AI', pourquoi: 'Par exemple : « qui rend une voiture demain ? » ou « le numéro du client de la Clio ».', lien: '/?guide=ia', bouton: 'Essayer', minutes: 5 },
    { cle: 'gps', titre: 'Voir votre flotte en direct', pourquoi: 'Où est chaque voiture, qui roule, qui est à l’arrêt, et la coupure moteur en cas de besoin.', lien: '/carte?guide=gps', bouton: 'Ouvrir', minutes: 2 },
  ] },
  { n: 5, titre: 'Piloter votre activité', badge: 'Pilote confirmé', missions: [
    { cle: 'retour', titre: 'Clôturer une location au retour', pourquoi: 'Kilomètres faits, carburant et dégâts comparés au départ, supplément calculé.', lien: '/locations?guide=retour', bouton: 'Voir', minutes: 12 },
    { cle: 'pilotage', titre: 'Regarder ce que rapporte chaque voiture', pourquoi: 'Recettes, coûts, jours loués : vous voyez tout de suite quelle voiture gagne et laquelle coûte.', lien: '/pilotage?guide=pilotage', bouton: 'Ouvrir', minutes: 0 },
  ] },
];

export const MISSIONS = JOURS.flatMap((j) => j.missions);
// Écrans dont la simple ouverture vaut découverte
export const DECOUVERTES_PAR_VISITE = ['planning', 'gps', 'pilotage', 'appli'];

export async function etatDecouverte(supabase: any, agenceId: string) {
  const compte = async (table: string, filtre?: (q: any) => any) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    if (filtre) q = filtre(q);
    const { count } = await q; return count ?? 0;
  };
  const [{ data: ag }, vehicules, clients, locations, edlDepart, edlRetour, amendes, fps, { data: traces }] = await Promise.all([
    supabase.from('agences').select('adresse, gerant_nom, signature_path, created_at').eq('id', agenceId).single(),
    compte('vehicules'), compte('clients'), compte('locations'),
    compte('etats_des_lieux', (q) => q.eq('type', 'depart').neq('statut', 'en_attente')),
    compte('etats_des_lieux', (q) => q.eq('type', 'retour').neq('statut', 'en_attente')),
    compte('amendes'), compte('fps'),
    supabase.from('historique').select('action').like('action', 'Découverte : %').limit(50),
  ]);
  const vus = new Set((traces ?? []).map((t: any) => String(t.action).replace('Découverte : ', '')));
  const fait: Record<string, boolean> = {
    agence: !!(ag?.adresse && ag?.gerant_nom && ag?.signature_path),
    flotte: vehicules > 0, client: clients > 0, location: locations > 0,
    appli: vus.has('appli') || edlDepart > 0, edl: edlDepart > 0,
    amende: amendes + fps > 0, planning: vus.has('planning'),
    ia: vus.has('ia'), gps: vus.has('gps'), retour: edlRetour > 0, pilotage: vus.has('pilotage'),
  };
  const jourActuel = Math.min(5, Math.max(1, Math.floor((Date.now() - new Date(ag?.created_at ?? Date.now()).getTime()) / 86_400_000) + 1));
  // Temps gagné (estimation) : chaque geste fait avec Fleet plutôt qu'à la main
  const minutes = vehicules * 5 + clients * 4 + locations * 10 + (edlDepart + edlRetour) * 12 + amendes * 15 + fps * 10;
  const faites = MISSIONS.filter((m) => fait[m.cle]).length;
  return { fait, jourActuel, minutes, faites, total: MISSIONS.length, fini: faites === MISSIONS.length };
}
