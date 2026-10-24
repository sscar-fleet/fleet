// Serveur de géolocalisation SS CAR SYSTEM (Traccar). Les boîtiers en « double serveur » y envoient leur
// position en direct (commande DOUBLEIP,1# puis SERVER2,1,<adresse>,<port>#), sans quota.
// Tant que TRACCAR_URL et TRACCAR_JETON ne sont pas renseignés sur Vercel, tout passe par WhatsGPS.
import type { EtatTraceur, AlerteBoitier } from './whatsgps';

const BASE = () => (process.env.TRACCAR_URL || '').trim().replace(/\/$/, '');
export const traccarConfigure = () => !!(process.env.TRACCAR_URL && process.env.TRACCAR_JETON);

async function appel(chemin: string, init: RequestInit = {}) {
  const rep = await fetch(`${BASE()}${chemin}`, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${process.env.TRACCAR_JETON}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!rep.ok) throw new Error(`Serveur GPS : erreur ${rep.status}.`);
  const texte = await rep.text();
  return texte ? JSON.parse(texte) : null;
}

type Appareil = { id: number; name: string; uniqueId: string; status: string; lastUpdate: string | null };

// Appareils et dernières positions : mémoire courte (le serveur est à nous, pas de quota)
let memoire: { quand: number; appareils: Appareil[]; positions: any[] } | null = null;
async function photo() {
  if (memoire && Date.now() - memoire.quand < 8_000) return memoire;
  const [appareils, positions] = await Promise.all([appel('/api/devices'), appel('/api/positions')]);
  memoire = { quand: Date.now(), appareils: appareils ?? [], positions: positions ?? [] };
  return memoire;
}

const NOEUDS_EN_KMH = 1.852;

export async function etatsTraccar(): Promise<EtatTraceur[]> {
  if (!traccarConfigure()) return [];
  const { appareils, positions } = await photo();
  const parAppareil = new Map(positions.map((p: any) => [p.deviceId, p]));
  return appareils.map((a) => {
    const p: any = parAppareil.get(a.id);
    const vitesse = p ? Math.round((Number(p.speed) || 0) * NOEUDS_EN_KMH) : 0;
    const km = p?.attributes?.totalDistance ?? p?.attributes?.odometer;
    return {
      imei: String(a.uniqueId), nom: a.name || null, carId: null,
      lat: p ? Number(p.latitude) || null : null, lng: p ? Number(p.longitude) || null : null,
      vitesse, contact: typeof p?.attributes?.ignition === 'boolean' ? p.attributes.ignition : null,
      enLigne: a.status === 'online', enMouvement: vitesse > 3,
      le: p?.fixTime ?? null, signal: a.lastUpdate ?? null,
      kmTraceur: km ? Math.round(Number(km) / 1000) : null,
      alerte: p?.attributes?.alarm ? libelleAlarme(String(p.attributes.alarm)) : null,
      tension: p?.attributes?.power != null ? Math.round(Number(p.attributes.power) * 10) / 10 : null,
      satellites: p?.attributes?.sat != null ? Number(p.attributes.sat) : null,
      source: 'direct',
    } as EtatTraceur;
  });
}

// Noms d'alarme Traccar → français, et celles qui peuvent signaler un vol
const ALARMES: Record<string, [string, boolean]> = {
  vibration: ['Vibration détectée', true], tow: ['Remorquage', true], movement: ['Véhicule déplacé', true],
  powerCut: ['Alimentation du boîtier coupée', true], powerOff: ['Boîtier éteint', true], tampering: ['Alimentation du boîtier perturbée', false],
  jamming: ['Brouillage du signal', true], sos: ['SOS', true], accident: ['Choc violent', true], door: ['Portière ouverte', false],
  lowBattery: ['Batterie faible', false], lowPower: ['Tension faible', false], overspeed: ['Excès de vitesse', false],
  geofenceExit: ['Sortie de zone', true], geofenceEnter: ['Entrée dans une zone', false], fallDown: ['Chute', false],
  hardBraking: ['Freinage brutal', false], hardAcceleration: ['Accélération brutale', false], idle: ['Moteur au ralenti', false],
};
export const libelleAlarme = (a: string) => ALARMES[a]?.[0] ?? 'Alerte du boîtier';

// Alarmes « électriques » que le boîtier lève aussi pour rien : chute de tension au démarrage (contact mis),
// redémarrage après un réglage, coupure ou remise en route moteur. Testé sur R12L-F le 23/10/2026 :
// « tampering » arrive à chaque mise du contact, « lowBattery » juste après, sans aucun démontage réel.
const ALARMES_ELECTRIQUES = new Set(['tampering', 'powerCut', 'powerOff', 'lowBattery', 'lowPower']);
const MARGE_MS = 3 * 60_000;     // fenêtre autour d'un changement de contact ou d'une commande
const DOUBLON_MS = 10 * 60_000;  // une même alarme répétée (rafale de positions stockées) ne compte qu'une fois

