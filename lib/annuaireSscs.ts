// Annuaire SS CAR SYSTEM : les clients déjà équipés de boîtiers (base Airtable de SS CAR SYSTEM, lecture seule).
// Sert à reconnaître un loueur qui s'inscrit sur Fleet et à lui proposer ses véhicules, déjà reliés à leurs traceurs.
//   AIRTABLE_TOKEN : jeton Airtable en lecture seule (à créer par SS CAR SYSTEM, collé dans Vercel)
//   AIRTABLE_BASE (facultatif) : base SS CAR SYSTEM
// Sécurité : le loueur ne voit ses véhicules que si l'adresse e-mail de sa connexion (vérifiée) est celle de sa fiche
// client SS CAR SYSTEM. Pour tout autre rapprochement (téléphone, nom), c'est SS CAR FLEET qui valide depuis l'admin.
import { unstable_cache } from 'next/cache';
import { supabaseAdmin, adminConfigure } from './supabaseAdmin';
import { devinerMarqueModele } from './logoMarque';

const BASE = () => process.env.AIRTABLE_BASE || 'appbDbMo3soBmsBov';
const URL_AT = () => (process.env.AIRTABLE_URL || 'https://api.airtable.com').replace(/\/$/, '');
export const annuaireConfigure = () => !!process.env.AIRTABLE_TOKEN && adminConfigure();

// Identifiants des tables et champs (résistent aux changements de nom dans Airtable)
const T = {
  clients: { id: 'tblGvcWl93VXcN4lG', nom: 'fldCALnkhy1gfRi3n', email: 'fld5A4GZCGWEsQ9T6', tel: 'fldrt36in5XaC6ApZ' },
  vehicules: { id: 'tbl4pHzw0wkaFuOBD', immat: 'fldO0DAVwSwbdkrng', mm: 'fldpmrWJDUxbUo3VY', client: 'fldVS8C6gD9bSYMdS', imei: 'fldXZuJU9g66wlITM', sim: 'fldiipKUJkGvKAHSX' },
  traceurs: { id: 'tbll9scfT5lkxOzrZ', imei: 'fldQIbbvuUtle33HW', modele: 'fldxLMZ7hq848K56r', sim: 'fldXdmZ54ATfYWThO', statut: 'fldigZETKtaTV5F8a', vehicule: 'fldwqt6JahegduKAE' },
};

export type ClientSscs = { id: string; nom: string; email: string | null; telephone: string | null };
export type EquipementSscs = { immatriculation: string; marque: string; modele: string; imei: string; sim: string | null; modeleTraceur: string | null };
type Annuaire = { clients: ClientSscs[]; parClient: Record<string, EquipementSscs[]> };

async function lireTable(table: string, champs: string[]): Promise<any[]> {
  const lignes: any[] = []; let offset = '';
  for (let page = 0; page < 40; page++) {
    const q = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' });
    champs.forEach((c) => q.append('fields[]', c));
    if (offset) q.set('offset', offset);
    const r = await fetch(`${URL_AT()}/v0/${BASE()}/${table}?${q}`, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store',
    });
    if (!r.ok) throw new Error(`Annuaire SS CAR SYSTEM indisponible (${r.status}).`);
    const j = await r.json();
    lignes.push(...(j.records ?? []));
    if (!j.offset) break;
    offset = j.offset;
  }
  return lignes;
}

const plaqueAt = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const imeiAt = (v: unknown) => { const s = String(v ?? '').replace(/\D/g, ''); return s.length >= 14 && s.length <= 17 ? s : null; };
const choix = (v: any) => (v && typeof v === 'object' ? v.name ?? null : v ?? null);
const liens = (v: any): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean) : []);

