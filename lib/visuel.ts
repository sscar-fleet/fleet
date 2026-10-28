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

// --- Carte : teinte de la voiture, gabarit et icône vue de dessus (le fournisseur d'images n'a pas de vue de dessus)
export const teinteHex = (couleur?: string | null) => `#${(COULEURS.find((x) => x.id === couleur) ?? COULEURS.find((x) => x.id === COULEUR_DEFAUT)!).hex}`;
export type Gabarit = 'citadine' | 'berline' | 'suv' | 'utilitaire' | 'moto';
export function gabarit(marque?: string | null, modele?: string | null): Gabarit {
  const t = sansAccent(`${marque ?? ''} ${modele ?? ''}`);
  if (/\b(yamaha|kawasaki|ducati|ktm|harley|triumph|piaggio|vespa|kymco|sym)\b|x-?adv|t-?max|forza|scooter|moto|\bcb ?\d|\bmt-?\d/.test(t)) return 'moto';
  if (/master|trafic|kangoo|jumpy|boxer|sprinter|transit|crafter|ducato|expert|vito|partner|berlingo|jumper|movano|vivaro|daily|proace|transporter|caddy|nv\d|talento|scudo|doblo|citan|combo|camion|fourgon/.test(t)) return 'utilitaire';
  if (/3008|5008|2008|captur|kadjar|koleos|austral|arkana|tiguan|t-?roc|touareg|\bq[2-8]\b|\bx[1-7]\b|gl[abcse]\b|classe g|g-class|sportage|tucson|qashqai|juke|duster|jogger|rav ?4|c-?hr|kuga|puma|range|evoque|velar|defender|macan|cayenne|\bxm\b|urus|ateca|tarraco|kodiaq|karoq|formentor|x-?trail|cx-?\d|model y|ix\d|niro|ev6|kona/.test(t)) return 'suv';
  if (/classe [cesa]\b|[ces]-class|\ba[4-8]\b|rs ?[4-7]\b|serie [3-7]|[3-7]-series|\bm[3-5]\b|508|passat|arteon|model [3s]|talisman|superb|octavia|mondeo|insignia|giulia|panamera|taycan|cla\b|cls\b/.test(t)) return 'berline';
  return 'citadine';
}
const GAB: Record<Gabarit, [number, number]> = { citadine: [13, 28], berline: [14, 34], suv: [16, 34], utilitaire: [17, 38], moto: [7, 26] };
// Dessin maison, avant vers le haut (même dessin que la carte de l'appli)
export function dessusSvg(g: Gabarit, t = '#3b3f45') {
  const [w, h] = GAB[g] ?? GAB.citadine, x = 22 - w / 2, y = 22 - h / 2, r = g === 'moto' ? 3.5 : 4.5;
  const clair = /^#(f|e|d|c)/i.test(t), vitre = clair ? '#2b3440' : '#0d1318', trait = clair ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)';
  if (g === 'moto') return `<svg viewBox="0 0 44 44"><rect x="19.5" y="${y}" width="5" height="${h}" rx="2.5" fill="#111"/><rect x="${x}" y="${y + 7}" width="${w}" height="${h - 12}" rx="3.5" fill="${t}" stroke="${trait}" stroke-width="1"/><rect x="16" y="${y + 6}" width="12" height="2.2" rx="1.1" fill="#111"/><circle cx="22" cy="${y + 1.5}" r="1.6" fill="#fff8d6"/></svg>`;
  let s = `<svg viewBox="0 0 44 44"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${t}" stroke="${trait}" stroke-width="1"/>`;
  if (g === 'utilitaire') s += `<rect x="${x + 1.6}" y="${y + 3.2}" width="${w - 3.2}" height="${h * 0.16}" rx="2" fill="${vitre}"/><rect x="${x + 1.4}" y="${y + h * 0.26}" width="${w - 2.8}" height="${h * 0.68}" rx="2" fill="${t}" stroke="${trait}" stroke-width=".8"/>`;
  else s += `<rect x="${x + 1.8}" y="${y + h * 0.22}" width="${w - 3.6}" height="${h * 0.19}" rx="2.4" fill="${vitre}"/><rect x="${x + 2.2}" y="${y + h * 0.44}" width="${w - 4.4}" height="${h * 0.27}" rx="2" fill="${t}" stroke="${trait}" stroke-width=".7"/><rect x="${x + 2}" y="${y + h * 0.74}" width="${w - 4}" height="${h * 0.13}" rx="2" fill="${vitre}"/>`;
  s += `<rect x="${x + 1.2}" y="${y + 0.8}" width="3.2" height="1.8" rx=".9" fill="#fff8d6"/><rect x="${x + w - 4.4}" y="${y + 0.8}" width="3.2" height="1.8" rx=".9" fill="#fff8d6"/>`;
  s += `<rect x="${x + 1.2}" y="${y + h - 2.4}" width="3" height="1.6" rx=".8" fill="#ff4d4d"/><rect x="${x + w - 4.2}" y="${y + h - 2.4}" width="3" height="1.6" rx=".8" fill="#ff4d4d"/></svg>`;
  return s;
}
