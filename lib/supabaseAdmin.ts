// Accès serveur complet à la base, pour les tâches sans utilisateur connecté (tournée des notifications).
// Clé SUPABASE_SERVICE_ROLE_KEY à coller par SS CAR FLEET dans Vercel ; jamais envoyée au navigateur ni à l'appli.
import { createClient } from '@supabase/supabase-js';

export const adminConfigure = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
let client: any = null;
export function supabaseAdmin(): any {
  if (!adminConfigure()) throw new Error('Clé serveur Supabase absente.');
  if (!client) {
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
    // Nouvelle clé « secret » (sb_secret_…) : elle ne doit passer que dans l'en-tête apikey, pas en « Bearer »
    // (la passerelle Supabase la refuserait comme un jeton invalide). L'ancienne clé service_role (eyJ…) passe partout.
    const fetchPropre: typeof fetch = (url, init) => {
      if (!cle.startsWith('sb_secret_')) return fetch(url, init);
      const h = new Headers(init?.headers);
      if ((h.get('authorization') ?? '').includes('sb_secret_')) h.delete('authorization');
      h.set('apikey', cle);
      return fetch(url, { ...init, headers: h });
    };
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, cle, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchPropre } });
  }
  return client;
}
