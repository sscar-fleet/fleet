import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Nouvelle séance de scan par téléphone (depuis l'ordinateur ou l'appli) : renvoie le lien à ouvrir sur le téléphone
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { client_id } = await request.json().catch(() => ({}));
  const { data: u } = await c.supabase.from('utilisateurs').select('agence_id').eq('id', c.user.id).single();
  if (!u) return NextResponse.json({ erreur: 'Agence introuvable.' }, { status: 400 });
  const { data, error } = await c.supabase.from('scans').insert({ agence_id: u.agence_id, client_id: client_id || null, cree_par: c.user.id })
    .select('id, jeton, expire_le').single();
  if (error) return NextResponse.json({ erreur: error.message.includes('scans') ? 'La mise à jour « scan par téléphone » n’est pas encore installée.' : error.message }, { status: 400 });
  const origine = new URL(request.url).origin;
  return NextResponse.json({ ...data, lien: `${origine}/scan/${data.jeton}` });
}
