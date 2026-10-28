// Photo « catalogue » du modèle (trois quarts avant, fond détouré, dans la couleur du véhicule) servie par le site Fleet.
// Même règle que le site (lib/visuel.ts) : la clé du fournisseur reste sur le serveur, l'image est demandée une fois par
// modèle, année et couleur puis gardée. Le téléphone ne fait qu'afficher /api/visuel avec le jeton de connexion.
import { supabase } from './supabase';
import { urlSite } from './site';

// Mêmes teintes que le site (lib/visuel.ts) : sert aussi à colorer l'icône vue de dessus sur la carte
export const TEINTES: Record<string, string> = { 'gris-fonce': '#3b3f45', noir: '#121212', gris: '#a7abb0', blanc: '#f1f1f1', bleu: '#1d3a6e', rouge: '#a5151b', vert: '#2c4a37', marron: '#5a4231', beige: '#c9b994', orange: '#d8641c', jaune: '#e3b51f' };
const COULEURS = Object.keys(TEINTES);
// À changer en même temps que VERSION_VISUEL du site, quand le contenu des images change (vue, sens…)
const VERSION_VISUEL = 5;
const COULEUR_DEFAUT = 'gris-fonce';
const VIEUX = 15; // un véhicule de plus de 15 ans garde l'icône par défaut

export type VehiculeVisuel = { marque?: string | null; modele?: string | null; annee?: number | null; couleur?: string | null; visuel?: string | null };

const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const anneeParDefaut = () => new Date().getFullYear() - 2;

function cle(v: VehiculeVisuel) {
  const m = sansAccent(v.marque ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const mo = sansAccent(v.modele ?? '').replace(/\bclasse\s+([a-z])\b/, '$1-class').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!m || !mo) return null;
  const a = v.annee && v.annee >= 1990 && v.annee <= anneeParDefaut() + 3 ? v.annee : anneeParDefaut();
  const c = COULEURS.includes(v.couleur ?? '') ? v.couleur : COULEUR_DEFAUT;
  return `${m}_${mo}_${a}_${c}`;
}

// null = icône classique (logo de la marque)
export function urlVisuel(v: VehiculeVisuel | null | undefined): string | null {
  if (!v || v.visuel === 'icone') return null;
  if (v.visuel !== 'photo' && v.annee && v.annee < new Date().getFullYear() - VIEUX) return null;
  const k = cle(v);
  return k ? urlSite(`/api/visuel?v=${encodeURIComponent(k)}&r=${VERSION_VISUEL}`) : null;
}

// Jeton de connexion gardé en mémoire pour les en-têtes d'image (pas d'attente à chaque vignette)
let jeton = '';
supabase.auth.getSession().then(({ data }) => { jeton = data.session?.access_token ?? ''; }).catch(() => {});
supabase.auth.onAuthStateChange((_e, s) => { jeton = s?.access_token ?? ''; });
export const enteteVisuel = (): Record<string, string> | undefined => (jeton ? { Authorization: `Bearer ${jeton}` } : undefined);

export const teinte = (v?: VehiculeVisuel | null) => TEINTES[v?.couleur ?? ''] ?? TEINTES[COULEUR_DEFAUT];

// Gabarit pour l'icône vue de dessus de la carte (le fournisseur d'images n'a pas de vue de dessus)
export type Gabarit = 'citadine' | 'berline' | 'suv' | 'utilitaire' | 'moto';
export function gabarit(v?: VehiculeVisuel | null): Gabarit {
  const t = sansAccent(`${v?.marque ?? ''} ${v?.modele ?? ''}`);
  if (/\b(yamaha|kawasaki|ducati|ktm|harley|triumph|piaggio|vespa|kymco|sym)\b|x-?adv|t-?max|forza|scooter|moto|\bcb ?\d|\bmt-?\d/.test(t)) return 'moto';
  if (/master|trafic|kangoo|jumpy|boxer|sprinter|transit|crafter|ducato|expert|vito|partner|berlingo|jumper|movano|vivaro|daily|proace|transporter|caddy|nv\d|talento|scudo|doblo|citan|vivaro|combo|camion|fourgon/.test(t)) return 'utilitaire';
  if (/3008|5008|2008|captur|kadjar|koleos|austral|arkana|tiguan|t-?roc|touareg|\bq[2-8]\b|\bx[1-7]\b|gl[abcse]\b|classe g|g-class|sportage|tucson|qashqai|juke|duster|jogger|rav ?4|c-?hr|kuga|puma|range|evoque|velar|defender|macan|cayenne|\bxm\b|urus|ateca|tarraco|kodiaq|karoq|formentor|x-?trail|cx-?\d|model y|ix\d|niro|ev6|kona/.test(t)) return 'suv';
  if (/classe [cesa]\b|[ces]-class|\ba[4-8]\b|rs ?[4-7]\b|serie [3-7]|[3-7]-series|\bm[3-5]\b|508|passat|arteon|model [3s]|talisman|superb|octavia|mondeo|insignia|giulia|panamera|taycan|cla\b|cls\b/.test(t)) return 'berline';
  return 'citadine';
}
