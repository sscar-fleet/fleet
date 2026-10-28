// Photo du modèle trouvée automatiquement à partir de la marque et du modèle saisis (« Clio V », même avec une faute).
// Source : Wikipédia (photos libres de droits), en français puis en anglais.
const UA = { 'User-Agent': 'SSCarFleet/1.0 (fleet@sscarsystem.com)', 'Api-User-Agent': 'SSCarFleet/1.0 (fleet@sscarsystem.com)' };

async function chercher(langue: string, q: string, marque: string) {
  const r = await fetch(`https://${langue}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=5`, { headers: UA, cache: 'no-store' });
  if (!r.ok) return null;
  const { pages = [] } = await r.json();
  const m = marque.toLowerCase().split(/\s+/)[0];
  const tri = [...pages].sort((a: any, b: any) => Number(String(b.title).toLowerCase().includes(m)) - Number(String(a.title).toLowerCase().includes(m)));
  for (const p of tri) {
    if (!p.thumbnail) continue;
    const s = await fetch(`https://${langue}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`, { headers: UA, cache: 'no-store' });
    if (!s.ok) continue;
    const j = await s.json();
    const src: string | undefined = j?.thumbnail?.source;
    if (src) return src.replace(/\/\d+px-/, '/640px-');
  }
  return null;
}

// Photos « catalogue » (Car Image API) : voir lib/visuel.ts et app/api/visuel
import { urlCatalogue, visuelRetenu, teinteHex, gabarit } from './visuel';
export const catalogueActif = () => !!process.env.CAR_IMAGE_API_KEY;
export const reglagesCatalogue = () => (catalogueActif() ? { actif: true as const } : null);
export const photoCatalogue = (marque?: string | null, modele?: string | null, annee?: number | null) => urlCatalogue(reglagesCatalogue(), marque, modele, annee);
export const visuelVehicule = (v: { marque?: string | null; modele?: string | null; annee?: number | null; visuel?: string | null; couleur?: string | null }) => visuelRetenu(reglagesCatalogue(), v);

export async function chercherPhotoModele(marque?: string | null, modele?: string | null) {
  if (!marque && !modele) return null;
  const q = [marque, modele].filter(Boolean).join(' ');
  try {
    return (await chercher('fr', q, marque ?? '')) ?? (await chercher('en', q, marque ?? ''));
  } catch {
    return null;
  }
}

// Ce qu'il faut à la carte pour dessiner une voiture : la même photo que la liste (zéro image en plus), sa teinte, son gabarit, son cap
export const pourCarte = (v: { marque?: string | null; modele?: string | null; annee?: number | null; visuel?: string | null; couleur?: string | null }, cap?: number | null) =>
  ({ photo: visuelVehicule(v), teinte: teinteHex(v.couleur), gabarit: gabarit(v.marque, v.modele), cap: cap ?? null });
