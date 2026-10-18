import { NextResponse } from 'next/server';
import { utilisateurCourant } from '@/lib/agence';
import { chercherPhotoModele } from '@/lib/photoModele';

export const dynamic = 'force-dynamic';

// Aperçu de la photo du modèle pendant la saisie d'un véhicule
export async function GET(req: Request) {
  await utilisateurCourant();
  const u = new URL(req.url);
  const photo = await chercherPhotoModele(u.searchParams.get('marque'), u.searchParams.get('modele'));
  return NextResponse.json({ photo });
}
