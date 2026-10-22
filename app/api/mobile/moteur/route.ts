import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { imeiDeLAgence } from '@/lib/telematique';
import { commandeMoteur } from '@/lib/sourceGps';

export const dynamic = 'force-dynamic';

// Coupure ou remise en route du moteur depuis l'appli (toujours derrière une confirmation dans l'appli)
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { vehicule_id, couper } = await request.json().catch(() => ({}));
  const { data: v } = await c.supabase.from('vehicules').select('id, agence_id, traceur_id, traceurs(imei, modele)').eq('id', vehicule_id).maybeSingle();
  const imei = (v as any)?.traceurs?.imei;
  if (!v || !imei) return NextResponse.json({ erreur: 'Aucun traceur relié à ce véhicule.' }, { status: 400 });
  try {
    await imeiDeLAgence(c.supabase, imei);
    const r = await commandeMoteur(imei, !!couper, (v as any)?.traceurs?.modele);
    await c.supabase.from('traceurs').update({ moteur_coupe: !!couper }).eq('id', (v as any).traceur_id);
    await c.supabase.from('historique').insert({ agence_id: (v as any).agence_id, vehicule_id, action: couper ? 'Moteur coupé à distance' : 'Moteur remis en route', detail: 'depuis l’appli', auteur: c.user.id });
    return NextResponse.json({ ok: true, enLigne: r.enLigne });
  } catch (e: any) {
    return NextResponse.json({ erreur: e?.message ?? 'Commande impossible.' }, { status: 400 });
  }
}
