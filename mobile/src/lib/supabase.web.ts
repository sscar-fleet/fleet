// Version navigateur : le navigateur garde la session tout seul
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const cle = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const configure = !!(url && cle);

export const supabase = createClient(url || 'https://exemple.supabase.co', cle || 'cle-manquante', {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, storageKey: 'fleet-appli' },
});
