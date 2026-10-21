import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { deplacerReservation, voituresPossibles } from '@/lib/reservation';

export const dynamic = 'force-dynamic';

// Appli : liste des voitures possibles pour une réservation ({ location_id }), ou changement ({ location_id, vehicule_id })
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { location_id, vehicule_id } = await request.json().catch(() => ({}));
  if (!location_id) return NextResponse.json({ erreur: 'Réservation manquante.' }, { status: 400 });
  try {
    if (!vehicule_id) return NextResponse.json({ voitures: await voituresPossibles(c.supabase, location_id) });
    const { data: u } = await c.supabase.from('utilisateurs').select('agence_id').eq('id', c.user.id).single();
    return NextResponse.json(await deplacerReservation(c.supabase, u?.agence_id, c.user.id, location_id, vehicule_id));
  } catch (e: any) {
    return NextResponse.json({ erreur: e?.message ?? 'Changement impossible.' }, { status: 400 });
  }
}
