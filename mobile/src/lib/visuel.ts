// Photo « catalogue » du modèle (trois quarts avant, fond détouré, dans la couleur du véhicule) servie par le site Fleet.
// Même règle que le site (lib/visuel.ts) : la clé du fournisseur reste sur le serveur, l'image est demandée une fois par
// modèle, année et couleur puis gardée. Le téléphone ne fait qu'afficher /api/visuel avec le jeton de connexion.
import { supabase } from './supabase';
import { urlSite } from './site';

const COULEURS = ['gris-fonce', 'noir', 'gris', 'blanc', 'bleu', 'rouge', 'vert', 'marron', 'beige', 'orange', 'jaune'];
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
  return k ? urlSite(`/api/visuel?v=${encodeURIComponent(k)}`) : null;
}

// Jeton de connexion gardé en mémoire pour les en-têtes d'image (pas d'attente à chaque vignette)
let jeton = '';
supabase.auth.getSession().then(({ data }) => { jeton = data.session?.access_token ?? ''; }).catch(() => {});
supabase.auth.onAuthStateChange((_e, s) => { jeton = s?.access_token ?? ''; });
export const enteteVisuel = (): Record<string, string> | undefined => (jeton ? { Authorization: `Bearer ${jeton}` } : undefined);
