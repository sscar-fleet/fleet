import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { famillesDe, choixComplets } from '@/lib/choixPush';

export const dynamic = 'force-dynamic';

// Notifications choisies par l'utilisateur (lecture et enregistrement)
export async function GET(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const [{ data }, { data: u }] = await Promise.all([
    c.supabase.from('preferences_push').select('choix').eq('utilisateur_id', c.user.id).maybeSingle(),
    c.supabase.from('utilisateurs').select('acces, agences(metier)').eq('id', c.user.id).maybeSingle(),
  ]);
  return NextResponse.json({ familles: famillesDe((u as any)?.agences?.metier, (u as any)?.agences?.metier === 'transport' && (u as any)?.acces === 'chauffeur'), choix: choixComplets(data?.choix) });
}

export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { choix } = await request.json().catch(() => ({}));
  const { data: profil } = await c.supabase.from('utilisateurs').select('id, agence_id').eq('id', c.user.id).maybeSingle();
  if (!profil) return NextResponse.json({ erreur: 'Compte introuvable.' }, { status: 400 });
  const propre = choixComplets(choix && typeof choix === 'object' ? choix : {});
  const { error } = await c.supabase.from('preferences_push').upsert({ utilisateur_id: profil.id, agence_id: profil.agence_id, choix: propre, maj_le: new Date().toISOString() });
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, choix: propre });
}
