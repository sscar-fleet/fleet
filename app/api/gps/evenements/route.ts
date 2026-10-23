import { NextResponse } from 'next/server';
import { supabaseServeur } from '@/lib/supabase';
import { evenementsBruts } from '@/lib/traccar';

export const dynamic = 'force-dynamic';

// Diagnostic réservé à SS CAR FLEET : événements bruts d'un boîtier sur notre serveur GPS (aucun secret renvoyé)
export async function GET(req: Request) {
  const supabase = supabaseServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  const { data: admin } = await supabase.rpc('est_admin');
  if (!admin) return NextResponse.json({ erreur: 'Réservé à SS CAR FLEET.' }, { status: 403 });
  const p = new URL(req.url).searchParams;
  const imei = (p.get('imei') ?? '').replace(/\D/g, '');
  const heures = Math.min(Math.max(Number(p.get('heures') ?? 24) || 24, 1), 168);
  if (!imei) return NextResponse.json({ erreur: 'IMEI manquant.' }, { status: 400 });
  try { return NextResponse.json(await evenementsBruts(imei, heures)); }
  catch (e: any) { return NextResponse.json({ erreur: e?.message ?? 'erreur' }, { status: 502 }); }
}
