import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { imeiDeLAgence } from '@/lib/telematique';
import { trajetDuJour } from '@/lib/traccar';

export const dynamic = 'force-dynamic';

// Trajet du jour d'un véhicule (depuis minuit) pour le tracer sur la carte de l'appli
export async function GET(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('vehicule_id');
  const { data: v } = await c.supabase.from('vehicules').select('id, traceurs(imei)').eq('id', id).maybeSingle();
  const imei = (v as any)?.traceurs?.imei;
  if (!v || !imei) return NextResponse.json({ erreur: 'Aucun traceur relié à ce véhicule.' }, { status: 400 });
  try {
    await imeiDeLAgence(c.supabase, imei);
    const t = await trajetDuJour(String(imei));
    if (!t.inscrit) return NextResponse.json({ disponible: false, points: [], km: null });
    return NextResponse.json({ disponible: true, points: t.points, km: t.km }, { headers: { 'cache-control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ erreur: e?.message ?? 'Trajet indisponible.' }, { status: 400 });
  }
}
