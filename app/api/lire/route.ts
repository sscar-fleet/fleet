import { NextResponse } from 'next/server';
import { clientApi, quotaIa } from '@/lib/api';
import { lireDocument } from '@/lib/lecture';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Lecture automatique d'un papier (carte grise, permis, pièce d'identité, avis d'amende)
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const plafond = await quotaIa(c.supabase);
  if (plafond) return NextResponse.json({ erreur: plafond }, { status: 429 });
  const { image, genre, chemin } = await request.json().catch(() => ({}));
  // Gros fichier (PDF d'un avis) : déjà déposé dans le stockage, on le relit ici plutôt que de le renvoyer
  let media = image;
  if (!media && typeof chemin === 'string') {
    const { data, error } = await c.supabase.storage.from('documents').download(chemin);
    if (error || !data) return NextResponse.json({ erreur: 'Document introuvable.' }, { status: 404 });
    const octets = Buffer.from(await data.arrayBuffer());
    media = `data:${chemin.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'};base64,${octets.toString('base64')}`;
  }
  const r = await lireDocument(media, genre);
  return NextResponse.json(r.champs ? { champs: r.champs } : { erreur: r.erreur }, { status: r.statut });
}
