'use client';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';

export default function Deconnexion() {
  return (
    <button className="bouton petit" type="button" onClick={async () => { await supabaseNavigateur().auth.signOut(); window.location.href = '/login'; }}>
      Se déconnecter
    </button>
  );
}
