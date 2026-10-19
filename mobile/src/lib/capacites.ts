// Ce que la base sait déjà faire (une mise à jour pas encore lancée ne doit rien casser)
import { supabase } from './supabase';
import { DEMO } from './demo';

let signature: Promise<boolean> | null = null;
export function signatureDistance() {
  if (DEMO) return Promise.resolve(true);
  signature ??= Promise.resolve(supabase.from('locations').select('jeton_signature').limit(1)).then(({ error }) => !error).catch(() => false);
  return signature;
}