export async function alertesTraccar(heures = 48): Promise<AlerteBoitier[]> {
  if (!traccarConfigure()) return [];
  const { appareils } = await photo();
  if (!appareils.length) return [];
  const q = new URLSearchParams({ from: new Date(Date.now() - heures * 3600_000 - MARGE_MS).toISOString(), to: new Date().toISOString() });
  appareils.forEach((a) => q.append('deviceId', String(a.id)));
  ['alarm', 'ignitionOn', 'ignitionOff', 'commandResult', 'deviceOnline'].forEach((t) => q.append('type', t));
  const evts: any[] = ((await appel(`/api/reports/events?${q}`)) ?? []).sort((x: any, y: any) => String(x.eventTime).localeCompare(String(y.eventTime)));
  const imeiDe = new Map(appareils.map((a) => [a.id, a]));
  // Moments où le boîtier est « perturbé » : contact mis / coupé, commande exécutée, reconnexion après redémarrage
  const perturbations = new Map<number, number[]>();
  evts.filter((e) => e.type !== 'alarm').forEach((e) => {
    const t = new Date(e.eventTime).getTime();
    perturbations.set(e.deviceId, [...(perturbations.get(e.deviceId) ?? []), t]);
  });
  const dernier = new Map<string, number>();
  const debut = Date.now() - heures * 3600_000;
  const res: AlerteBoitier[] = [];
  for (const e of evts) {
    if (e.type !== 'alarm') continue;
    const nomAlarme = String(e.attributes?.alarm ?? '');
    const t = new Date(e.eventTime).getTime();
    if (t < debut) continue;
    if (ALARMES_ELECTRIQUES.has(nomAlarme) && (perturbations.get(e.deviceId) ?? []).some((p) => Math.abs(p - t) <= MARGE_MS)) continue;
    const cle = `${e.deviceId}:${nomAlarme}`;
    if (dernier.has(cle) && t - dernier.get(cle)! < DOUBLON_MS) continue;
    dernier.set(cle, t);
    const a = imeiDe.get(e.deviceId);
    res.push({
      id: `t${e.id}`, carId: null, imei: a ? String(a.uniqueId) : null, nom: a?.name ?? null, type: null,
      libelle: libelleAlarme(nomAlarme), critique: ALARMES[nomAlarme]?.[1] ?? false,
      le: e.eventTime ?? null, lat: null, lng: null,
    } as AlerteBoitier);
  }
  return res.sort((x, y) => (y.le ?? '').localeCompare(x.le ?? ''));
}

// Diagnostic : tous les événements bruts d'un boîtier (alarmes, contact, en ligne, commandes) et la tension relevée
export async function evenementsBruts(imei: string, heures = 24) {
  if (!traccarConfigure()) return null;
  const { appareils } = await photo();
  const a = appareils.find((x) => String(x.uniqueId) === imei);
  if (!a) return { inscrit: false, evenements: [] as any[] };
  const q = new URLSearchParams({ deviceId: String(a.id), from: new Date(Date.now() - heures * 3600_000).toISOString(), to: new Date().toISOString() });
  const [evts, pos] = await Promise.all([appel(`/api/reports/events?${q}`), appel(`/api/reports/route?${q}`)]);
  const paris = (d: string) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  return {
    inscrit: true,
    evenements: (evts ?? []).map((e: any) => ({ le: paris(e.eventTime), type: e.type, alarme: e.attributes?.alarm ?? null, details: e.attributes ?? {} })),
    tensions: (pos ?? []).filter((p: any) => p.attributes && ('power' in p.attributes || 'battery' in p.attributes || 'ignition' in p.attributes))
      .map((p: any) => ({ le: paris(p.fixTime), contact: p.attributes.ignition ?? null, alimentation: p.attributes.power ?? null, batterie: p.attributes.battery ?? null, alarme: p.attributes.alarm ?? null }))
      .filter((x: any, i: number, t: any[]) => i === 0 || x.alarme || x.contact !== t[i - 1].contact || Math.abs((x.alimentation ?? 0) - (t[i - 1].alimentation ?? 0)) > 1),
  };
}

// Inscription d'un boîtier sur notre serveur (« Passer sur SS CAR SYSTEM »)
export async function appareilTraccar(imei: string): Promise<{ inscrit: boolean; enLigne: boolean; position: boolean } | null> {
  if (!traccarConfigure()) return null;
  try {
    const { appareils, positions } = await photo();
    const a = appareils.find((x) => String(x.uniqueId) === imei);
    if (!a) return { inscrit: false, enLigne: false, position: false };
    return { inscrit: true, enLigne: a.status === 'online', position: positions.some((p: any) => p.deviceId === a.id) };
  } catch { return null; }
}

export async function inscrireTraccar(imei: string, nom: string): Promise<'deja' | 'cree'> {
  if (!traccarConfigure()) throw new Error('Le serveur GPS SS CAR SYSTEM n’est pas encore branché.');
  const { appareils } = await photo();
  if (appareils.some((x) => String(x.uniqueId) === imei)) return 'deja';
  await appel('/api/devices', { method: 'POST', body: JSON.stringify({ name: nom.slice(0, 120), uniqueId: imei }) });
  memoire = null;
  return 'cree';
}

