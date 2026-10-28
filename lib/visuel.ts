// Visuel d'un véhicule : photo « catalogue » du modèle exact (de profil, fond transparent, même angle pour toute la flotte)
// ou icône classique (logo de la marque). Fonctions pures, utilisables dans le navigateur comme sur le serveur.
// Les photos sont servies par Fleet lui-même (/api/visuel) : chaque modèle est demandé une seule fois au fournisseur
// (Car Image API, clé CAR_IMAGE_API_KEY dans Vercel), gardé dans le stockage, puis réutilisé pour tous les loueurs.
export type ReglagesCatalogue = { actif: true } | null;
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Couleur de la voiture sur l'image : la vraie couleur du véhicule si le loueur l'a choisie, sinon gris foncé
// (une flotte de location, c'est rarement du blanc). Chaque couleur est une image à part chez le fournisseur.
export const COULEURS = [
  { id: 'gris-fonce', nom: 'Gris foncé', hex: '3b3f45' },
  { id: 'noir', nom: 'Noir', hex: '121212' },
  { id: 'gris', nom: 'Gris clair', hex: 'a7abb0' },
  { id: 'blanc', nom: 'Blanc', hex: 'f1f1f1' },
  { id: 'bleu', nom: 'Bleu', hex: '1d3a6e' },
  { id: 'rouge', nom: 'Rouge', hex: 'a5151b' },
  { id: 'vert', nom: 'Vert', hex: '2c4a37' },
  { id: 'marron', nom: 'Marron', hex: '5a4231' },
  { id: 'beige', nom: 'Beige', hex: 'c9b994' },
  { id: 'orange', nom: 'Orange', hex: 'd8641c' },
  { id: 'jaune', nom: 'Jaune', hex: 'e3b51f' },
] as const;
export const COULEUR_DEFAUT = 'gris-fonce';
export const couleurValide = (c?: string | null) => (COULEURS.some((x) => x.id === c) ? (c as string) : COULEUR_DEFAUT);
// Couleur écrite en toutes lettres (contrat, tableur) → couleur de la palette, ou null
export function couleurNette(t?: string | null): string | null {
  const s = sansAccent(String(t ?? ''));
  if (!s) return null;
  if (/anthracite|gris\s*(fonce|graphite|titane|platine)|graphite|titane|gunmetal/.test(s)) return 'gris-fonce';
  if (/noir|black/.test(s)) return 'noir';
  if (/gris|argent|silver|alu/.test(s)) return 'gris';
  if (/blanc|white|ivoire|nacre/.test(s)) return 'blanc';
  if (/bleu|blue|marine/.test(s)) return 'bleu';
  if (/rouge|red|bordeaux/.test(s)) return 'rouge';
  if (/vert|green|kaki/.test(s)) return 'vert';
  if (/marron|brun|brown|bronze|chocolat/.test(s)) return 'marron';
  if (/beige|sable|champagne|creme/.test(s)) return 'beige';
  if (/orange|cuivre/.test(s)) return 'orange';
  if (/jaune|yellow|or\b|dore/.test(s)) return 'jaune';
  return null;
}

// Sans année connue, on prend une voiture récente (la génération actuelle)
// À changer quand le contenu des images change (vue, sens…) : sinon le navigateur ressert l'ancienne image gardée 30 jours
export const VERSION_VISUEL = 5;
export const anneeParDefaut = () => new Date().getFullYear() - 2;

// Clé d'une image : marque, modèle (avec sa version : « rs3 » n'est pas « a3 ») et année
export function cleVisuel(marque?: string | null, modele?: string | null, annee?: number | null, couleur?: string | null) {
  const m = sansAccent(marque ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const mo = sansAccent(modele ?? '').replace(/\bclasse\s+([a-z])\b/, '$1-class').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!m || !mo) return null;
  const a = annee && annee >= 1990 && annee <= anneeParDefaut() + 3 ? annee : anneeParDefaut();
  const c = couleurValide(couleur);
  return { marque: m, modele: mo, annee: a, couleur: c, cle: `${m}_${mo}_${a}_${c}` };
}

export function urlCatalogue(r: ReglagesCatalogue, marque?: string | null, modele?: string | null, annee?: number | null, couleur?: string | null) {
  const k = r ? cleVisuel(marque, modele, annee, couleur) : null;
  return k ? `/api/visuel?v=${encodeURIComponent(k.cle)}&r=${VERSION_VISUEL}` : null;
}

// null = icône classique. Par défaut (auto), un véhicule de plus de 15 ans garde l'icône.
export const VIEUX = 15;
export function visuelRetenu(r: ReglagesCatalogue, v: { marque?: string | null; modele?: string | null; annee?: number | null; visuel?: string | null; couleur?: string | null }) {
  if (!r || v.visuel === 'icone') return null;
  if (v.visuel !== 'photo' && v.annee && v.annee < new Date().getFullYear() - VIEUX) return null;
  return urlCatalogue(r, v.marque, v.modele, v.annee, v.couleur);
}
