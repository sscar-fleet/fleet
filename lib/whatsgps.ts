import { CODES_ALARME, ALARMES_CRITIQUES } from './codesAlarme';
// Client de l'API WhatsGPS (traceurs Seeworld). Appelé uniquement côté serveur :
// les clés et le mot de passe restent dans les variables d'environnement de Vercel.
//   WHATSGPS_APP_KEY, WHATSGPS_SECRET_KEY : clés de l'application OpenAPI (données par Seeworld)
//   WHATSGPS_COMPTE, WHATSGPS_MOT_DE_PASSE : compte WhatsGPS principal de SS CAR SYSTEM
//   WHATSGPS_UNITE_KM (facultatif) : « m » ou « km » si le kilométrage remonté est mal interprété

// Les appels passent par le relais à IP fixe (exigé par Seeworld) quand il est configuré
const BASE = (process.env.WHATSGPS_RELAIS_URL || 'https://www.whatsgps.com').trim().replace(/\/$/, '');

export type EtatTraceur = {
  imei: string;
  nom: string | null;         // nom donné au boîtier sur WhatsGPS (ex. « X-ADV Singh »)
  carId: string | null;       // identifiant WhatsGPS, gardé en texte (trop grand pour un nombre JavaScript)
  lat: number | null;
  lng: number | null;
  vitesse: number;            // km/h
  contact: boolean | null;    // moteur allumé (ACC)
  enLigne: boolean;
  enMouvement: boolean;
  le: string | null;          // date de la dernière position (ISO)
  signal: string | null;      // date du dernier signal (ISO)
  kmTraceur: number | null;   // kilométrage total calculé par le traceur, en km
  alerte: string | null;
};

// Tant que les clés ne sont pas là, une flotte fictive permet de voir le rendu (positions autour de Paris)
export const whatsgpsDemo = () => !whatsgpsConfigure();
const lieuxDemo: [number, number, string][] = [
  [48.8432, 2.2946, 'Paris 15e'], [48.8920, 2.2380, 'La Défense'], [48.7262, 2.3652, 'Orly'],
  [48.9245, 2.3602, 'Saint-Denis'], [48.8350, 2.2410, 'Boulogne'], [48.8476, 2.4390, 'Vincennes'],
];
function etatsDemo(): EtatTraceur[] {
  const t = Date.now() / 1000;
  return lieuxDemo.map(([lat, lng], i) => {
    const roule = i % 3 === 0;
    const derive = roule ? 0.004 : 0.0003;
    return {
      imei: `86000000000000${i + 1}`, nom: null, carId: String(i + 1),
      lat: lat + Math.sin(t / 90 + i) * derive, lng: lng + Math.cos(t / 90 + i) * derive,
      vitesse: roule ? 35 + Math.round(Math.abs(Math.sin(t / 30 + i)) * 40) : 0,
      contact: roule || i === 1, enLigne: i !== 5, enMouvement: roule,
      le: new Date(Date.now() - (i === 5 ? 3 * 3600_000 : 20_000)).toISOString(),
      signal: new Date().toISOString(),
      kmTraceur: 12_000 + i * 3_100 + Math.round((t - 1_792_000_000) / 3600),
      alerte: i === 4 ? 'Vibration détectée' : null,
    };
  });
}

export const whatsgpsConfigure = () =>
  !!(process.env.WHATSGPS_APP_KEY && process.env.WHATSGPS_SECRET_KEY && process.env.WHATSGPS_COMPTE && process.env.WHATSGPS_MOT_DE_PASSE);

// Jeton de connexion gardé en mémoire tant que l'instance du serveur vit
let session: { token: string; userId: number; expire: number } | null = null;
// Petite mémoire des états (les positions se rafraîchissent toutes les 10 s côté traceur)
const memoire = new Map<string, { quand: number; etats: EtatTraceur[] }>();

function entetes(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'X-Auth-Version': '1',
    'X-App-Key': (process.env.WHATSGPS_APP_KEY ?? '').trim(),
    'X-Secret-Key': (process.env.WHATSGPS_SECRET_KEY ?? '').trim(),
    'Accept-Language': 'en',
  };
  if (token) h.Token = token;
  if (process.env.WHATSGPS_RELAIS_CLE) h['X-Relais-Cle'] = process.env.WHATSGPS_RELAIS_CLE.trim();
  return h;
}