async function chargerAnnuaire(): Promise<Annuaire> {
  const [cl, ve, tr] = await Promise.all([
    lireTable(T.clients.id, [T.clients.nom, T.clients.email, T.clients.tel]),
    lireTable(T.vehicules.id, [T.vehicules.immat, T.vehicules.mm, T.vehicules.client, T.vehicules.imei, T.vehicules.sim]),
    lireTable(T.traceurs.id, [T.traceurs.imei, T.traceurs.modele, T.traceurs.sim, T.traceurs.statut, T.traceurs.vehicule]),
  ]);
  // Le boîtier posé aujourd'hui sur chaque véhicule : la table Traceurs fait foi (transferts), la fiche véhicule sert de secours
  const surVehicule = new Map<string, { imei: string; modele: string | null; sim: string | null }>();
  const imeisAilleurs = new Map<string, string>();
  for (const t of tr) {
    const f = t.fields ?? {}; const imei = imeiAt(f[T.traceurs.imei]); if (!imei) continue;
    const v = liens(f[T.traceurs.vehicule])[0];
    const statut = String(choix(f[T.traceurs.statut]) ?? '');
    if (v && !/stock|hs|perdu/i.test(statut)) surVehicule.set(v, { imei, modele: choix(f[T.traceurs.modele]), sim: f[T.traceurs.sim] ?? null });
    imeisAilleurs.set(imei, v ?? '');
  }
  const clients: ClientSscs[] = cl.map((c) => ({
    id: c.id, nom: String(c.fields?.[T.clients.nom] ?? '').trim(),
    email: c.fields?.[T.clients.email] ? String(c.fields[T.clients.email]).trim().toLowerCase() : null,
    telephone: c.fields?.[T.clients.tel] ? String(c.fields[T.clients.tel]) : null,
  })).filter((c) => c.nom || c.email);
  const parClient: Record<string, EquipementSscs[]> = {};
  for (const v of ve) {
    const f = v.fields ?? {};
    const immatriculation = plaqueAt(f[T.vehicules.immat]); if (immatriculation.length < 4) continue;
    let boitier = surVehicule.get(v.id) ?? null;
    if (!boitier) {
      const imei = imeiAt(f[T.vehicules.imei]);
      // Un numéro resté sur la fiche alors que le boîtier a été transféré ailleurs : ignoré
      if (imei && (!imeisAilleurs.has(imei) || imeisAilleurs.get(imei) === v.id)) boitier = { imei, modele: null, sim: f[T.vehicules.sim] ?? null };
    }
    if (!boitier) continue;
    const mm = devinerMarqueModele(String(f[T.vehicules.mm] ?? ''));
    for (const c of liens(f[T.vehicules.client])) {
      (parClient[c] ??= []).push({ immatriculation, marque: mm.marque, modele: mm.modele, imei: boitier.imei, sim: boitier.sim, modeleTraceur: boitier.modele });
    }
  }
  return { clients, parClient };
}

const annuaire = unstable_cache(chargerAnnuaire, ['annuaire-sscs-v1'], { revalidate: 600, tags: ['annuaire-sscs'] });

const chiffres = (t?: string | null) => String(t ?? '').replace(/\D/g, '').replace(/^33/, '0');
const cle = (s?: string | null) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Mots trop courants pour reconnaître une entreprise par son nom (retirés avant de comparer, mot entier seulement)
const MOTS_VIDES = /\b(sarl|sas|sasu|eurl|sa|location|locations|loc|auto|autos|automobile|automobiles|transport|transports|services?|garage|car|cars|rent|rental|paris|vtc|express|logistique|groupe|france|idf)\b/g;
const nomEntreprise = (s?: string | null) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').replace(MOTS_VIDES, ' ').replace(/\s+/g, '');

// Côté loueur : seulement par l'adresse e-mail de connexion, vérifiée
export async function equipementsDeLAgence(supabase: any): Promise<{ client: ClientSscs; vehicules: EquipementSscs[]; dejaRelies: number } | null> {
  if (!annuaireConfigure()) return null;
  const { data: auth } = await supabase.auth.getUser();
  const email = auth?.user?.email?.toLowerCase();
  if (!email || !auth.user.email_confirmed_at) return null;
  let a: Annuaire;
  try { a = await annuaire(); } catch { return null; }
  // Une seule fiche client SS CAR SYSTEM avec cette adresse : sinon (adresse partagée), c'est SS CAR FLEET qui tranche dans l'admin
  const memes = a.clients.filter((c) => c.email === email);
  const client = memes.length === 1 && (a.parClient[memes[0].id]?.length ?? 0) > 0 ? memes[0] : null;
  if (!client) return null;
  const tous = a.parClient[client.id];
  const { data: traceurs } = await supabase.from('traceurs').select('imei, vehicules(id)');
  const relies = new Set((traceurs ?? []).filter((t: any) => (Array.isArray(t.vehicules) ? t.vehicules.length : t.vehicules)).map((t: any) => String(t.imei)));
  const vehicules = tous.filter((v) => !relies.has(v.imei));
  return { client, vehicules, dejaRelies: tous.length - vehicules.length };
}

// Côté admin SS CAR FLEET : tous les rapprochements possibles (e-mail, téléphone, nom), à valider d'un clic
export async function candidatsSscs(agence: { nom?: string | null; email?: string | null; telephone?: string | null; gerant?: string | null }):
  Promise<{ client: ClientSscs; vehicules: EquipementSscs[]; par: string }[]> {
  if (!annuaireConfigure()) return [];
  let a: Annuaire;
  try { a = await annuaire(); } catch { return []; }
  const email = agence.email?.toLowerCase() ?? null, tel = chiffres(agence.telephone);
  const noms = [agence.nom, agence.gerant].map(nomEntreprise).filter((n) => n.length >= 4);
  const sortie: { client: ClientSscs; vehicules: EquipementSscs[]; par: string }[] = [];
  for (const c of a.clients) {
    const vehicules = a.parClient[c.id] ?? [];
    if (!vehicules.length) continue;
    const nc = nomEntreprise(c.nom);
    // Nom : identique (hors mots courants), ou l'un contient l'autre seulement s'il est long (8 lettres et plus)
    const par = email && c.email === email ? 'e-mail'
      : tel.length >= 9 && chiffres(c.telephone) === tel ? 'téléphone'
      : nc.length >= 4 && noms.some((n) => n === nc || (n.length >= 8 && nc.includes(n)) || (nc.length >= 8 && n.includes(nc))) ? 'nom' : null;
    if (par) sortie.push({ client: c, vehicules, par });
  }
  const rang: Record<string, number> = { 'e-mail': 0, 'téléphone': 1, nom: 2 };
  return sortie.sort((x, y) => rang[x.par] - rang[y.par] || y.vehicules.length - x.vehicules.length).slice(0, 4);
}

