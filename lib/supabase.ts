import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function supabaseServeur() {
  const store = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (liste) => {
        try {
          liste.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // appelé depuis un composant serveur : le middleware rafraîchit la session
        }
      },
    },
  });
}
