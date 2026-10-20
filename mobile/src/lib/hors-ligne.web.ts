// Version navigateur de la file hors ligne : rangée dans le stockage du navigateur, envoyée dans l'ordre dès que le réseau revient.
// Chaque élément a son identifiant : on relit la file à chaque tour pour ne jamais écraser ce qui a été ajouté pendant l'envoi.
import { supabase } from './supabase';
import { DEMO } from './demo';

export type Operation =
  | { genre: 'maj'; table: string; id: string; champs: Record<string, unknown> }
  | { genre: 'ajout'; table: string; champs: Record<string, unknown> }
  | { genre: 'fichier'; chemin: string; uri: string; type: string; ensuite?: Operation };
type Element = { cle: string; op: Operation; essais: number };

const CLE = 'fleet-file2';
const lireJson = <T,>(cle: string, defaut: T): T => { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; } };
const ecrireJson = (cle: string, v: unknown) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch {} };
const lireFile = () => lireJson<Element[]>(CLE, []);
const nouvelleCle = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Ancienne file (avant cette version) : reprise une seule fois
(() => {
  if (typeof localStorage === 'undefined') return;
  const ancienne = lireJson<Operation[]>('fleet-file', []);
  if (ancienne.length) { ecrireJson(CLE, [...ancienne.map((op) => ({ cle: nouvelleCle(), op, essais: 0 })), ...lireFile()]); try { localStorage.removeItem('fleet-file'); } catch {} }
})();

export async function garder(cle: string, valeur: unknown) { ecrireJson('fleet-cache-' + cle, { valeur, majLe: new Date().toISOString().replace('T', ' ').slice(0, 19) }); }
export async function relire<T>(cle: string) { return lireJson<{ valeur: T; majLe: string } | null>('fleet-cache-' + cle, null); }

export async function enLigne() { return typeof navigator === 'undefined' ? true : navigator.onLine; }
export let dernierRefus = '';

export async function enAttente() { return lireFile().length; }

// Photos et signatures gardées dans la base du navigateur (IndexedDB) : elles survivent à la fermeture de l'appli
// sans réseau, et ne remplissent pas le petit stockage de la file.
function base(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('fleet-fichiers', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('f');
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, faire: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await base();
  return new Promise((ok, ko) => { const t = db.transaction('f', mode); const r = faire(t.objectStore('f')); r.onsuccess = () => ok(r.result as T); r.onerror = () => ko(r.error); });
}
async function rangerFichiers(op: Operation): Promise<Operation> {
  if (op.genre !== 'fichier') return op;
  const ensuite = op.ensuite ? await rangerFichiers(op.ensuite) : undefined;
  if (op.uri.startsWith('idb:') || /^https?:/.test(op.uri)) return { ...op, ensuite };
  try {
    const blob = await reduire(await fetch(op.uri).then((r) => r.blob()));
    const cle = nouvelleCle();
    await idb('readwrite', (st) => st.put(blob, cle));
    return { ...op, uri: 'idb:' + cle, ensuite };
  } catch { return { ...op, ensuite }; }
}

export async function mettreEnFile(op: Operation) {
  const range = await rangerFichiers(op);
  ecrireJson(CLE, [...lireFile(), { cle: nouvelleCle(), op: range, essais: 0 }]);
  envoyerFile().catch(() => {});
}

// Photo du téléphone (souvent 4 à 8 Mo) réduite avant l'envoi : 1600 px, JPEG
async function reduire(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith('image/') || blob.type === 'image/png' || blob.size < 900_000) return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82))) ?? blob;
  } catch { return blob; }
}

async function executer(op: Operation): Promise<void> {
  if (op.genre === 'maj') { const { error } = await supabase.from(op.table).update(op.champs).eq('id', op.id); if (error) throw error; }
  else if (op.genre === 'ajout') {
    const { error } = await supabase.from(op.table).insert(op.champs);
    if (error && error.code !== '23505') throw error; // déjà envoyé (doublon) : on continue
  } else {
    const cleIdb = op.uri.startsWith('idb:') ? op.uri.slice(4) : null;
    let fichier: Blob | undefined;
    if (cleIdb) fichier = await idb<Blob | undefined>('readonly', (st) => st.get(cleIdb));
    else { try { fichier = await reduire(await fetch(op.uri).then((r) => r.blob())); } catch { fichier = undefined; } }
    // Fichier introuvable (appli fermée avant la mise de côté) : on passe à la suite au lieu de bloquer toute la file
    if (fichier) {
      const { error } = await supabase.storage.from('documents').upload(op.chemin, fichier, { contentType: fichier.type || op.type, upsert: true });
      if (error) throw error;
    }
    if (op.ensuite) await executer(op.ensuite);
    if (cleIdb) idb('readwrite', (st) => st.delete(cleIdb)).catch(() => {});
  }
}

// Refus de la base (droits, données) : on met de côté après 3 essais au lieu de bloquer toute la file
const estRefus = (e: any) => !!(e && typeof e === 'object' && (e.code || e.statusCode || e.status || e.name === 'StorageApiError'));

let enCours = false;
export async function envoyerFile() {
  if (DEMO || enCours || !(await enLigne())) return;
  enCours = true;
  try {
    for (let tour = 0; tour < 500; tour++) {
      const premier = lireFile()[0];
      if (!premier) break;
      try {
        await executer(premier.op);
        ecrireJson(CLE, lireFile().filter((x) => x.cle !== premier.cle));
      } catch (e: any) {
        const essais = premier.essais + 1;
        if (estRefus(e) && essais >= 3) {
          dernierRefus = e?.message ?? 'refusé';
          ecrireJson('fleet-refus', [...lireJson<any[]>('fleet-refus', []).slice(-20), { le: new Date().toISOString(), message: dernierRefus, op: premier.op.genre === 'fichier' ? { genre: 'fichier', chemin: premier.op.chemin } : premier.op }]);
          ecrireJson(CLE, lireFile().filter((x) => x.cle !== premier.cle));
          continue;
        }
        ecrireJson(CLE, lireFile().map((x) => (x.cle === premier.cle ? { ...x, essais } : x)));
        if (!estRefus(e)) break; // coupure réseau : on garde l'ordre et on réessaiera au retour du réseau
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  } finally { enCours = false; }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { envoyerFile().catch(() => {}); });
  setInterval(() => { if (lireFile().length) envoyerFile().catch(() => {}); }, 20000);
}