// Empreintes courtes (8 premiers caractères du SHA-256) pour comparer les valeurs sans jamais les afficher
function empreintes() {
  const { createHash } = require('crypto');
  const e = (v?: string) => createHash('sha256').update((v ?? '').trim()).digest('hex').slice(0, 8);
  return `appkey ${e(process.env.WHATSGPS_APP_KEY)} secret ${e(process.env.WHATSGPS_SECRET_KEY)} compte ${e(process.env.WHATSGPS_COMPTE)} mdp ${e(process.env.WHATSGPS_MOT_DE_PASSE)}`;
}

// WhatsGPS limite le nombre d'appels par seconde (erreur 429 C08006) : on espace les appels
// d'au moins 1,1 s dans une même instance et on retente une fois après une pause si la limite est atteinte.
let dernierAppel = 0;
let file: Promise<unknown> = Promise.resolve();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
function fetchEspace(url: string, init: RequestInit): Promise<Response> {
  const tache = file.then(async () => {
    for (let essai = 0; essai < 3; essai++) {
      const attente = dernierAppel + 1100 - Date.now();
      if (attente > 0) await pause(attente);
      dernierAppel = Date.now();
      const t0 = Date.now();
      let rep: Response;
      try { rep = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) }); }
      catch { throw new Error(`Suivi GPS indisponible (pas de réponse de WhatsGPS en 12 s : ${url.split('?')[0].replace(BASE, '')}).`); }
      console.log('[whatsgps]', url.split('?')[0].replace(BASE, ''), rep.status, Date.now() - t0, 'ms');
      if (rep.status !== 429 || essai === 2) return rep;
      await pause(1500 * (essai + 1));
    }
    throw new Error('WhatsGPS : trop de demandes.');
  });
  file = tache.catch(() => {});
  return tache;
}

// Les identifiants WhatsGPS ont 19 chiffres : on les garde en texte avant de lire le JSON, sinon ils sont arrondis
const garderGrandsNombres = (t: string) => t.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
async function lire(rep: Response) {
  const texte = garderGrandsNombres(await rep.text());
  let json: any = null;
  try { json = JSON.parse(texte); } catch { /* réponse non JSON */ }
  if (!rep.ok || !json) throw new Error(`Suivi GPS indisponible (${rep.status}${json?.code ? ' ' + json.code : ''}${json?.msg ? ' : ' + json.msg : texte && !json ? ' : ' + texte.slice(0, 80) : ''}).`);
  return json;
}

// Le jeton est partagé entre toutes les instances du serveur via le cache de Vercel :
// WhatsGPS limite le nombre de connexions (C08006 Login rate limit exceeded), on se connecte donc au plus toutes les 3 h.
// Jeton partagé par toutes les instances du serveur, gardé en base (migration 0020).
// WhatsGPS limite les connexions (C08006 Login rate limit exceeded) : une connexion au plus toutes les 3 h,
// et après un refus on attend 2 min avant de réessayer, pour ne pas prolonger le blocage.
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
async function rpc(fn: string, args: Record<string, unknown>) {
  try {
    const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', cache: 'no-store',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    return r.ok ? await r.json().catch(() => null) : null;
  } catch { return null; }
}
const cleSecrete = () => (process.env.WHATSGPS_SECRET_KEY ?? '').trim() + '|' + (process.env.WHATSGPS_COMPTE ?? '').trim();

