import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { suiviAgence, kmEstime } from '@/lib/telematique';
import { champsVus } from '@/lib/whatsgps';

export const dynamic = 'force-dynamic';
export const maxDuration = 40;

// Positions des véhicules de l'agence pour l'appli téléphone
export async function GET(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const [{ data: vehicules }, suivi] = await Promise.all([
    c.supabase.from('vehicules').select('id, traceurs(*)').neq('statut', 'sorti'),
    suiviAgence(c.supabase),
  ]);
  const liste = (vehicules ?? []).filter((v: any) => v.traceurs).map((v: any) => {
    const t = v.traceurs; const e = suivi.etats.get(String(t.imei));
    const etat = !e ? 'hors_ligne' : t.moteur_coupe ? 'coupe' : !e.enLigne ? 'hors_ligne' : e.enMouvement ? 'roule' : 'arret';
    return { vehicule_id: v.id, imei: t.imei, etat, moteur_coupe: !!t.moteur_coupe, lat: e?.lat ?? null, lng: e?.lng ?? null,
      vitesse: e?.vitesse ?? 0, contact: e?.contact ?? null, le: e?.le ?? null, km_estime: kmEstime(t, e), alerte: e?.alerte ?? null };
  });
  return NextResponse.json({ actif: suivi.actif, demo: suivi.actif ? suivi.demo : false, raison: suivi.raison ?? null, vehicules: liste,
    ...(new URL(request.url).searchParams.has('champs') ? { champs: champsVus, boitiers: suivi.disponibles.map((d) => [d.imei, d.nom, d.enLigne]) } : {}) },
    { headers: { 'cache-control': 'no-store' } });
}