// Commande envoyée au boîtier par notre serveur (texte brut, ex. RELAY,1#)
export async function commandeTraccar(imei: string, texte: string): Promise<{ enLigne: boolean } | null> {
  if (!traccarConfigure()) return null;
  const { appareils } = await photo();
  const a = appareils.find((x) => String(x.uniqueId) === imei);
  if (!a) return null; // boîtier pas encore en double serveur : WhatsGPS prendra le relais
  await appel('/api/commands/send', { method: 'POST', body: JSON.stringify({ deviceId: a.id, type: 'custom', attributes: { data: texte } }) });
  memoire = null;
  return { enLigne: a.status === 'online' };
}

// Depuis quand le moteur est allumé / éteint et depuis quand la voiture est à l'arrêt, plus les km du jour :
// un seul appel pour toute la flotte, gardé 30 s
export type Historique = { contactLe: string | null; arretLe: string | null; mouvementLe: string | null; kmJour: number | null; minutesRoute: number | null };
let memoireHisto: { quand: number; parImei: Map<string, Historique> } | null = null;
const minuitParis = () => {
  const d = new Date();
  const paris = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const ecart = paris.getTime() - d.getTime();
  paris.setHours(0, 0, 0, 0);
  return new Date(paris.getTime() - ecart);
};
export async function historiquesTraccar(): Promise<Map<string, Historique>> {
  if (!traccarConfigure()) return new Map();
  if (memoireHisto && Date.now() - memoireHisto.quand < 30_000) return memoireHisto.parImei;
  const { appareils } = await photo();
  const parImei = new Map<string, Historique>();
  if (!appareils.length) return parImei;
  const ids = (q: URLSearchParams) => { appareils.forEach((a) => q.append('deviceId', String(a.id))); return q; };
  const maintenant = new Date().toISOString();
  const qe = ids(new URLSearchParams({ from: new Date(Date.now() - 48 * 3600_000).toISOString(), to: maintenant }));
  ['ignitionOn', 'ignitionOff', 'deviceMoving', 'deviceStopped'].forEach((t) => qe.append('type', t));
  const qs = ids(new URLSearchParams({ from: minuitParis().toISOString(), to: maintenant }));
  const [evts, resumes] = await Promise.all([
    appel(`/api/reports/events?${qe}`).catch(() => []),
    appel(`/api/reports/summary?${qs}`).catch(() => []),
  ]);
  const imeiDe = new Map(appareils.map((a) => [a.id, String(a.uniqueId)]));
  const h = (id: number) => {
    const imei = imeiDe.get(id); if (!imei) return null;
    if (!parImei.has(imei)) parImei.set(imei, { contactLe: null, arretLe: null, mouvementLe: null, kmJour: null, minutesRoute: null });
    return parImei.get(imei)!;
  };
  for (const e of [...(evts ?? [])].sort((x: any, y: any) => String(x.eventTime).localeCompare(String(y.eventTime)))) {
    const x = h(e.deviceId); if (!x) continue;
    if (e.type === 'ignitionOn' || e.type === 'ignitionOff') x.contactLe = e.eventTime;
    else if (e.type === 'deviceStopped') x.arretLe = e.eventTime;
    else if (e.type === 'deviceMoving') x.mouvementLe = e.eventTime;
  }
  for (const r of resumes ?? []) {
    const x = h(r.deviceId); if (!x) continue;
    x.kmJour = r.distance != null ? Math.round(Number(r.distance) / 1000) : null;
    x.minutesRoute = r.engineHours != null ? Math.round(Number(r.engineHours) / 60000) : null;
  }
  memoireHisto = { quand: Date.now(), parImei };
  return parImei;
}

// Trajet du jour d'un boîtier (points de la route depuis minuit), allégé pour l'affichage sur la carte
export async function trajetDuJour(imei: string): Promise<{ inscrit: boolean; points: [number, number][]; km: number | null }> {
  if (!traccarConfigure()) return { inscrit: false, points: [], km: null };
  const { appareils } = await photo();
  const a = appareils.find((x) => String(x.uniqueId) === imei);
  if (!a) return { inscrit: false, points: [], km: null };
  const q = new URLSearchParams({ deviceId: String(a.id), from: minuitParis().toISOString(), to: new Date().toISOString() });
  const route: any[] = (await appel(`/api/reports/route?${q}`)) ?? [];
  const tous = route.filter((p) => p.valid !== false && p.latitude && p.longitude).map((p) => [Number(p.longitude), Number(p.latitude)] as [number, number]);
  const pas = Math.max(1, Math.ceil(tous.length / 600));
  const points = tous.filter((_, i) => i % pas === 0 || i === tous.length - 1);
  const dist = route.length ? Number(route[route.length - 1]?.attributes?.totalDistance ?? 0) - Number(route[0]?.attributes?.totalDistance ?? 0) : 0;
  return { inscrit: true, points, km: dist > 0 ? Math.round(dist / 1000) : null };
}
