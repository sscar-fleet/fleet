import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { calculerNotifications, resumeDuJour } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function profilDe(c: any) {
  const { data } = await c.supabase.from('utilisateurs').select('id, role, agence_id').eq('id', c.user.id).maybeSingle();
  return data;
}

// Liste des notifications (logiciel et appli) ; ?resume=1 ajoute le point du jour écrit par l'IA
export async function GET(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const profil = await profilDe(c);
  if (!profil) return NextResponse.json({ notifications: [], urgentes: 0 });
  const r = await calculerNotifications(c.supabase, profil);
  const avecResume = new URL(request.url).searchParams.get('resume') === '1';
  const resume = avecResume ? await resumeDuJour(c.supabase, profil.agence_id, profil.role, r.notifications).catch(() => null) : null;
  return NextResponse.json({ ...r, resume }, { headers: { 'cache-control': 'no-store' } });
}

// Reporter à demain ou ignorer une notification
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const profil = await profilDe(c);
  const { cle, mode } = await request.json().catch(() => ({}));
  if (!profil || typeof cle !== 'string' || !['demain', 'ignorer'].includes(mode)) return NextResponse.json({ erreur: 'Demande invalide.' }, { status: 400 });
  const demain = new Date(); demain.setHours(demain.getHours() + 20);
  const { error } = await c.supabase.from('notifications_etat').upsert({ utilisateur_id: profil.id, agence_id: profil.agence_id, cle, ignoree: mode === 'ignorer', jusqua: mode === 'demain' ? demain.toISOString() : null });
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
