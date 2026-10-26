// Session de l'utilisateur et de son agence, partagée par tous les écrans
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { DEMO } from './demo';

type Profil = { id: string; nom: string; role: string; agence_id: string; agence: string; acces?: string; ferme?: string | null;
  metier?: 'location' | 'transport'; chauffeur_id?: string | null; permis_valide_le?: string | null };
type Etat = { session: Session | null; profil: Profil | null; pret: boolean };

const Contexte = createContext<Etat>({ session: null, profil: null, pret: false });
export const useSession = () => useContext(Contexte);

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<Etat>({ session: null, profil: null, pret: false });

  useEffect(() => {
    if (DEMO) { setEtat({ session: { user: { email: 'demo@fleet' } } as unknown as Session, profil: { id: 'demo', nom: 'Singh Abelli', role: 'gerant', agence_id: 'demo', agence: 'SS CAR SYSTEM RENT' }, pret: true }); return; }
    const charger = async (session: Session | null) => {
      if (!session) { setEtat({ session: null, profil: null, pret: true }); return; }
      const { data } = await supabase.from('utilisateurs').select('id, nom, role, agence_id, agences(*)').eq('id', session.user.id).maybeSingle();
      const { data: a } = await supabase.from('utilisateurs').select('acces').eq('id', session.user.id).maybeSingle();
      // Compte pas encore ouvert, essai terminé ou suspendu
      const { data: etat } = await supabase.rpc('etat_compte');
      const e: any = Array.isArray(etat) ? etat[0] : etat;
      const ferme = e && e.ouvert === false ? String(e.statut) : null;
      // Version transport : le chauffeur relié à ce compte (accès « chauffeur » : il ne voit que ses tournées)
      const metier = (data as any)?.agences?.metier === 'transport' ? 'transport' as const : 'location' as const;
      const { data: ch } = metier === 'transport' ? await supabase.from('chauffeurs').select('id, permis_valide_le').eq('utilisateur_id', session.user.id).maybeSingle() : { data: null };
      const profil = data ? { ferme, id: data.id, nom: data.nom, role: data.role, agence_id: data.agence_id, agence: (data as any).agences?.nom ?? '', acces: (a as any)?.acces ?? 'les_deux',
        metier, chauffeur_id: (ch as any)?.id ?? null, permis_valide_le: (ch as any)?.permis_valide_le ?? null } : null;
      setEtat({ session, profil, pret: true });
    };
    supabase.auth.getSession().then(({ data }) => charger(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { charger(s); });
    return () => data.subscription.unsubscribe();
  }, []);

  return <Contexte.Provider value={etat}>{children}</Contexte.Provider>;
}
