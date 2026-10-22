// Authentification des routes /api : cookie du site, ou jeton « Bearer » envoyé par l'appli téléphone
import { createClient } from '@supabase/supabase-js';
import { supabaseServeur } from './supabase';

export async function clientApi(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && auth.length > 20) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase.auth.getUser(auth.slice(7));
    return data.user ? { supabase, user: data.user } : null;
  }
  const supabase = supabaseServeur();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

// Fleet AI et lecture automatique : réservées aux agences ouvertes, plafonnées par jour (protège la facture d'IA)
const PLAFOND_IA_JOUR = 300;
export async function quotaIa(supabase: any): Promise<string | null> {
  const { data, error } = await supabase.rpc('ia_compter');
  if (error) return /fermé/i.test(error.message) ? 'Votre compte n’est pas encore ouvert.' : null; // base pas encore à jour : on laisse passer
  if (Number(data) > PLAFOND_IA_JOUR) return 'Limite du jour atteinte pour l’IA de votre agence. Elle revient demain matin.';
  return null;
}
