import { NextResponse } from 'next/server';
import { antaiConfigure } from '@/lib/antai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tournée ANTAI de 8 h et 14 h (Vercel Cron) : déclaration de la flotte, nouvelles infractions, réponses aux désignations.
// Ne fait rien tant que ANTAI_CRON n'est pas à 1 (mise en service décidée par SS CAR FLEET).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  if (process.env.ANTAI_CRON !== '1' || !antaiConfigure()) return NextResponse.json({ ok: true, inactif: true });
  const m = await import('@/lib/antaiAmendes');
  const bilan: Record<string, unknown> = {};
  // Chaque étape est indépendante : une erreur n'empêche pas les suivantes. Pas de nouvel essai ici (prochain passage à 14 h ou 8 h).
  for (const [nom, f] of [['flotte', m.synchroniserFlotte], ['infractions', m.recupererInfractions], ['statuts', m.suivreStatuts]] as const) {
    try { bilan[nom] = await (f as () => Promise<unknown>)(); } catch (e: any) { bilan[nom] = { erreur: e?.message ?? String(e) }; if (/Connexion|suspendue/i.test(e?.message ?? '')) break; }
  }
  return NextResponse.json({ ok: true, bilan });
}
