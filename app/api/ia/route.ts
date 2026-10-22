import { NextResponse } from 'next/server';
import { clientApi, quotaIa } from '@/lib/api';
import { demanderAgent, type Message } from '@/lib/agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Fleet AI : une question (avec la conversation), une réponse et des actions à confirmer
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const plafond = await quotaIa(c.supabase);
  if (plafond) return NextResponse.json({ erreur: plafond }, { status: 429 });
  const { messages } = await request.json().catch(() => ({}));
  const historique: Message[] = (Array.isArray(messages) ? messages : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  if (!historique.length || historique[historique.length - 1].role !== 'user') return NextResponse.json({ erreur: 'Question vide.' }, { status: 400 });
  const { data: u } = await c.supabase.from('utilisateurs').select('agences(nom)').eq('id', c.user.id).single();
  const r = await demanderAgent(c.supabase, (u as any)?.agences?.nom ?? 'votre agence', historique);
  // Parcours découverte : première question posée à Fleet AI
  if (!r.erreur) {
    const { data: moi } = await c.supabase.from('utilisateurs').select('agence_id').eq('id', c.user.id).single();
    const { count } = await c.supabase.from('historique').select('id', { count: 'exact', head: true }).eq('action', 'Découverte : ia');
    if (moi?.agence_id && !count) await c.supabase.from('historique').insert({ agence_id: moi.agence_id, action: 'Découverte : ia', auteur: c.user.id });
  }
  return NextResponse.json(r, { status: r.erreur ? 503 : 200 });
}