async function jetonPartage(forcer: boolean) {
  const lu = (await rpc('whatsgps_jeton_lire', { p_cle: cleSecrete() }))?.[0];
  if (!forcer && lu?.token && new Date(lu.expire).getTime() > Date.now()) return { token: String(lu.token), userId: Number(lu.user_id) };
  if (lu?.echec_jusqua && new Date(lu.echec_jusqua).getTime() > Date.now())
    throw new Error('Suivi GPS momentanément indisponible (WhatsGPS limite les connexions, nouvel essai dans 2 min).');
  const q = new URLSearchParams({
    name: process.env.WHATSGPS_COMPTE!.trim(), password: process.env.WHATSGPS_MOT_DE_PASSE!.trim(),
    lang: 'fr', timeZoneSecond: String(2 * 3600),
  });
  let json: any;
  try {
    json = await lire(await fetchEspace(`${BASE}/user/login.do?${q}`, { headers: entetes(), cache: 'no-store' }));
    if (json.ret !== 1 || !json.data?.token) throw new Error(`Connexion WhatsGPS refusée : ${json.msg || 'identifiants à vérifier'}.`);
  } catch (e) {
    await rpc('whatsgps_jeton_ecrire', { p_cle: cleSecrete(), p_token: null, p_user_id: null, p_expire: new Date().toISOString(), p_echec_jusqua: new Date(Date.now() + 120_000).toISOString() });
    throw e;
  }
  const j = { token: String(json.data.token), userId: Number(json.data.userId) };
  await rpc('whatsgps_jeton_ecrire', { p_cle: cleSecrete(), p_token: j.token, p_user_id: j.userId, p_expire: new Date(Date.now() + 3 * 3600_000).toISOString(), p_echec_jusqua: null });
  return j;
}

async function connexion(forcer = false) {
  if (!whatsgpsConfigure()) throw new Error('Le suivi GPS n’est pas encore branché (clés WhatsGPS manquantes).');
  if (session && !forcer && session.expire > Date.now()) return session;
  const j = await jetonPartage(forcer);
  session = { ...j, expire: Date.now() + 3 * 3600 * 1000 };
  return session;
}

// Appel avec reconnexion automatique si le jeton a expiré
async function appel(chemin: string, init: { query?: Record<string, string>; corps?: any } = {}) {
  for (let essai = 0; essai < 2; essai++) {
    const s = await connexion(essai > 0);
    const url = `${BASE}${chemin}${init.query ? '?' + new URLSearchParams(init.query) : ''}`;
    const rep = await fetchEspace(url, init.corps
      ? { method: 'POST', headers: { ...entetes(s.token), 'Content-Type': 'application/json' }, body: JSON.stringify(init.corps), cache: 'no-store' }
      : { headers: entetes(s.token), cache: 'no-store' });
    if (rep.status === 401 && essai === 0) { session = null; continue; }
    const json = await lire(rep);
    if (json.ret === 1) return json.data;
    const jetonExpire = /token|登录|login|expire|过期/i.test(String(json.msg ?? '') + String(json.code ?? ''));
    if (jetonExpire && essai === 0) { session = null; continue; }
    throw new Error(`WhatsGPS : ${json.msg || 'demande refusée'}.`);
  }
  throw new Error('WhatsGPS : connexion impossible.');
}

const iso = (ms: any) => (ms ? new Date(Number(ms)).toISOString() : null);

// Le traceur donne son kilométrage total ; selon les modèles il est en mètres ou en km
function versKm(valeur: any): number | null {
  const n = Number(valeur);
  if (!isFinite(n) || n <= 0) return null;
  const unite = process.env.WHATSGPS_UNITE_KM;
  if (unite === 'm') return Math.round(n / 1000);
  if (unite === 'km') return Math.round(n);
  return Math.round(n > 2_000_000 ? n / 1000 : n);
}

function etat(d: any): EtatTraceur {
  const lat = Number(d.latc ?? d.lat), lng = Number(d.lonc ?? d.lon);
  return {
    imei: String(d.imei ?? ''),
    nom: String(d.machineName ?? d.carName ?? d.carNO ?? d.plateNo ?? d.name ?? '').trim() || null,
    carId: d.carId != null ? String(d.carId) : null,
    lat: isFinite(lat) && lat !== 0 ? lat : null,
    lng: isFinite(lng) && lng !== 0 ? lng : null,
    vitesse: Number(d.speed ?? 0) || 0,
    contact: d.accStatus === 1 ? true : d.accStatus === 0 ? false : null,
    enLigne: Number(d.online) === 1,
    // « run » reste à 1 longtemps après l'arrêt : seule la vitesse dit vraiment si le véhicule roule
    enMouvement: Number(d.speed ?? 0) > 3,
    le: iso(d.pointTime),
    signal: iso(d.heartTime),
    kmTraceur: versKm(d.totalMileage),
    alerte: d.alarm ? String(d.alarm) : null,
  };
}

