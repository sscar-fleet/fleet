import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { chargerLocation } from '@/lib/location';
import { edlPdf } from '@/lib/documents-pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// PDF de l'état des lieux (photos, compteur, carburant, signature), rangé dans le dossier et partagé par un lien valable 30 jours
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { location_id, type } = await request.json().catch(() => ({}));
  if (!location_id || (type !== 'depart' && type !== 'retour')) return NextResponse.json({ erreur: 'Demande incomplète.' }, { status: 400 });
  const { data: u } = await c.supabase.from('utilisateurs').select('agence_id').eq('id', c.user.id).single();
  if (!u) return NextResponse.json({ erreur: 'Agence introuvable.' }, { status: 400 });
  const d = await chargerLocation(c.supabase, u.agence_id, location_id);
  const e = d?.[type as 'depart' | 'retour'];
  if (!d || !e) return NextResponse.json({ erreur: 'État des lieux introuvable (encore en cours d’envoi ?).' }, { status: 404 });
  try {
    const octets = await edlPdf(d.agence, d.location, d.vehicule, d.client, e, d.dommages.filter((x: any) => x.edl_id === e.id));
    const chemin = `${u.agence_id}/edl/${e.id}/etat-des-lieux-${type}.pdf`;
    const { error } = await c.supabase.storage.from('documents').upload(chemin, octets, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    await c.supabase.from('etats_des_lieux').update({ pdf_path: chemin }).eq('id', e.id);
    const { data: lien } = await c.supabase.storage.from('documents').createSignedUrl(chemin, 30 * 24 * 3600, { download: `etat-des-lieux-${type}-${d.vehicule.immatriculation}.pdf` });
    return NextResponse.json({ lien: lien?.signedUrl ?? null, photos: e.photos.length });
  } catch (err: any) {
    return NextResponse.json({ erreur: 'PDF impossible : ' + (err?.message ?? 'erreur') }, { status: 500 });
  }
}
