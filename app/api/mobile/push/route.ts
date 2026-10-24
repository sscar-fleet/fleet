import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { adminConfigure, supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Enregistrement (ou retrait à la déconnexion) du téléphone qui reçoit les notifications
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { jeton, plateforme, actif } = await request.json().catch(() => ({}));
  if (typeof jeton !== 'string' || !/^Expo(nent)?PushToken\[.+\]$/.test(jeton)) return NextResponse.json({ erreur: 'Téléphone non reconnu.' }, { status: 400 });
  const { data: profil } = await c.supabase.from('utilisateurs').select('id, agence_id').eq('id', c.user.id).maybeSingle();
  if (!profil) return NextResponse.json({ erreur: 'Compte introuvable.' }, { status: 400 });
  // Un téléphone peut changer de compte (déconnexion puis connexion d'un collègue) : la clé serveur réattribue la ligne
  const db = adminConfigure() ? supabaseAdmin() : c.supabase;
  const { error } = await db.from('appareils_push').upsert({
    jeton, utilisateur_id: profil.id, agence_id: profil.agence_id, plateforme: typeof plateforme === 'string' ? plateforme.slice(0, 10) : null,
    actif: actif !== false, vu_le: new Date().toISOString(),
  }, { onConflict: 'jeton' });
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
