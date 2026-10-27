// Visuel d'un véhicule : photo « catalogue » du modèle exact (de profil, fond transparent, même angle pour toute la flotte)
// ou icône classique (logo de la marque). Fonctions pures, utilisables dans le navigateur comme sur le serveur.
// Les photos viennent d'IMAGIN.studio (service payant) : clé IMAGIN_CLE dans Vercel, IMAGIN_ANGLE pour l'angle de vue.
export type ReglagesCatalogue = { cle: string; angle: string } | null;
const sansAccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// La version compte : « RS3 Sportback » donne la famille rs3 (pas a3) ; l'année choisit la bonne génération
export function urlCatalogue(r: ReglagesCatalogue, marque?: string | null, modele?: string | null, annee?: number | null) {
  if (!r || !marque || !modele) return null;
  const make = sansAccent(marque).replace(/\s+/g, '-');
  const mots = sansAccent(modele).replace(/\bclasse\s+([a-z])\b/, '$1-class').split(/\s+/).filter(Boolean);
  if (!make || !mots[0]) return null;
  const q = new URLSearchParams({ customer: r.cle, make, modelFamily: mots[0], angle: r.angle, zoomType: 'fullscreen', width: '800' });
  if (mots.length > 1) q.set('modelRange', mots.slice(1).join(' '));
  if (annee && annee >= 1990) q.set('modelYear', String(annee));
  return `https://cdn.imagin.studio/getImage?${q}`;
}

// null = icône classique. Par défaut (auto), un véhicule de plus de 15 ans garde l'icône.
export const VIEUX = 15;
export function visuelRetenu(r: ReglagesCatalogue, v: { marque?: string | null; modele?: string | null; annee?: number | null; visuel?: string | null }) {
  if (!r || v.visuel === 'icone') return null;
  if (v.visuel !== 'photo' && v.annee && v.annee < new Date().getFullYear() - VIEUX) return null;
  return urlCatalogue(r, v.marque, v.modele, v.annee);
}
