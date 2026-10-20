import { plaque } from '@/lib/format';
import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { chargerLocation } from '@/lib/location';
import { contratPdf, facturePdf, edlPdf } from '@/lib/documents-pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Documents d'une location fabriqués sur le serveur pour l'appli : contrat, facture, états des lieux.
// Le PDF est rangé dans le dossier de la location et partagé par un lien valable 30 jours.
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { location_id, genre } = await request.json().catch(() => ({}));
  if (!location_id || !['contrat', 'facture', 'edl_depart', 'edl_retour'].includes(genre)) return NextResponse.json({ erreur: 'Demande incomplète.' }, { status: 400 });
  const { data: u } = await c.supabase.from('utilisateurs').select('agence_id').eq('id', c.user.id).single();
  if (!u) return NextResponse.json({ erreur: 'Agence introuvable.' }, { status: 400 });
  const d = await chargerLocation(c.supabase, u.agence_id, location_id);
  if (!d) return NextResponse.json({ erreur: 'Location introuvable.' }, { status: 404 });
  try {
    let octets: Uint8Array;
    let nom: string;
    const numero = String(d.location.numero ?? '').padStart(5, '0');
    if (genre === 'contrat') { octets = await contratPdf(d.agence, d.location, d.vehicule, d.client); nom = `contrat-${numero}-${plaque(d.vehicule.immatriculation)}.pdf`; }
    else if (genre === 'facture') { octets = await facturePdf(d.agence, d.location, d.vehicule, d.client); nom = `facture-${numero}-${plaque(d.vehicule.immatriculation)}.pdf`; }
    else {
      const type = genre === 'edl_depart' ? 'depart' : 'retour';
      const e = d[type];
      if (!e) return NextResponse.json({ erreur: 'État des lieux introuvable (encore en cours d’envoi ?).' }, { status: 404 });
      octets = await edlPdf(d.agence, d.location, d.vehicule, d.client, e, d.dommages.filter((x: any) => x.edl_id === e.id));
      nom = `etat-des-lieux-${type}-${plaque(d.vehicule.immatriculation)}.pdf`;
    }
    const chemin = `${u.agence_id}/locations/${location_id}/${nom}`;
    const { error } = await c.supabase.storage.from('documents').upload(chemin, octets, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    const { data: lien } = await c.supabase.storage.from('documents').createSignedUrl(chemin, 30 * 24 * 3600);
    return NextResponse.json({ lien: lien?.signedUrl ?? null, nom });
  } catch (err: any) {
    return NextResponse.json({ erreur: 'PDF impossible : ' + (err?.message ?? 'erreur') }, { status: 500 });
  }
}
