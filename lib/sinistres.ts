// Sinistres : types, étapes du dossier et documents que l'assureur demande en général (modifiables dossier par dossier)
export const TYPES_SINISTRE: Record<string, string> = {
  accident: 'Accident', vol: 'Vol', vandalisme: 'Vandalisme', bris_glace: 'Bris de glace', incendie: 'Incendie', autre: 'Autre',
};
export const ETAPES_SINISTRE: [string, string][] = [
  ['a_declarer', 'À déclarer'], ['declare', 'Déclaré'], ['expertise', 'Expertise'], ['chiffrage', 'Chiffrage reçu'],
  ['accord', 'Accord assureur'], ['repare', 'Réparé'], ['rembourse', 'Remboursé'], ['clos', 'Clos'],
];
export const STATUT_SINISTRE: Record<string, string> = { ...Object.fromEntries(ETAPES_SINISTRE), refuse: 'Refusé par l’assureur' };
export const FINIS = ['clos', 'refuse'];
export const RESPONSABILITES: Record<string, string> = { inconnue: 'À déterminer', non: 'Non responsable', partielle: 'Partiellement responsable', totale: 'Responsable' };

const BASE = ['Déclaration à l’assureur', 'Carte grise', 'Permis du conducteur'];
export const DOCUMENTS_PAR_TYPE: Record<string, string[]> = {
  accident: ['Constat amiable', 'Photos des dégâts', ...BASE, 'Rapport d’expertise', 'Devis de réparation', 'Facture de réparation'],
  vol: ['Dépôt de plainte', ...BASE.slice(0, 2), 'Toutes les clés', 'Facture d’achat du véhicule', 'Contrôle technique', 'Dernière position GPS', 'Lettre de non-retrouvaille'],
  vandalisme: ['Photos des dégâts', 'Dépôt de plainte', ...BASE.slice(0, 2), 'Devis de réparation', 'Facture de réparation'],
  bris_glace: ['Photos', BASE[0], BASE[1], 'Facture du remplacement'],
  incendie: ['Photos', 'Dépôt de plainte', 'Rapport des pompiers', ...BASE.slice(0, 2), 'Rapport d’expertise'],
  autre: ['Photos', BASE[0], BASE[1]],
};
export type DocSinistre = { nom: string; fait: boolean; chemin?: string | null };
export const documentsDefaut = (type: string): DocSinistre[] => (DOCUMENTS_PAR_TYPE[type] ?? DOCUMENTS_PAR_TYPE.autre).map((nom) => ({ nom, fait: false }));
export const RELANCE_JOURS = 7;
export const dansJours = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
