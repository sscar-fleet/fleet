import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { executerAction } from '@/lib/agent';

export const dynamic = 'force-dynamic';

// L'utilisateur a touché le bouton d'une action proposée par Fleet AI
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { proposition } = await request.json().catch(() => ({}));
  try {
    return NextResponse.json({ message: await executerAction(c.supabase, c.user.id, proposition) });
  } catch (e: any) {
    return NextResponse.json({ erreur: e?.message ?? 'Action impossible.' }, { status: 400 });
  }
}
