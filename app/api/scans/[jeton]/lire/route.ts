import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { lireDocument } from '@/lib/lecture';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Lecture du permis (ou de l'avis, de la carte grise) envoyé par le téléphone (sans connexion : le jeton de la séance fait foi)
export async function POST(request: Request, { params }: { params: { jeton: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: seance } = await supabase.rpc('voir_scan', { le_jeton: params.jeton });
  if (!seance) return NextResponse.json({ erreur: 'Lien expiré.' }, { status: 403 });
  const { image, genre } = await request.json().catch(() => ({}));
  if (!['permis', 'identite', 'fps', 'amende', 'carte_grise'].includes(genre)) return NextResponse.json({ erreur: 'Document non pris en charge.' }, { status: 400 });
  const r = await lireDocument(image, genre);
  if (r.champs) await supabase.rpc('scan_champs', { le_jeton: params.jeton, valeurs: r.champs });
  return NextResponse.json(r.champs ? { champs: r.champs } : { erreur: r.erreur }, { status: r.statut });
}
