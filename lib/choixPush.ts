// Familles de notifications que chacun peut activer ou couper sur son téléphone.
// Par défaut, seulement l'essentiel du terrain : trop de notifications et plus personne ne les lit.
export type FamillePush = 'vol' | 'retards' | 'retours' | 'departs' | 'matin' | 'argent' | 'papiers' | 'atelier';
export const FAMILLES_PUSH: { cle: FamillePush; titre: string; detail: string; defaut: boolean }[] = [
  { cle: 'vol', titre: 'Vol et sécurité', detail: 'Remorquage, vibration, boîtier débranché, brouillage, sortie de zone', defaut: true },
  { cle: 'retards', titre: 'Retours en retard', detail: 'La voiture devait être rendue il y a plus d’une heure', defaut: true },
  { cle: 'retours', titre: 'Retours dans l’heure', detail: 'Un client doit ramener une voiture bientôt', defaut: true },
  { cle: 'departs', titre: 'Départs à préparer', detail: 'Un client part bientôt et il manque la caution ou un papier', defaut: true },
  { cle: 'matin', titre: 'Le point du matin', detail: 'Une seule notification vers 8 h 30 avec ce qui compte aujourd’hui', defaut: true },
  { cle: 'argent', titre: 'Amendes, FPS, cautions', detail: 'Avant une majoration, amende à désigner, caution à rendre', defaut: false },
  { cle: 'papiers', titre: 'Papiers des voitures', detail: 'Assurance, contrôle technique, Kbis qui expirent', defaut: false },
  { cle: 'atelier', titre: 'Atelier et voitures immobiles', detail: 'Entretien qui déborde, voiture qui ne sort plus', defaut: false },
];
export const choixComplets = (c?: Record<string, boolean> | null) =>
  Object.fromEntries(FAMILLES_PUSH.map((f) => [f.cle, typeof c?.[f.cle] === 'boolean' ? c[f.cle] : f.defaut])) as Record<FamillePush, boolean>;

// Famille d'une notification de la cloche d'après sa clé
// Jamais envoyé sur le téléphone : moteur coupé / allumé (le client coupe et rallume sans arrêt, ça noierait tout).
// Reste visible dans la cloche et sur la fiche de la voiture.
export const jamaisEnPush = (cle: string) => cle.startsWith('moteur-');

export function familleDeCle(cle: string): FamillePush {
  if (cle.startsWith('gps-')) return 'vol';
  if (cle.startsWith('retard-')) return 'retards';
  if (cle.startsWith('retour-')) return 'retours';
  if (cle.startsWith('depart-')) return 'departs';
  if (cle.startsWith('matin-')) return 'matin';
  if (/^(fps|amende|caution)-/.test(cle)) return 'argent';
  if (/^(papier|kbis)-/.test(cle)) return 'papiers';
  return 'atelier';
}
