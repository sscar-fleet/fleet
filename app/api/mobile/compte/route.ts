import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { adminConfigure, supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Suppression du compte depuis l'appli (exigence Apple, règle 5.1.1 v) :
//  - employé : son accès est supprimé tout de suite (les fiches de l'agence restent à l'agence) ;
//  - gérant : la suppression de l'agence et de ses données est demandée à SS CAR FLEET, faite sous 7 jours
//    (le gérant est prévenu à l'écran ; les factures restent conservées le temps exigé par la loi).
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  if (!adminConfigure()) return NextResponse.json({ erreur: 'Service indisponible, réessayez plus tard.' }, { status: 503 });
  const db = supabaseAdmin();
  const { data: profil } = await db.from('utilisateurs').select('id, role, agence_id, nom').eq('id', c.user.id).maybeSingle();
  const quand = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  if (!profil || profil.role !== 'gerant') {
    await db.from('appareils_push').delete().eq('utilisateur_id', c.user.id);
    if (profil) await db.from('utilisateurs').delete().eq('id', profil.id);
    const { error } = await db.auth.admin.deleteUser(c.user.id);
    if (error) return NextResponse.json({ erreur: 'La suppression n’a pas abouti, réessayez.' }, { status: 400 });
    return NextResponse.json({ ok: true, immediat: true });
  }
  const { data: a } = await db.from('agences').select('note_admin').eq('id', profil.agence_id).maybeSingle();
  const note = `SUPPRESSION DU COMPTE DEMANDÉE le ${quand} par ${profil.nom ?? c.user.email}. ${a?.note_admin ?? ''}`.slice(0, 1000);
  await db.from('agences').update({ note_admin: note }).eq('id', profil.agence_id);
  return NextResponse.json({ ok: true, immediat: false });
}
