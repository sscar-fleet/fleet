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
      source: 'direct',
    } as EtatTraceur;
  });
}

// Noms d'alarme Traccar → français, et celles qui peuvent signaler un vol
const ALARMES: Record<string, [string, boolean]> = {
  vibration: ['Vibration détectée', true], tow: ['Remorquage', true], movement: ['Véhicule déplacé', true],
  powerCut: ['Alimentation coupée', true], powerOff: ['Boîtier éteint', true], tampering: ['Boîtier démonté', true],
  jamming: ['Brouillage du signal', true], sos: ['SOS', true], accident: ['Choc violent', true], door: ['Portière ouverte', false],
  lowBattery: ['Batterie faible', false], lowPower: ['Tension faible', false], overspeed: ['Excès de vitesse', false],
  geofenceExit: ['Sortie de zone', true], geofenceEnter: ['Entrée dans une zone', false], fallDown: ['Chute', false],
  hardBraking: ['Freinage brutal', false], hardAcceleration: ['Accélération brutale', false], idle: ['Moteur au ralenti', false],
};
export const libelleAlarme = (a: string) => ALARMES[a]?.[0] ?? 'Alerte du boîtier';

export async function alertesTraccar(heures = 48): Promise<AlerteBoitier[]> {
  if (!traccarConfigure()) return [];
  const { appareils } = await photo();
  if (!appareils.length) return [];
  const q = new URLSearchParams({ from: new Date(Date.now() - heures * 3600_000).toISOString(), to: new Date().toISOString(), type: 'alarm' });
  appareils.forEach((a) => q.append('deviceId', String(a.id)));
  const evts: any[] = (await appel(`/api/reports/events?${q}`)) ?? [];
  const imeiDe = new Map(appareils.map((a) => [a.id, a]));
  return evts.map((e) => {
    const a = imeiDe.get(e.deviceId); const nomAlarme = String(e.attributes?.alarm ?? '');
    return {
      id: `t${e.id}`, carId: null, imei: a ? String(a.uniqueId) : null, nom: a?.name ?? null, type: null,
      libelle: libelleAlarme(nomAlarme), critique: ALARMES[nomAlarme]?.[1] ?? false,
      le: e.eventTime ?? null, lat: null, lng: null,
    } as AlerteBoitier;
  }).sort((x, y) => (y.le ?? '').localeCompare(x.le ?? ''));
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