// Toute la flotte d'un compte WhatsGPS en un seul appel. compteId vide = compte principal.
export async function etatsDuCompte(compteId?: number | string | null): Promise<EtatTraceur[]> {
  if (whatsgpsDemo()) return etatsDemo();
  const cle = String(compteId ?? 'principal');
  const m = memoire.get(cle);
  if (m && Date.now() - m.quand < 30_000) return m.etats;
  const s = await connexion();
  const data = await appel('/carStatus/getByUserId.do', { query: { targetUserId: String(compteId || s.userId), mapType: '2' } });
  const brut = Array.isArray(data) ? data : [];
  const etats = brut.map(etat).filter((e) => e.imei);
  memoire.set(cle, { quand: Date.now(), etats });
  return etats;
}

// Coupure (couper = true) ou remise en route du moteur. Renvoie si le boîtier était en ligne.
export async function commandeMoteur(imei: string, couper: boolean): Promise<{ enLigne: boolean; numero: string | null }> {
  if (whatsgpsDemo()) return { enLigne: true, numero: 'demo' };
  // La documentation WhatsGPS demande aussi le jeton dans le corps de la requête
  const s = await connexion();
  const data = await appel('/remoteControl/controlPoil.do', { corps: { imei, on: couper ? 1 : 0, token: s.token } });
  memoire.clear();
  return { enLigne: data?.online !== false, numero: data?.serNO ?? null };
}

// ——— Fiches des boîtiers d'un compte (plaque, nom, SIM) : sert à importer la flotte en un geste ———
export type FicheBoitier = { imei: string; carId: string | null; nom: string | null; plaque: string | null; iccid: string | null; conducteur: string | null };
const PLAQUE = /\b([A-Z]{2})[\s-]?(\d{3})[\s-]?([A-Z]{2})\b/;
// Une plaque française (AB-123-CD) écrite dans le champ plaque ou dans le nom du boîtier
export function plaqueDans(...textes: (string | null | undefined)[]): string | null {
  for (const t of textes) { const m = PLAQUE.exec(String(t ?? '').toUpperCase()); if (m) return `${m[1]}${m[2]}${m[3]}`; }
  return null;
}
export async function fichesDuCompte(compteId?: number | string | null): Promise<FicheBoitier[]> {
  if (whatsgpsDemo()) return etatsDemo().map((e, i) => ({ imei: e.imei, carId: e.carId, nom: ['Clio V', '208', 'Golf 8', 'Classe A', 'Model 3', 'Duster'][i] ?? null, plaque: ['GA123BC', 'GB456CD', 'GC789DE', 'GD012EF', 'GE345FG', 'GF678GH'][i] ?? null, iccid: null, conducteur: null }));
  const s = await connexion();
  const data = await appel('/car/getByUserId.do', { query: { userId: String(compteId || s.userId) } });
  return (Array.isArray(data) ? data : []).filter((d: any) => d.imei).map((d: any) => ({
    imei: String(d.imei), carId: d.carId != null ? String(d.carId) : null,
    nom: String(d.machineName ?? '').trim() || null,
    plaque: plaqueDans(d.carNO, d.machineName),
    iccid: d.iccid ? String(d.iccid).replace(/\D/g, '') || null : null,
    conducteur: String(d.driverName ?? '').trim() || null,
  }));
}

