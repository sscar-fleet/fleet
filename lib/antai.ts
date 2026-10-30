// API de désignation de l'ANTAI (gestionnaires de parc conventionnés, v2).
// Connexion : GET /init (cookie XSRF) puis POST /login (Basic) → jeton « Bearer » valable 12 h, gardé en base.
// Règles de prudence (5 erreurs de connexion en 30 s bloquent le compte 30 min) :
//  - une seule tentative de connexion par appel, jamais de boucle ;
//  - après 2 échecs de suite, plus aucune tentative pendant 30 min ;
//  - le jeton est réutilisé tant qu'il est valable.
import { supabaseAdmin, adminConfigure } from './supabaseAdmin';

export type EnvAntai = 'sandbox' | 'production';
const BASES: Record<EnvAntai, string> = {
  sandbox: 'https://api.sandbox.entreprises.antai.gouv.fr',
  production: 'https://api.entreprises.antai.gouv.fr',
};
const VERSION = '/v2';
const METIER = '/flotteconventionnee';

export const envAntai = (): EnvAntai => (process.env.ANTAI_ENV === 'production' ? 'production' : 'sandbox');
const identifiants = (env: EnvAntai) => env === 'production'
  ? { u: process.env.ANTAI_PROD_USER, p: process.env.ANTAI_PROD_PASSWORD }
  : { u: process.env.ANTAI_SANDBOX_USER, p: process.env.ANTAI_SANDBOX_PASSWORD };
export const antaiConfigure = (env: EnvAntai = envAntai()) => { const i = identifiants(env); return !!(i.u && i.p && adminConfigure()); };

export class ErreurAntai extends Error { statut?: number; constructor(m: string, statut?: number) { super(m); this.statut = statut; } }

export type Reponse<T = any> = { statut: number; corps: T; texte: string; requete: { methode: string; url: string; corps?: any }; duree: number };

type Session = { bearer?: string | null; xsrf?: string | null; cookies?: string | null; expire_le?: string | null; echecs?: number; dernier_echec?: string | null; bloque_jusqua?: string | null; contexte?: any };

async function lireSession(env: EnvAntai): Promise<Session> {
  const { data } = await supabaseAdmin().from('antai_session').select('*').eq('env', env).maybeSingle();
  return data ?? {};
}
async function ecrireSession(env: EnvAntai, s: Partial<Session>) {
  await supabaseAdmin().from('antai_session').upsert({ env, ...s, updated_at: new Date().toISOString() });
}
export async function lireContexte(env: EnvAntai = envAntai()) { return (await lireSession(env)).contexte ?? {}; }
export async function ecrireContexte(contexte: any, env: EnvAntai = envAntai()) { await ecrireSession(env, { contexte }); }

