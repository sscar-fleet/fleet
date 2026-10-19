import { createClient } from '@supabase/supabase-js';
import ScanTelephone from './ScanTelephone';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Scan des papiers · SS CAR FLEET', robots: { index: false } };

// Page ouverte sur le téléphone en visant le QR code de l'ordinateur : pas de connexion, le lien vaut 30 minutes
export default async function PageScan({ params }: { params: { jeton: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = /^[0-9a-f-]{36}$/i.test(params.jeton) ? await supabase.rpc('voir_scan', { le_jeton: params.jeton }) : { data: null };
  return <ScanTelephone jeton={params.jeton} seance={data as any} />;
}
