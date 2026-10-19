// Suivi GPS à l'échelle de l'agence : seuls les traceurs du compte de l'agence sont visibles.
import { etatsDuCompte, whatsgpsConfigure, type EtatTraceur } from './whatsgps';

export type { EtatTraceur };
export type Suivi =
  | { actif: false; raison: string; etats: Map<string, EtatTraceur>; disponibles: EtatTraceur[] }
  | { actif: true; raison?: undefined; etats: Map<string, EtatTraceur>; disponibles: EtatTraceur[] };

const vide = (raison: string): Suivi => ({ actif: false, raison, etats: new Map(), disponibles: [] });

// etats : traceurs reliés à l'agence (par IMEI) ; disponibles : boîtiers du compte pas encore reliés
export async function suiviAgence(supabase: any): Promise<Suivi> {
  const { data: compte, error } = await supabase.from('telematique').select('fournisseur, compte_externe_id').maybeSingle();
  if (error) return vide('Suivi GPS en cours d’installation.');
  if (!compte) return vide('Le suivi GPS n’est pas activé pour votre agence. Demandez-le à SS CAR SYSTEM.');
  if (!whatsgpsConfigure()) return vide('Le suivi GPS sera actif dès que les clés WhatsGPS seront ajoutées.');
  try {
    const [tous, { data: traceurs }] = await Promise.all([
      etatsDuCompte(compte.compte_externe_id),
      supabase.from('traceurs').select('imei'),
    ]);
    const relies = new Set((traceurs ?? []).map((t: any) => String(t.imei)));
    const etats = new Map<string, EtatTraceur>();
    tous.forEach((e) => { if (relies.has(e.imei)) etats.set(e.imei, e); });
    return { actif: true, etats, disponibles: tous.filter((e) => !relies.has(e.imei)) };
  } catch (e: any) {
    return vide(e?.message || 'Suivi GPS momentanément indisponible.');
  }
}

// Vérifie qu'un IMEI appartient bien au compte de l'agence (avant de le relier ou de couper un moteur)
export async function imeiDeLAgence(supabase: any, imei: string) {
  const { data: compte } = await supabase.from('telematique').select('compte_externe_id').maybeSingle();
  if (!compte) throw new Error('Le suivi GPS n’est pas activé pour votre agence.');
  const tous = await etatsDuCompte(compte.compte_externe_id);
  const e = tous.find((x) => x.imei === imei);
  if (!e) throw new Error('Ce boîtier n’est pas sur le compte de suivi de votre agence.');
  return e;
}

// Kilométrage du compteur estimé : dernier relevé du compteur + km faits depuis selon le traceur
export function kmEstime(traceur: any, e?: EtatTraceur | null): number | null {
  if (!e?.kmTraceur || traceur?.km_compteur_ref == null || traceur?.km_traceur_ref == null) return null;
  const fait = e.kmTraceur - Number(traceur.km_traceur_ref);
  return fait >= 0 ? traceur.km_compteur_ref + Math.round(fait) : null;
}

export function depuis(isoDate: string | null) {
  if (!isoDate) return 'jamais';
  const s = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