// Cookies renvoyés par l'ANTAI, gardés tels quels pour les appels suivants
function fusionnerCookies(ancien: string | null | undefined, r: Response): string {
  const jar = new Map<string, string>();
  for (const c of (ancien ?? '').split(';').map((x) => x.trim()).filter(Boolean)) { const i = c.indexOf('='); if (i > 0) jar.set(c.slice(0, i), c.slice(i + 1)); }
  const nouveaux: string[] = (r.headers as any).getSetCookie?.() ?? (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')!] : []);
  for (const sc of nouveaux) { const pair = sc.split(';')[0]; const i = pair.indexOf('='); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}
const xsrfDe = (cookies: string) => cookies.split(';').map((x) => x.trim()).find((c) => c.startsWith('XSRF-TOKEN='))?.slice(11) ?? null;

async function journal(env: EnvAntai, action: string, r: Reponse, agenceId?: string | null) {
  try {
    await supabaseAdmin().from('antai_journal').insert({
      env, agence_id: agenceId ?? null, action, methode: r.requete.methode, chemin: r.requete.url.replace(BASES[env], ''),
      statut: r.statut, requete: r.requete.corps ?? null, reponse: typeof r.corps === 'object' ? r.corps : { texte: r.texte.slice(0, 4000) }, duree_ms: r.duree,
    });
  } catch { /* le journal ne doit jamais bloquer */ }
}

async function brut(methode: string, url: string, headers: Record<string, string>, corps?: any): Promise<{ r: Response; rep: Reponse }> {
  const debut = Date.now();
  const r = await fetch(url, {
    method: methode, cache: 'no-store', signal: AbortSignal.timeout(25_000), redirect: 'manual',
    headers: { Accept: 'application/json', ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: corps !== undefined ? (typeof corps === 'string' ? corps : JSON.stringify(corps)) : undefined,
  });
  const texte = await r.text();
  let j: any = texte; try { j = texte ? JSON.parse(texte) : null; } catch { /* texte brut */ }
  return { r, rep: { statut: r.status, corps: j, texte, requete: { methode, url, corps }, duree: Date.now() - debut } };
}

// Étape 1 de la connexion : cookie XSRF
export async function init(env: EnvAntai = envAntai()): Promise<Reponse> {
  const { r, rep } = await brut('GET', `${BASES[env]}${VERSION}/init`, {});
  const cookies = fusionnerCookies(null, r);
  await ecrireSession(env, { cookies, xsrf: xsrfDe(cookies) });
  await journal(env, 'init', rep);
  return rep;
}

// Étape 2 : connexion avec l'identifiant du compte ANTAI. Une seule tentative, protégée contre le blocage.
export async function login(env: EnvAntai = envAntai()): Promise<Reponse> {
  const s = await lireSession(env);
  if (s.bloque_jusqua && new Date(s.bloque_jusqua) > new Date()) {
    throw new ErreurAntai(`Connexion ANTAI suspendue jusqu'à ${new Date(s.bloque_jusqua).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })} après des échecs (protection contre le blocage du compte).`);
  }
  const { u, p } = identifiants(env);
  if (!u || !p) throw new ErreurAntai('Identifiants ANTAI absents dans Vercel.');
  const auth = 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
  const { r, rep } = await brut('POST', `${BASES[env]}${VERSION}/login`, { Authorization: auth, ...(s.xsrf ? { 'X-XSRF-TOKEN': s.xsrf } : {}), ...(s.cookies ? { Cookie: s.cookies } : {}) });
  // On ne garde jamais l'en-tête Basic dans le journal
  rep.requete = { methode: 'POST', url: rep.requete.url, corps: undefined };
  const bearer = r.headers.get('authorization');
  if (r.ok && bearer) {
    const cookies = fusionnerCookies(s.cookies, r);
    await ecrireSession(env, { bearer, cookies, xsrf: xsrfDe(cookies) ?? s.xsrf, expire_le: new Date(Date.now() + 11.5 * 3600_000).toISOString(), echecs: 0, bloque_jusqua: null });
  } else {
    const recents = s.dernier_echec && Date.now() - new Date(s.dernier_echec).getTime() < 30 * 60_000 ? (s.echecs ?? 0) + 1 : 1;
    await ecrireSession(env, { bearer: null, echecs: recents, dernier_echec: new Date().toISOString(), bloque_jusqua: recents >= 2 ? new Date(Date.now() + 30 * 60_000).toISOString() : null });
  }
  await journal(env, 'login', rep);
  return rep;
}

// Ouvre (ou réutilise) la session
export async function connecter(env: EnvAntai = envAntai()): Promise<Session> {
  const s = await lireSession(env);
  if (s.bearer && s.expire_le && new Date(s.expire_le) > new Date(Date.now() + 5 * 60_000)) return s;
  await init(env);
  const l = await login(env);
  if (l.statut !== 200) throw new ErreurAntai(messageAntai(l) || `Connexion ANTAI refusée (${l.statut}).`, l.statut);
  return lireSession(env);
}

// Appel métier : /v2/flotteconventionnee + chemin. Si le jeton a expiré (401), une seule reconnexion.
export async function appel<T = any>(methode: 'GET' | 'POST' | 'PUT', chemin: string, corps?: any, o: { env?: EnvAntai; action?: string; agenceId?: string | null; sansVersion?: boolean } = {}): Promise<Reponse<T>> {
  const env = o.env ?? envAntai();
  const url = `${BASES[env]}${o.sansVersion ? '' : VERSION}${METIER}${chemin}`;
  let s = await connecter(env);
  const envoyer = (s: Session) => brut(methode, url, { ...(s.bearer ? { Authorization: s.bearer } : {}), ...(s.xsrf ? { 'X-XSRF-TOKEN': s.xsrf } : {}), ...(s.cookies ? { Cookie: s.cookies } : {}) }, corps);
  let { rep } = await envoyer(s);
  if (rep.statut === 401) {
    await ecrireSession(env, { bearer: null, expire_le: null });
    s = await connecter(env);
    ({ rep } = await envoyer(s));
  }
  await journal(env, o.action ?? `${methode} ${chemin.split('?')[0]}`, rep, o.agenceId);
  return rep as Reponse<T>;
}

// Message d'erreur lisible renvoyé par l'ANTAI
export function messageAntai(r: Reponse): string {
  const c = r.corps;
  if (!c) return '';
  if (typeof c === 'string') return c.slice(0, 300);
  return [c.message, c.libelle, c.code, ...(Array.isArray(c.erreurs) ? c.erreurs : []), ...(Array.isArray(c.messages) ? c.messages : [])].filter(Boolean).map(String).join(' · ').slice(0, 300)
    || JSON.stringify(c).slice(0, 300);
}

// --- Routes métier -------------------------------------------------------------------------------------------
export type VehiculeAntai = { immatriculation: string; paysImmatriculation?: string; marque?: string; modele?: string };
export const plaque = (immat: string) => immat.toUpperCase().replace(/[^A-Z0-9]/g, '');
const v = (x: VehiculeAntai) => ({ immatriculation: plaque(x.immatriculation), paysImmatriculation: x.paysImmatriculation ?? 'FRA', ...(x.marque ? { marque: x.marque.slice(0, 20) } : {}), ...(x.modele ? { modele: x.modele.slice(0, 20) } : {}) });

export const creerVehicule = (x: VehiculeAntai, agenceId?: string) => appel('POST', '/vehicule', v(x), { action: 'vehicule.creer', agenceId });
export const lireVehicule = (immat: string, pays = 'FRA') => appel('GET', `/vehicule?immatriculation=${encodeURIComponent(plaque(immat))}&paysImmatriculation=${pays}`, undefined, { action: 'vehicule.lire' });
// Sortie de flotte : maintenant (date du jour) ou à une date future, jamais dans le passé
export const desactiverVehicule = (x: VehiculeAntai, finGestion?: string, agenceId?: string) =>
  appel('PUT', '/vehicule', { vehicule: v(x), ...(finGestion ? { date_fin_gestion: finGestion } : {}) }, { action: 'vehicule.desactiver', agenceId });
export const creerVehicules = (liste: VehiculeAntai[], agenceId?: string) => appel('POST', '/flotte/vehicules', liste.map(v), { action: 'flotte.creer', agenceId });
export const desactiverVehicules = (liste: { vehicule: VehiculeAntai; date_fin_gestion?: string }[], agenceId?: string) =>
  appel('PUT', '/vehicules/desactiver', liste.map((x) => ({ vehicule: v(x.vehicule), ...(x.date_fin_gestion ? { date_fin_gestion: x.date_fin_gestion } : {}) })), { action: 'flotte.desactiver', agenceId });
export const lireFlotte = (page = 0, nombreParPage = 1000) => appel('GET', `/flotte/vehicules?sort=id&desc=false&page=${page}&nombreParPage=${nombreParPage}`, undefined, { action: 'flotte.lire' });

// Infractions à instruire (statut NON_TRAITE), 1000 par page au plus
export const lireInfractions = (page = 0, nombreParPage = 1000) => appel('GET', `/infractions?sort=dateInfraction&desc=false&page=${page}&nombreParPage=${nombreParPage}`, undefined, { action: 'infractions.lire' });
export const lireInfraction = (numeroDossier: string) => appel('GET', `/infraction/${encodeURIComponent(numeroDossier)}`, undefined, { action: 'infraction.lire' });
export const designer = (corps: any, agenceId?: string) => appel('POST', '/designation', corps, { action: 'designation', agenceId });
export const statutDesignations = (ids: number[]) => appel('POST', '/statutInfractions', { identifiantDesignation: ids }, { action: 'designation.statuts' });

// Infraction lue dans la réponse ANTAI, sous une forme simple pour Fleet
export function lireDossier(x: any) {
  const inf = x?.dossier?.infraction ?? x?.infraction ?? {};
  const veh = x?.dossier?.vehicule ?? x?.vehicule ?? {};
  return {
    identifiantDesignation: x?.identifiantDesignation ?? null as number | null,
    numeroDossier: inf.numeroDossier ?? null, codeNatinf: inf.codeNatinf ?? null, libelle: inf.libelleNatinf ?? null,
    date: inf.dateInfraction ?? null, apparition: inf.datePremiereExposition ?? null,
    lieu: inf.lieuInfraction ?? null, immatriculation: veh.immatriculation ?? null,
  };
}
