import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { creerFixes, remplirSemaine, lundiValide } from '@/lib/transport';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// « Remplir la semaine » depuis l'appli : mêmes règles que le logiciel
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { lundi: brut } = await request.json().catch(() => ({}));
  const lundi = lundiValide(brut);
  if (!lundi) return NextResponse.json({ erreur: 'Semaine invalide.' }, { status: 400 });
  const { data: u } = await c.supabase.from('utilisateurs').select('agence_id, acces, agences(regles_transport)').eq('id', c.user.id).maybeSingle();
  if (!u || (u as any).acces === 'chauffeur') return NextResponse.json({ erreur: 'Réservé aux responsables.' }, { status: 403 });
  try {
    await creerFixes(c.supabase, (u as any).agence_id, lundi);
    const r = await remplirSemaine(c.supabase, lundi, (u as any).agences?.regles_transport);
    const message = !r.total ? 'Aucune tournée à planifier cette semaine' : r.manques ? `Planning rempli : ${r.manques} tournée${r.manques > 1 ? 's' : ''} sans chauffeur ou sans camion` : `Planning rempli : ${r.placees} tournées affectées`;
    return NextResponse.json({ ok: true, message });
  } catch (e: any) {
    return NextResponse.json({ erreur: e?.message ?? 'Planning impossible.' }, { status: 400 });
  }
}
