import { Tabs, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCouleurs } from '@/lib/theme';
import Icone from '@/composants/Icone';

// 4 onglets et, au centre, le bouton qui crée une location en quelques gestes
export default function Onglets() {
  const c = useCouleurs();
  const marges = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.gris,
      tabBarStyle: { backgroundColor: c.panneau, borderTopColor: c.bord, height: 64 + marges.bottom, paddingTop: 6, paddingBottom: marges.bottom + 6 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Journée', tabBarIcon: ({ color }) => <Icone nom="jour" couleur={String(color)} /> }} />
      <Tabs.Screen name="locations" options={{ title: 'Locations', tabBarIcon: ({ color }) => <Icone nom="locations" couleur={String(color)} /> }} />
      <Tabs.Screen name="creer" options={{
        title: '',
        tabBarButton: () => (
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Pressable accessibilityLabel="Nouvelle location" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); router.push('/nouvelle'); }}
              style={({ pressed }) => ({ marginTop: -18, width: 62, height: 62, borderRadius: 31, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center',
                borderWidth: 5, borderColor: c.fond, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
              <Icone nom="ajout" couleur={c.surAccent} taille={28} epaisseur={2.8} />
            </Pressable>
          </View>
        ),
      }} />
      <Tabs.Screen name="flotte" options={{ title: 'Suivi', tabBarIcon: ({ color }) => <Icone nom="carte" couleur={String(color)} /> }} />
      <Tabs.Screen name="amendes" options={{ title: 'Amendes', tabBarIcon: ({ color }) => <Icone nom="amendes" couleur={String(color)} /> }} />
    </Tabs>
  );
}
