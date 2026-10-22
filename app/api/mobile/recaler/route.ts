import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { imeiDeLAgence } from '@/lib/telematique';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Recalage du kilométrage du traceur sur le compteur lu à l'état des lieux :
// le chiffre de Seeworld n'est qu'une estimation, on repart du vrai compteur à chaque départ et retour.
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { vehicule_id, km } = await request.json().catch(() => ({}));
  const kmCompteur = Math.round(Number(km));
  if (!vehicule_id || !isFinite(kmCompteur) || kmCompteur <= 0) return NextResponse.json({ erreur: 'Kilométrage invalide.' }, { status: 400 });
  const { data: v } = await c.supabase.from('vehicules').select('traceur_id, traceurs(imei)').eq('id', vehicule_id).maybeSingle();
  const imei = (v as any)?.traceurs?.imei;
  if (!v?.traceur_id || !imei) return NextResponse.json({ recale: false, raison: 'Pas de traceur sur ce véhicule.' });
  try {
    const e = await imeiDeLAgence(c.supabase, String(imei));
    if (e.kmTraceur == null) return NextResponse.json({ recale: false, raison: 'Le traceur ne donne pas de kilométrage.' });
    const { error } = await c.supabase.from('traceurs').update({ km_compteur_ref: kmCompteur, km_traceur_ref: e.kmTraceur, ref_le: new Date().toISOString() }).eq('id', v.traceur_id);
    if (error) throw error;
    return NextResponse.json({ recale: true });
  } catch (err: any) {
    return NextResponse.json({ recale: false, raison: err?.message ?? 'Suivi GPS indisponible.' });
  }
}
