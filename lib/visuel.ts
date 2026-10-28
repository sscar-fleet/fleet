// Visuel d'un véhicule : photo « catalogue » du modèle exact (de profil, fond transparent, même angle pour toute la flotte)
// ou icône classique (logo de la marque). Fonctions pures, utilisables dans le navigateur comme sur le serveur.
// Les photos sont servies par Fleet lui-même (/api/visuel) : chaque modèle est demandé une seule fois au fournisseur
// (Car Image API, clé CAR_IMAGE_API_KEY dans Vercel), gardé dans le stockage, puis réutilisé pour tous les loueurs.
export type ReglagesCatalogue = { actif: true } | null;
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Sans année connue, on prend une voiture récente (la génération actuelle)
export const anneeParDefaut = () => new Date().getFullYear() - 2;

// Clé d'une image : marque, modèle (avec sa version : « rs3 » n'est pas « a3 ») et année
export function cleVisuel(marque?: string | null, modele?: string | null, annee?: number | null) {
  const m = sansAccent(marque ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const mo = sansAccent(modele ?? '').replace(/\bclasse\s+([a-z])\b/, '$1-class').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!m || !mo) return null;
  const a = annee && annee >= 1990 && annee <= anneeParDefaut() + 3 ? annee : anneeParDefaut();
  return { marque: m, modele: mo, annee: a, cle: `${m}_${mo}_${a}` };
}

export function urlCatalogue(r: ReglagesCatalogue, marque?: string | null, modele?: string | null, annee?: number | null) {
  const k = r ? cleVisuel(marque, modele, annee) : null;
  return k ? `/api/visuel?v=${encodeURIComponent(k.cle)}` : null;
}

// null = icône classique. Par défaut (auto), un véhicule de plus de 15 ans garde l'icône.
export const VIEUX = 15;
export function visuelRetenu(r: ReglagesCatalogue, v: { marque?: string | null; modele?: string | null; annee?: number | null; visuel?: string | null }) {
  if (!r || v.visuel === 'icone') return null;
  if (v.visuel !== 'photo' && v.annee && v.annee < new Date().getFullYear() - VIEUX) return null;
  return urlCatalogue(r, v.marque, v.modele, v.annee);
}
