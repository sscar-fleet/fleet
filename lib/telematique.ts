// Suivi GPS à l'échelle de l'agence : seuls les traceurs du compte de l'agence sont visibles.
import { whatsgpsDemo, fichesDuCompte, type EtatTraceur, type FicheBoitier, type AlerteBoitier } from './whatsgps';
import { etatsFusionnes as etatsDuCompte, alertesFusionnees } from './sourceGps';

export type { EtatTraceur, FicheBoitier, AlerteBoitier };
export type Suivi =
  | { actif: false; raison: string; etats: Map<string, EtatTraceur>; disponibles: EtatTraceur[] }
  | { actif: true; raison?: undefined; demo: boolean; etats: Map<string, EtatTraceur>; disponibles: EtatTraceur[] };

const vide = (raison: string): Suivi => ({ actif: false, raison, etats: new Map(), disponibles: [] });

// etats : traceurs reliés à l'agence (par IMEI) ; disponibles : boîtiers du compte pas encore reliés
// Compte principal SS CAR SYSTEM (pas de sous-compte) : seul SS CAR SYSTEM (administrateur) voit tous les boîtiers
async function principalOuvert(supabase: any) {
  const { data } = await supabase.rpc('est_admin').then((r: any) => r, () => ({ data: false }));
  return data === true;
}

export async function suiviAgence(supabase: any): Promise<Suivi> {
  const { data: compte, error } = await supabase.from('telematique').select('fournisseur, compte_externe_id').maybeSingle();
  if (error) return vide('Suivi GPS en cours d’installation.');
  if (!compte) return vide('Le suivi GPS n’est pas activé pour votre agence. Demandez-le à SS CAR SYSTEM.');
  try {
    const [tous, { data: traceurs }] = await Promise.all([
      etatsDuCompte(compte.compte_externe_id),
      supabase.from('traceurs').select('imei'),
    ]);
    const relies = new Set((traceurs ?? []).map((t: any) => String(t.imei)));
    const etats = new Map<string, EtatTraceur>();
    tous.forEach((e) => { if (relies.has(e.imei)) etats.set(e.imei, e); });
    // Sans sous-compte à elle, l'agence ne voit que les boîtiers que SS CAR SYSTEM lui a rattachés (jamais ceux des autres clients)
    const disponibles = compte.compte_externe_id || await principalOuvert(supabase) ? tous.filter((e) => !relies.has(e.imei)) : [];
    return { actif: true, demo: whatsgpsDemo(), etats, disponibles };
  } catch (e: any) {
    return vide(e?.message || 'Suivi GPS momentanément indisponible.');
  }
}

// Vérifie qu'un IMEI appartient bien au compte de l'agence (avant de le relier ou de couper un moteur)
export async function imeiDeLAgence(supabase: any, imei: string) {
  const { data: compte } = await supabase.from('telematique').select('compte_externe_id').maybeSingle();
  if (!compte) throw new Error('Le suivi GPS n’est pas activé pour votre agence.');
  if (!compte.compte_externe_id && !(await principalOuvert(supabase))) {
    // Compte principal SS CAR SYSTEM : seulement un boîtier déjà rattaché à cette agence
    const { data: t } = await supabase.from('traceurs').select('imei').eq('imei', imei).maybeSingle();
    if (!t) throw new Error('Ce boîtier n’est pas rattaché à votre agence.');
  }
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

// Boîtiers du compte de l'agence pas encore reliés, avec plaque et nom lus chez WhatsGPS : prêts à importer
export async function boitiersAImporter(supabase: any): Promise<{ fiches: (FicheBoitier & { enLigne: boolean; existe: string | null })[]; erreur?: string }> {
  const { data: compte } = await supabase.from('telematique').select('compte_externe_id').maybeSingle();
  if (!compte || (!compte.compte_externe_id && !(await principalOuvert(supabase)))) return { fiches: [] }; // compte principal : réservé à SS CAR SYSTEM
  try {
    const [fiches, etats, { data: traceurs }, { data: vehicules }] = await Promise.all([
      fichesDuCompte(compte.compte_externe_id), etatsDuCompte(compte.compte_externe_id),
      supabase.from('traceurs').select('imei, vehicules(id)'), supabase.from('vehicules').select('id, immatriculation, traceur_id'),
    ]);
    const relies = new Set((traceurs ?? []).filter((t: any) => (Array.isArray(t.vehicules) ? t.vehicules.length : t.vehicules)).map((t: any) => String(t.imei)));
    const parPlaque = new Map((vehicules ?? []).map((v: any) => [String(v.immatriculation).replace(/[^A-Z0-9]/gi, '').toUpperCase(), v]));
    return { fiches: fiches.filter((f) => !relies.has(f.imei)).map((f) => {
      const v: any = f.plaque ? parPlaque.get(f.plaque) : null;
      return { ...f, enLigne: !!etats.find((e) => e.imei === f.imei)?.enLigne, existe: v && !v.traceur_id ? v.id : v ? 'relie' : null };
    }) };
  } catch (e: any) { return { fiches: [], erreur: e?.message || 'Suivi GPS momentanément indisponible.' }; }
}

// Alertes récentes des boîtiers de l'agence, rattachées à leur véhicule
export type AlerteVehicule = AlerteBoitier & { vehicule_id: string; immat: string };
export async function alertesAgence(supabase: any, suivi: Suivi, heures = 48): Promise<AlerteVehicule[]> {
  if (!suivi.actif || !suivi.etats.size) return [];
  try {
    const { data: vs } = await supabase.from('vehicules').select('id, immatriculation, traceurs(imei)').not('traceur_id', 'is', null);
    const parCar = new Map<string, any>(), parImei = new Map<string, any>();
    (vs ?? []).forEach((v: any) => {
      const imei = String(v.traceurs?.imei ?? ''); const e = suivi.etats.get(imei);
      if (e) parImei.set(imei, v); if (e?.carId) parCar.set(e.carId, v);
    });
    if (!parImei.size) return [];
    return (await alertesFusionnees(heures)).flatMap((a) => {
      const v = (a.imei && parImei.get(a.imei)) || (a.carId && parCar.get(a.carId));
      return v ? [{ ...a, vehicule_id: v.id, immat: v.immatriculation }] : [];
    });
  } catch { return []; }
}
