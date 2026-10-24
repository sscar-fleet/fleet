// Accès serveur complet à la base, pour les tâches sans utilisateur connecté (tournée des notifications).
// Clé SUPABASE_SERVICE_ROLE_KEY à coller par SS CAR FLEET dans Vercel ; jamais envoyée au navigateur ni à l'appli.
import { createClient } from '@supabase/supabase-js';

export const adminConfigure = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
let client: any = null;
export function supabaseAdmin(): any {
  if (!adminConfigure()) throw new Error('Clé serveur Supabase absente.');
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
