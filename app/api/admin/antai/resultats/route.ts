import { NextResponse } from 'next/server';
import { supabaseServeur } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Résultats du cahier de tests ANTAI, pour remplir le fichier à renvoyer à l'ANTAI. Réservé à SS CAR FLEET.
export async function GET() {
  const { data: admin } = await supabaseServeur().rpc('est_admin');
  if (!admin) return NextResponse.json({ erreur: 'Réservé à SS CAR FLEET.' }, { status: 403 });
  const { data } = await supabaseAdmin().from('antai_tests').select('*').eq('env', 'sandbox').order('numero');
  return NextResponse.json(data ?? []);
}
