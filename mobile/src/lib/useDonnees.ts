import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

// Charge un écran, recharge au retour sur l'écran et au geste « tirer pour actualiser »
export function useDonnees<T>(charger: () => Promise<{ donnees: T; horsLigne: boolean; majLe?: string }>) {
  const [etat, setEtat] = useState<{ donnees?: T; horsLigne: boolean; majLe?: string; erreur?: string; enChargement: boolean }>({ horsLigne: false, enChargement: true });
  const lancer = useCallback(() => {
    setEtat((e) => ({ ...e, enChargement: true }));
    charger().then((r) => setEtat({ ...r, enChargement: false })).catch((e) => setEtat((s) => ({ ...s, erreur: e.message, enChargement: false })));
  }, [charger]);
  useEffect(() => { lancer(); }, [lancer]);
  useFocusEffect(useCallback(() => { lancer(); }, [lancer]));
  return { ...etat, recharger: lancer };
}
