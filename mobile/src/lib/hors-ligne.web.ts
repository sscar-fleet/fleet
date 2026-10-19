// Version navigateur de la file hors ligne : même fonctionnement, rangée dans le stockage du navigateur
import { supabase } from './supabase';

export type Operation =
  | { genre: 'maj'; table: string; id: string; champs: Record<string, unknown> }
  | { genre: 'ajout'; table: string; champs: Record<string, unknown> }
  | { genre: 'fichier'; chemin: string; uri: string; type: string; ensuite?: Operation };

const lireJson = <T,>(cle: string, defaut: T): T => { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; } };
const ecrireJson = (cle: string, v: unknown) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch {} };

export async function garder(cle: string, valeur: unknown) { ecrireJson('fleet-cache-' + cle, { valeur, majLe: new Date().toISOString().replace('T', ' ').slice(0, 19) }); }
export async function relire<T>(cle: string) { return lireJson<{ valeur: T; majLe: string } | null>('fleet-cache-' + cle, null); }

export async function enLigne() { return typeof navigator === 'undefined' ? true : navigator.onLine; }
// Erreur de données (refus de la base) : on met de côté au lieu de bloquer la file
const estRefus = (e: unknown) => !!(e && typeof e === 'object' && ('code' in e || 'statusCode' in e));
export let dernierRefus = '';

export async function enAttente() { return lireJson<Operation[]>('fleet-file', []).length; }

export async function mettreEnFile(op: Operation) {
  ecrireJson('fleet-file', [...lireJson<Operation[]>('fleet-file', []), op]);
  envoyerFile().catch(() => {});
}

async function executer(op: Operation): Promise<void> {
  if (op.genre === 'maj') { const { error } = await supabase.from(op.table).update(op.champs).eq('id', op.id); if (error) throw error; }
  else if (op.genre === 'ajout') { const { error } = await supabase.from(op.table).insert(op.champs); if (error) throw error; }
  else {
    const fichier = await fetch(op.uri).then((r) => r.blob());
    const { error } = await supabase.storage.from('documents').upload(op.chemin, fichier, { contentType: op.type, upsert: true });
    if (error) throw error;
    if (op.ensuite) await executer(op.ensuite);
  }
}

let enCours = false;
export async function envoyerFile() {
  if (enCours || !(await enLigne())) return;
  enCours = true;
  try {
    let file = lireJson<Operation[]>('fleet-file', []);
    while (file.length) {
      try { await executer(file[0]); } catch (e) { if (!estRefus(e)) break; dernierRefus = (e as any).message ?? 'refusé'; }
      file = file.slice(1); ecrireJson('fleet-file', file);
    }
  } finally { enCours = false; }
}

if (typeof window !== 'undefined') window.addEventListener('online', () => { envoyerFile().catch(() => {}); });
