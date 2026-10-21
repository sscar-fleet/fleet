// Cloche de l'écran Journée : le nombre d'urgents, et la liste au toucher
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Icone from './Icone';
import { useCouleurs } from '@/lib/theme';
import { api } from '@/lib/site';
import { DEMO } from '@/lib/demo';

export default function ClocheAppli() {
  const c = useCouleurs();
  const [n, setN] = useState({ urgentes: 0, total: 0 });
  useFocusEffect(useCallback(() => {
    if (DEMO) return;
    api<{ urgentes: number; notifications: unknown[] }>('notifications').then((r) => setN({ urgentes: r.urgentes, total: r.notifications.length })).catch(() => {});
  }, []));
  return (
    <Pressable accessibilityLabel={`Notifications${n.urgentes ? ` : ${n.urgentes} urgentes` : ''}`} hitSlop={8} onPress={() => router.push('/notifications')}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: c.panneau2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Icone nom="cloche" couleur={c.texte} taille={21} />
      {n.urgentes > 0 ? (
        <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: c.rouge, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.fond }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{n.urgentes}</Text>
        </View>
      ) : n.total > 0 ? <View style={{ position: 'absolute', top: 8, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: c.orange, borderWidth: 2, borderColor: c.panneau2 }} /> : null}
    </Pressable>
  );
}
