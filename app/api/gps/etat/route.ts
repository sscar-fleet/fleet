import { NextResponse } from 'next/server';
import { utilisateurCourant } from '@/lib/agence';
import { traccarConfigure, etatsTraccar } from '@/lib/traccar';

export const dynamic = 'force-dynamic';

// Vérification du serveur GPS direct (aucun secret renvoyé) : configuré, joignable, nombre d'appareils
export async function GET() {
  try { await utilisateurCourant(); } catch { return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 }); }
  if (!traccarConfigure()) return NextResponse.json({ configure: false });
  try {
    const etats = await etatsTraccar();
    return NextResponse.json({ configure: true, joignable: true, appareils: etats.length,
      liste: etats.map((e) => ({ imei: e.imei, nom: e.nom, enLigne: e.enLigne, position: e.lat != null, le: e.le })) });
  } catch (e: any) {
    return NextResponse.json({ configure: true, joignable: false, erreur: e?.message ?? 'erreur' });
  }
}
