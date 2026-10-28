import { clientApi } from '@/lib/api';
import { PNG } from 'pngjs';
import { COULEURS, COULEUR_DEFAUT } from '@/lib/visuel';
import { supabaseAdmin, adminConfigure } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Photo « catalogue » d'un modèle (de profil, fond transparent). Demandée une seule fois au fournisseur (Car Image API),
// gardée dans le stockage de Fleet, puis servie à tous les loueurs : une image consommée par modèle et par année, jamais par affichage.
// Un modèle inconnu du fournisseur est noté pour ne pas être redemandé ; la page affiche alors le logo de la marque.
const URL_API = () => (process.env.CAR_IMAGE_URL || 'https://carimage.dev').replace(/\/$/, '');
const DOSSIER = 'catalogue/v5'; // v5 : trois quarts avant, toujours tournée vers la gauche, recadrée au ras de la voiture, dans la couleur du véhicule
const enCours = new Map<string, Promise<Buffer | null>>();
const diags = new Map<string, string>();

const image = (octets: Buffer) => new Response(new Uint8Array(octets), {
  headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=2592000, immutable' },
});
const absente = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } }); // un échec ne se garde jamais

// Toutes les voitures regardent du même côté (l'avant à gauche). Le fournisseur se trompe parfois de côté :
// en trois quarts avant, la roue avant, la plus proche, descend plus bas que l'arrière. Si l'avant est à droite, on retourne l'image.
function versLaGauche(octets: Buffer): Buffer {
  try {
    const img = PNG.sync.read(octets);
    const { width: L, height: H, data } = img;
    const bas = (x: number) => { for (let y = H - 1; y >= 0; y--) if (data[(y * L + x) * 4 + 3] > 40) return y; return -1; };
    const cols: number[] = [];
    for (let x = 0; x < L; x++) if (bas(x) >= 0) cols.push(x);
    if (cols.length < 20) return octets;
    const g = cols[0], d = cols[cols.length - 1], w = d - g;
    const plusBas = (a: number, b: number) => { let m = -1; for (let x = Math.round(a); x <= Math.round(b); x++) m = Math.max(m, bas(x)); return m; };
    const gauche = plusBas(g, g + w * 0.3), droite = plusBas(d - w * 0.3, d);
    if (droite - gauche < H * 0.015) return octets; // avant déjà à gauche, ou pas de différence nette
    const miroir = new PNG({ width: L, height: H });
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) data.copy(miroir.data, (y * L + (L - 1 - x)) * 4, (y * L + x) * 4, (y * L + x) * 4 + 4);
    return PNG.sync.write(miroir);
  } catch { return octets; }
}

async function demander(marque: string, modele: string, annee: string, couleur: string, vue = 'front-left'): Promise<{ octets?: Buffer; inconnu?: boolean; diag?: string }> {
  // Le modèle complet d'abord (« rs3 », « clio-5 »), puis le premier mot seulement (« clio »)
  const essais = Array.from(new Set([modele.replace(/-/g, ' '), modele.split('-')[0]]));
  for (const mo of essais) {
    const q = new URLSearchParams({ make: marque.replace(/-/g, ' '), model: mo, year: annee, color: couleur, view: vue, format: 'png', size: 'medium', trim: '1' });
    const r = await fetch(`${URL_API()}/api/v1/images/car?${q}`, {
      headers: { Authorization: `Bearer ${process.env.CAR_IMAGE_API_KEY}` }, signal: AbortSignal.timeout(25_000), cache: 'no-store',
    });
    if (r.ok) return { octets: versLaGauche(Buffer.from(await r.arrayBuffer())) };
    if (r.status !== 404) { // quota atteint, surcharge, requête refusée : on réessaiera plus tard, rien n'est noté
      const corps = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      console.error('[visuel]', r.status, mo, corps);
      return { diag: `${r.status} ${corps}` };
    }
  }
  return { inconnu: true };
}

export async function GET(request: Request) {
  // Sans connexion (carte de l'appli, dans sa WebView) : seulement les images déjà gardées, jamais de demande au fournisseur
  const connecte = !!(await clientApi(request));
  const cle = new URL(request.url).searchParams.get('v') ?? '';
  const m = /^([a-z0-9-]{1,40})_([a-z0-9-]{1,60})_(\d{4})(?:_([a-z-]{1,20}))?$/.exec(cle);
  const teinte = COULEURS.find((x) => x.id === (m?.[4] ?? COULEUR_DEFAUT));
  if (!m || !teinte || !process.env.CAR_IMAGE_API_KEY || !adminConfigure()) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store', 'x-visuel-diag': !m ? 'cle-invalide' : !process.env.CAR_IMAGE_API_KEY ? 'pas-de-cle' : 'pas-de-service-role' } });
  const db = supabaseAdmin().storage.from('documents');
  const nom = `${m[1]}_${m[2]}_${m[3]}_${teinte.id}`;
  const chemin = `${DOSSIER}/${nom}.png`;

  const { data: garde } = await db.download(chemin);
  if (garde) return image(Buffer.from(await garde.arrayBuffer()));
  if (!connecte) return absente();
  const { data: inconnu } = await db.download(`${DOSSIER}/${m[1]}_${m[2]}_${m[3]}.inconnu`);
  if (inconnu) return absente();

  // Deux écrans qui demandent le même modèle au même moment : une seule demande au fournisseur
  if (!enCours.has(nom)) {
    enCours.set(nom, (async () => {
      try {
        const r = await demander(m[1], m[2], m[3], teinte.hex);
        if (r.octets) { await db.upload(chemin, r.octets, { contentType: 'image/png', upsert: true }); return r.octets; }
        if (r.diag) diags.set(nom, r.diag);
        if (r.inconnu) await db.upload(`${DOSSIER}/${m[1]}_${m[2]}_${m[3]}.inconnu`, Buffer.from('1'), { contentType: 'text/plain', upsert: true });
        return null;
      } catch (e: any) { diags.set(nom, `erreur ${e?.name ?? ''} ${e?.message ?? ''}`.slice(0, 300)); return null; } finally { setTimeout(() => enCours.delete(nom), 1000); }
    })());
  }
  const octets = await enCours.get(nom)!;
  if (octets) return image(octets);
  // Pour le diagnostic : pourquoi le fournisseur n'a pas rendu d'image (jamais la clé)
  return new Response(null, { status: 404, headers: { 'cache-control': 'no-store', 'x-visuel-diag': encodeURIComponent(diags.get(nom) ?? 'inconnu du fournisseur') } });
}
