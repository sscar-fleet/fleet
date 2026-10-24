import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';
import { suiviAgence, kmEstime } from '@/lib/telematique';
import { sansCoupure } from '@/lib/sourceGps';
import { historiquesTraccar, type Historique } from '@/lib/traccar';
import { adresseDe } from '@/lib/adresse';

export const dynamic = 'force-dynamic';
export const maxDuration = 40;

// Positions des véhicules de l'agence pour l'appli téléphone, avec l'adresse, depuis quand le moteur est
// allumé ou la voiture garée, la tension du boîtier et les km du jour (boîtiers sur notre serveur)
export async function GET(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const [{ data: vehicules }, suivi, histos] = await Promise.all([
    c.supabase.from('vehicules').select('id, traceurs(*)').neq('statut', 'sorti'),
    suiviAgence(c.supabase),
    historiquesTraccar().catch(() => new Map<string, Historique>()),
  ]);
  const liste = await Promise.all((vehicules ?? []).filter((v: any) => v.traceurs).map(async (v: any) => {
    const t = v.traceurs; const e = suivi.etats.get(String(t.imei));
    const etat = !e ? 'hors_ligne' : t.moteur_coupe ? 'coupe' : !e.enLigne ? 'hors_ligne' : e.enMouvement ? 'roule' : 'arret';
    const h = e?.source === 'direct' ? histos.get(String(t.imei)) : undefined;
    const adresse = e?.lat != null && e?.lng != null ? await adresseDe(e.lat, e.lng) : null;
    return { vehicule_id: v.id, imei: t.imei, etat, moteur_coupe: !!t.moteur_coupe, lat: e?.lat ?? null, lng: e?.lng ?? null,
      vitesse: e?.vitesse ?? 0, contact: e?.contact ?? null, le: e?.le ?? null, km_estime: kmEstime(t, e), alerte: e?.alerte ?? null,
      coupure: !sansCoupure(t.modele), direct: e?.source === 'direct', adresse,
      contact_depuis: h?.contactLe ?? null, arret_depuis: etat === 'roule' ? null : h?.arretLe ?? null,
      tension: e?.tension ?? null, satellites: e?.satellites ?? null, km_jour: h?.kmJour ?? null, minutes_route: h?.minutesRoute ?? null };
  }));
  return NextResponse.json({ actif: suivi.actif, demo: suivi.actif ? suivi.demo : false, raison: suivi.raison ?? null, vehicules: liste },
    { headers: { 'cache-control': 'no-store' } });
}
