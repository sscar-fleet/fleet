import { NextResponse } from 'next/server';
import { utilisateurCourant } from '@/lib/agence';
import { traccarConfigure, alertesTraccar } from '@/lib/traccar';

export const dynamic = 'force-dynamic';

// Alertes en direct de notre serveur GPS (sans quota) pour les boîtiers de l'agence, 15 dernières minutes
export async function GET() {
  let supabase: any;
  try { ({ supabase } = await utilisateurCourant()); } catch { return NextResponse.json({ actif: false }, { status: 401 }); }
  if (!traccarConfigure()) return NextResponse.json({ actif: false });
  try {
    const { data: vs } = await supabase.from('vehicules').select('id, immatriculation, traceurs(imei)').not('traceur_id', 'is', null);
    const parImei = new Map<string, any>((vs ?? []).filter((v: any) => v.traceurs?.imei).map((v: any) => [String(v.traceurs.imei), v]));
    if (!parImei.size) return NextResponse.json({ actif: true, alertes: [] });
    const alertes = (await alertesTraccar(0.25)).flatMap((a) => {
      const v = a.imei ? parImei.get(a.imei) : null;
      return v ? [{ id: a.id, libelle: a.libelle, critique: !!a.critique, le: a.le, vehicule_id: v.id, immat: v.immatriculation }] : [];
    });
    return NextResponse.json({ actif: true, alertes }, { headers: { 'cache-control': 'no-store' } });
  } catch { return NextResponse.json({ actif: true, alertes: [] }); }
}
