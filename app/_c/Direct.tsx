'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';

// Synchronisation en direct : dès qu'une de ces tables change (sur le téléphone ou un autre PC),
// l'écran se met à jour tout seul.
export default function Direct({ tables }: { tables: string[] }) {
  const router = useRouter();
  const minuteur = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const supabase = supabaseNavigateur();
    const canal = supabase.channel('direct-' + tables.join('-'));
    tables.forEach((table) =>
      canal.on('postgres_changes' as any, { event: '*', schema: 'public', table }, () => {
        clearTimeout(minuteur.current);
        minuteur.current = setTimeout(() => router.refresh(), 400);
      })
    );
    canal.subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [router, tables.join(',')]);
  return null;
}