// ——— Alertes des boîtiers (vibration, remorquage, débranchement…) ———
export type AlerteBoitier = { id: string; carId: string | null; nom: string | null; type: number | null; libelle: string; critique?: boolean; le: string | null; lat: number | null; lng: number | null };
// WhatsGPS attend et renvoie des heures dans le fuseau donné à la connexion (Paris)
function decalage(d = new Date()) {
  const p = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const u = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((p.getTime() - u.getTime()) / 1000);
}
const versParis = (d: Date) => new Date(d.getTime() + decalage(d) * 1000).toISOString().slice(0, 19).replace('T', ' ');
function depuisParis(t: any): string | null {
  if (t == null || t === '') return null;
  if (typeof t === 'number') return new Date(t).toISOString();
  const brut = new Date(String(t).replace(' ', 'T') + 'Z');
  return isNaN(brut.getTime()) ? null : new Date(brut.getTime() - decalage(brut) * 1000).toISOString();
}
// Noms des types d'alerte donnés par WhatsGPS lui-même (réglages d'alertes du compte), gardés 6 h
let nomsTypes: { quand: number; noms: Map<number, string> } | null = null;
async function nomsDesAlertes(): Promise<Map<number, string>> {
  if (nomsTypes && Date.now() - nomsTypes.quand < 6 * 3600_000) return nomsTypes.noms;
  const noms = new Map<number, string>();
  try {
    const s = await connexion();
    const data = await appel('/userCarAlarmSwitch/getByUserId.do', { query: { userId: String(s.userId) } });
    const liste: any[] = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : [];
    liste.forEach((x: any) => { if (x?.type != null && x?.name) noms.set(Number(x.type), String(x.name)); });
  } catch { /* service pas ouvert : on affichera un libellé générique */ }
  nomsTypes = { quand: Date.now(), noms };
  return noms;
}
// Libellés en français pour les noms anglais renvoyés par WhatsGPS
const TRADUCTIONS: [RegExp, string][] = [
  [/vibra|shock/i, 'Vibration détectée'], [/tow|move|displace|移/i, 'Véhicule déplacé moteur coupé'],
  [/power.?(off|cut|failure)|disconnect|断电/i, 'Boîtier débranché'], [/low.?(battery|volt)|低电/i, 'Batterie faible'],
  [/fence.*(out|exit)|出围栏/i, 'Sortie de zone'], [/fence.*(in|enter)|进围栏/i, 'Entrée dans une zone'], [/fence|围栏/i, 'Zone'],
  [/over.?speed|超速/i, 'Excès de vitesse'], [/sos/i, 'SOS'], [/jam|干扰/i, 'Brouillage'], [/acc.?on|ignition.?on/i, 'Contact mis'],
  [/acc.?off|ignition.?off/i, 'Contact coupé'], [/offline|离线/i, 'Boîtier hors ligne'], [/stay|park|停留/i, 'Stationnement prolongé'],
];
const enFrancais = (t: string) => TRADUCTIONS.find(([re]) => re.test(t))?.[1] ?? t;
let memoireAlertes: { quand: number; liste: any[] } | null = null;
// Alertes récentes de tout le parc ; le filtrage par agence se fait sur les identifiants de ses boîtiers
export async function alertesRecentes(heures = 48): Promise<AlerteBoitier[]> {
  if (whatsgpsDemo()) return [{ id: 'demo1', carId: '5', nom: 'Classe A', type: null, libelle: 'Vibration détectée', le: new Date(Date.now() - 2 * 3600_000).toISOString(), lat: 48.8350, lng: 2.2410 }];
  let brut: any[];
  if (memoireAlertes && Date.now() - memoireAlertes.quand < 60_000) brut = memoireAlertes.liste;
  else {
    const data = await appel('/carAlarm/getAllByPage.do', { query: { startTime: versParis(new Date(Date.now() - heures * 3600_000)), endTime: versParis(new Date()), pageNO: '1', rowCount: '200', mapType: '2' } });
    brut = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : [];
    memoireAlertes = { quand: Date.now(), liste: brut };
  }
  const noms = await nomsDesAlertes();
  return brut.map((d: any, i: number) => {
    const type = d.alarmType != null ? Number(d.alarmType) : null;
    const nom = (type != null ? noms.get(type) : null) ?? d.alarmTypeName ?? d.fenceName ?? null;
    return {
      id: String(d.alarmId ?? i), carId: d.carId != null ? String(d.carId) : null, nom: d.machineName || null, type,
      libelle: (type != null && CODES_ALARME[type]) || (nom ? enFrancais(String(nom)) : 'Alerte du boîtier'),
      critique: type != null && ALARMES_CRITIQUES.has(type),
      le: depuisParis(d.alarmTime ?? d.pointTime), lat: Number(d.latC ?? d.lat) || null, lng: Number(d.lonC ?? d.lon) || null,
    };
  }).sort((a, b) => (b.le ?? '').localeCompare(a.le ?? ''));
}