export async function clientSscs(id: string): Promise<{ client: ClientSscs; vehicules: EquipementSscs[] } | null> {
  if (!annuaireConfigure()) return null;
  const a = await annuaire();
  const client = a.clients.find((c) => c.id === id);
  return client ? { client, vehicules: a.parClient[id] ?? [] } : null;
}

// Rattachement : suivi GPS activé (compte principal SS CAR SYSTEM), boîtiers ajoutés à l'agence, véhicules créés ou complétés et reliés.
// Un boîtier déjà rattaché à une autre agence n'est jamais déplacé : il est signalé.
export async function rattacherEquipements(agenceId: string, client: ClientSscs, vehicules: EquipementSscs[], auteur: string | null):
  Promise<{ ajoutes: number; relies: number; erreur?: string }> {
  const db = supabaseAdmin();
  let suiviActif = !!(await db.from('telematique').select('agence_id').eq('agence_id', agenceId).maybeSingle()).data;
  let ajoutes = 0, relies = 0; const refus: string[] = [];
  const aujourdhui = new Date().toISOString().slice(0, 10);
  for (const e of vehicules) {
    const { data: t0 } = await db.from('traceurs').select('id, agence_id').eq('imei', e.imei).maybeSingle();
    if (t0 && t0.agence_id !== agenceId) { refus.push(`${e.immatriculation} (boîtier déjà sur un autre compte)`); continue; }
    // Suivi GPS activé seulement au premier boîtier réellement rattaché
    if (!suiviActif) {
      const { error } = await db.from('telematique').insert({ agence_id: agenceId, fournisseur: 'seeworld', compte_externe_id: null });
      if (error && !/duplicate|existe/i.test(error.message)) return { ajoutes, relies, erreur: `Activation du suivi GPS impossible : ${error.message}` };
      suiviActif = true;
    }
    let traceur_id = t0?.id as string | undefined;
    if (!traceur_id) {
      const { data, error } = await db.from('traceurs').insert({ agence_id: agenceId, imei: e.imei, modele: e.modeleTraceur, sim: e.sim, fournisseur: 'seeworld' }).select('id').single();
      if (error) { refus.push(`${e.immatriculation} (${error.message})`); continue; }
      traceur_id = data.id;
    }
    const { data: v0 } = await db.from('vehicules').select('id, traceur_id, marque, modele').eq('agence_id', agenceId).eq('immatriculation', e.immatriculation).maybeSingle();
    let vehicule_id = v0?.id as string | undefined;
    if (!vehicule_id) {
      const { data, error } = await db.from('vehicules').insert({ agence_id: agenceId, immatriculation: e.immatriculation, marque: e.marque || null, modele: e.modele || null, date_entree: aujourdhui })
        .select('id').single();
      if (error) { refus.push(`${e.immatriculation} (${error.message})`); continue; }
      vehicule_id = data.id; ajoutes++;
    } else {
      relies++;
      const maj: any = {};
      if (!v0!.marque && e.marque) maj.marque = e.marque;
      if (!v0!.modele && e.modele) maj.modele = e.modele;
      if (Object.keys(maj).length) await db.from('vehicules').update(maj).eq('id', vehicule_id);
    }
    await db.from('vehicules').update({ traceur_id: null }).eq('agence_id', agenceId).eq('traceur_id', traceur_id).neq('id', vehicule_id);
    await db.from('vehicules').update({ traceur_id }).eq('id', vehicule_id);
    await db.from('historique').insert({ agence_id: agenceId, vehicule_id, action: 'Traceur GPS relié', detail: `IMEI ${e.imei} · véhicule équipé SS CAR SYSTEM`, auteur });
  }
  await db.from('imports_flotte').insert({ agence_id: agenceId, genre: 'sscs', ok: !refus.length, cree_par: auteur, detail: { client: client.nom, ajoutes, relies, refus } }).then(() => null, () => null);
  return refus.length ? { ajoutes, relies, erreur: `${ajoutes + relies} véhicule${ajoutes + relies > 1 ? 's' : ''} relié${ajoutes + relies > 1 ? 's' : ''}. Non rattachés : ${refus.join(', ')}.` } : { ajoutes, relies };
}
