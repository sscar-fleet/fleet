import { clientApi } from '@/lib/api';
import { COULEURS, COULEUR_DEFAUT } from '@/lib/visuel';
import { supabaseAdmin, adminConfigure } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Photo « catalogue » d'un modèle (de profil, fond transparent). Demandée une seule fois au fournisseur (Car Image API),
// gardée dans le stockage de Fleet, puis servie à tous les loueurs : une image consommée par modèle et par année, jamais par affichage.
// Un modèle inconnu du fournisseur est noté pour ne pas être redemandé ; la page affiche alors le logo de la marque.
const URL_API = () => (process.env.CAR_IMAGE_URL || 'https://carimage.dev').replace(/\/$/, '');
const DOSSIER = 'catalogue/v3'; // v3 : image recadrée au ras de la voiture, dans la couleur du véhicule
const enCours = new Map<string, Promise<Buffer | null>>();
const diags = new Map<string, string>();

const image = (octets: Buffer) => new Response(new Uint8Array(octets), {
  headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=2592000, immutable' },
});
const absente = () => new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=86400' } });

async function demander(marque: string, modele: string, annee: string, couleur: string): Promise<{ octets?: Buffer; inconnu?: boolean; diag?: string }> {
  // Le modèle complet d'abord (« rs3 », « clio-5 »), puis le premier mot seulement (« clio »)
  const essais = Array.from(new Set([modele.replace(/-/g, ' '), modele.split('-')[0]]));
  for (const mo of essais) {
    const q = new URLSearchParams({ make: marque.replace(/-/g, ' '), model: mo, year: annee, color: couleur, view: 'left', format: 'png', size: 'medium', trim: '1' });
    const r = await fetch(`${URL_API()}/api/v1/images/car?${q}`, {
      headers: { Authorization: `Bearer ${process.env.CAR_IMAGE_API_KEY}` }, signal: AbortSignal.timeout(25_000), cache: 'no-store',
    });
    if (r.ok) return { octets: Buffer.from(await r.arrayBuffer()) };
    if (r.status !== 404) { // quota atteint, surcharge, requête refusée : on réessaiera plus tard, rien n'est noté
      const corps = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      console.error('[visuel]', r.status, mo, corps);
      return { diag: `${r.status} ${corps}` };
    }
  }
  return { inconnu: true };
}

export async function GET(request: Request) {
  const c = await clientApi(request);
  if (!c) return new Response(null, { status: 401 });
  const cle = new URL(request.url).searchParams.get('v') ?? '';
  const m = /^([a-z0-9-]{1,40})_([a-z0-9-]{1,60})_(\d{4})(?:_([a-z-]{1,20}))?$/.exec(cle);
  const teinte = COULEURS.find((x) => x.id === (m?.[4] ?? COULEUR_DEFAUT));
  if (!m || !teinte || !process.env.CAR_IMAGE_API_KEY || !adminConfigure()) return new Response(null, { status: 404, headers: { 'x-visuel-diag': !m ? 'cle-invalide' : !process.env.CAR_IMAGE_API_KEY ? 'pas-de-cle' : 'pas-de-service-role' } });
  const db = supabaseAdmin().storage.from('documents');
  const nom = `${m[1]}_${m[2]}_${m[3]}_${teinte.id}`;
  const chemin = `${DOSSIER}/${nom}.png`;

  const { data: garde } = await db.download(chemin);
  if (garde) return image(Buffer.from(await garde.arrayBuffer()));
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
