import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { lireDocument } from '@/lib/lecture';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Lecture automatique d'un papier (carte grise, permis, pièce d'identité, avis d'amende)
export async function POST(request: Request) {
  if (!(await clientApi(request))) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { image, genre } = await request.json().catch(() => ({}));
  const r = await lireDocument(image, genre);
  return NextResponse.json(r.champs ? { champs: r.champs } : { erreur: r.erreur }, { status: r.statut });
}
