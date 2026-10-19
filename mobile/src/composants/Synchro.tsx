// Pastille d'envoi : combien d'éléments attendent le réseau ; un toucher relance l'envoi
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { enAttente, envoyerFile } from '@/lib/hors-ligne';
import { useCouleurs } from '@/lib/theme';
import { useToast } from './Toast';
import Icone from './Icone';

export default function Synchro() {
  const c = useCouleurs();
  const toast = useToast();
  const [n, setN] = useState(0);
  const lire = useCallback(() => { enAttente().then(setN).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { lire(); const t = setInterval(lire, 4000); return () => clearInterval(t); }, [lire]));
  return (
    <Pressable accessibilityLabel="Envoi des données" hitSlop={8}
      onPress={async () => { await envoyerFile().catch(() => {}); const r = await enAttente(); setN(r); toast(r ? `${r} élément${r > 1 ? 's' : ''} en attente de réseau` : 'Tout est envoyé', r ? 'alerte' : 'ok'); }}
      style={{ height: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: n ? c.orange + '22' : c.panneau2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icone nom={n ? 'nuage' : 'ok'} couleur={n ? c.orange : c.vert} taille={18} epaisseur={2.4} />
      <Text style={{ color: n ? c.orange : c.texte2, fontWeight: '800', fontSize: 13 }}>{n ? `${n} en attente` : 'À jour'}</Text>
    </Pressable>
  );
}
