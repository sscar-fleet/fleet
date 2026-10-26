// Lien avec le serveur du site : mêmes comptes, routes /api protégées par le jeton de connexion
import { Platform } from 'react-native';
import { supabase } from './supabase';

const FLEET = process.env.EXPO_PUBLIC_FLEET_URL ?? '';
export const urlSite = (chemin = '') => {
  const base = FLEET || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'https://app.sscarfleet.com');
  return base.replace(/\/$/, '') + chemin;
};

export async function api<T>(route: string, corps?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(urlSite(`/api/${route}`), {
    method: corps === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(res.erreur ?? 'Le serveur ne répond pas pour le moment.');
  return res as T;
}
