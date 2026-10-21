// Client de l'API WhatsGPS (traceurs Seeworld). Appelé uniquement côté serveur :
// les clés et le mot de passe restent dans les variables d'environnement de Vercel.
//   WHATSGPS_APP_KEY, WHATSGPS_SECRET_KEY : clés de l'application OpenAPI (données par Seeworld)
//   WHATSGPS_COMPTE, WHATSGPS_MOT_DE_PASSE : compte WhatsGPS principal de SS CAR SYSTEM
//   WHATSGPS_UNITE_KM (facultatif) : « m » ou « km » si le kilométrage remonté est mal interprété

// Les appels passent par le relais à IP fixe (exigé par Seeworld) quand il est configuré
const BASE = (process.env.WHATSGPS_RELAIS_URL || 'https://www.whatsgps.com').trim().replace(/\/$/, '');

export type EtatTraceur = {
  imei: string;
  carId: number | null;
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
      imei: `86000000000000${i + 1}`, carId: i + 1,
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

async function lire(rep: Response) {
  const texte = await rep.text();
  let json: any = null;
  try { json = JSON.parse(texte); } catch { /* réponse non JSON */ }
  if (!rep.ok || !json) throw new Error(`Suivi GPS indisponible (${BASE.includes('relais') ? 'via relais' : 'en direct'}, clé ${(process.env.WHATSGPS_SECRET_KEY ?? '').trim().length} car., ${rep.status}${json?.code ? ' ' + json.code : ''}${json?.msg ? ' : ' + json.msg : texte && !json ? ' : ' + texte.slice(0, 80) : ''}).`);
  return json;
}

async function connexion(forcer = false) {
  if (!whatsgpsConfigure()) throw new Error('Le suivi GPS n’est pas encore branché (clés WhatsGPS manquantes).');
  if (session && !forcer && session.expire > Date.now()) return session;
  const q = new URLSearchParams({
    name: process.env.WHATSGPS_COMPTE!.trim(), password: process.env.WHATSGPS_MOT_DE_PASSE!.trim(),
    lang: 'fr', timeZoneSecond: String(2 * 3600),
  });
  const json = await lire(await fetch(`${BASE}/user/login.do?${q}`, { headers: entetes(), cache: 'no-store' }));
  if (json.ret !== 1 || !json.data?.token) throw new Error(`Connexion WhatsGPS refusée : ${json.msg || 'identifiants à vérifier'}.`);
  session = { token: json.data.token, userId: Number(json.data.userId), expire: Date.now() + 6 * 3600 * 1000 };
  return session;
}

// Appel avec reconnexion automatique si le jeton a expiré
async function appel(chemin: string, init: { query?: Record<string, string>; corps?: any } = {}) {
  for (let essai = 0; essai < 2; essai++) {
    const s = await connexion(essai > 0);
    const url = `${BASE}${chemin}${init.query ? '?' + new URLSearchParams(init.query) : ''}`;
    const rep = await fetch(url, init.corps
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
    carId: d.carId != null ? Number(d.carId) : null,
    lat: isFinite(lat) && lat !== 0 ? lat : null,
    lng: isFinite(lng) && lng !== 0 ? lng : null,
    vitesse: Number(d.speed ?? 0) || 0,
    contact: d.accStatus === 1 ? true : d.accStatus === 0 ? false : null,
    enLigne: Number(d.online) === 1,
    enMouvement: Number(d.run) === 1 || Number(d.speed ?? 0) > 3,
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
  if (m && Date.now() - m.quand < 15_000) return m.etats;
  const s = await connexion();
  const data = await appel('/carStatus/getByUserId.do', { query: { targetUserId: String(compteId || s.userId), mapType: '2' } });
  const etats = (Array.isArray(data) ? data : []).map(etat).filter((e) => e.imei);
  memoire.set(cle, { quand: Date.now(), etats });
  return etats;
}

// Coupure (couper = true) ou remise en route du moteur. Renvoie si le boîtier était en ligne.
export async function commandeMoteur(imei: string, couper: boolean): Promise<{ enLigne: boolean; numero: string | null }> {
  if (whatsgpsDemo()) return { enLigne: true, numero: 'demo' };
  const data = await appel('/remoteControl/controlPoil.do', { corps: { imei, on: couper ? 1 : 0 } });
  memoire.clear();
  return { enLigne: data?.online !== false, numero: data?.serNO ?? null };
}
