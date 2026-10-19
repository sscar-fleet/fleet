// Mode hors ligne : tout ce qui est fait sans réseau (photos, signatures, états des lieux) est rangé
// sur le téléphone dans une file d'attente, puis envoyé tout seul dès que le réseau revient.
// Les données du jour sont aussi gardées en mémoire pour s'afficher dans un parking sans réseau.
import * as SQLite from 'expo-sqlite';
import * as Network from 'expo-network';
import { supabase } from './supabase';
import { DEMO } from './demo';

export type Operation =
  | { genre: 'maj'; table: string; id: string; champs: Record<string, unknown> }
  | { genre: 'ajout'; table: string; champs: Record<string, unknown> }
  | { genre: 'fichier'; chemin: string; uri: string; type: string; ensuite?: Operation };

let base: SQLite.SQLiteDatabase | null = null;
async function db() {
  if (!base) {
    base = await SQLite.openDatabaseAsync('fleet.db');
    await base.execAsync(`
      create table if not exists file (id integer primary key autoincrement, op text not null, essais int not null default 0, cree_le text not null default (datetime('now')));
      create table if not exists cache (cle text primary key, valeur text not null, maj_le text not null default (datetime('now')));`);
  }
  return base;
}

// --- Cache des écrans (lecture sans réseau)
export async function garder(cle: string, valeur: unknown) {
  const d = await db();
  await d.runAsync('insert or replace into cache (cle, valeur, maj_le) values (?, ?, datetime(\'now\'))', cle, JSON.stringify(valeur));
}
export async function relire<T>(cle: string): Promise<{ valeur: T; majLe: string } | null> {
  const d = await db();
  const r = await d.getFirstAsync<{ valeur: string; maj_le: string }>('select valeur, maj_le from cache where cle = ?', cle);
  return r ? { valeur: JSON.parse(r.valeur) as T, majLe: r.maj_le } : null;
}

// --- File d'attente des envois
export async function mettreEnFile(op: Operation) {
  const d = await db();
  await d.runAsync('insert into file (op) values (?)', JSON.stringify(op));
  envoyerFile().catch(() => {});
}
// Erreur de données (refus de la base) : on met de côté au lieu de bloquer la file
const estRefus = (e: unknown) => !!(e && typeof e === 'object' && ('code' in e || 'statusCode' in e));
export let dernierRefus = '';

export async function enAttente() {
  const d = await db();
  return (await d.getFirstAsync<{ n: number }>('select count(*) as n from file'))?.n ?? 0;
}

export async function enLigne() {
  const e = await Network.getNetworkStateAsync();
  return !!e.isConnected && e.isInternetReachable !== false;
}

async function executer(op: Operation): Promise<void> {
  if (op.genre === 'maj') {
    const { error } = await supabase.from(op.table).update(op.champs).eq('id', op.id);
    if (error) throw error;
  } else if (op.genre === 'ajout') {
    const { error } = await supabase.from(op.table).insert(op.champs);
    if (error) throw error;
  } else {
    const fichier = await fetch(op.uri).then((r) => r.arrayBuffer());
    const { error } = await supabase.storage.from('documents').upload(op.chemin, fichier, { contentType: op.type, upsert: true });
    if (error) throw error;
    if (op.ensuite) await executer(op.ensuite);
  }
}

let enCours = false;
export async function envoyerFile() {
  if (DEMO) return;
  if (enCours || !(await enLigne())) return;
  enCours = true;
  try {
    const d = await db();
    const lignes = await d.getAllAsync<{ id: number; op: string }>('select id, op from file order by id');
    for (const l of lignes) {
      try {
        await executer(JSON.parse(l.op));
        await d.runAsync('delete from file where id = ?', l.id);
      } catch (e) {
        if (estRefus(e)) { dernierRefus = (e as any).message ?? 'refusé'; await d.runAsync('delete from file where id = ?', l.id); continue; }
        await d.runAsync('update file set essais = essais + 1 where id = ?', l.id);
        break; // coupure réseau : on garde l'ordre et on réessaiera au retour du réseau
      }
    }
  } finally {
    enCours = false;
  }
}

// Relance automatique quand le réseau revient
Network.addNetworkStateListener?.((e) => { if (e.isConnected) envoyerFile().catch(() => {}); });
