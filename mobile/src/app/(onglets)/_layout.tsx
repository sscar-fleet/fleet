import { Tabs } from 'expo-router';
import { useCouleurs } from '@/lib/theme';
import Icone from '@/composants/Icone';

// 5 onglets, pas plus : tout le reste vit sur le site
export default function Onglets() {
  const c = useCouleurs();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.gris,
      tabBarStyle: { backgroundColor: c.panneau, borderTopColor: c.bord, height: 84, paddingTop: 8 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{ title: "Aujourd'hui", tabBarIcon: ({ color }) => <Icone nom="jour" couleur={String(color)} /> }} />
      <Tabs.Screen name="locations" options={{ title: 'Locations', tabBarIcon: ({ color }) => <Icone nom="locations" couleur={String(color)} /> }} />
      <Tabs.Screen name="flotte" options={{ title: 'Flotte', tabBarIcon: ({ color }) => <Icone nom="flotte" couleur={String(color)} /> }} />
      <Tabs.Screen name="amendes" options={{ title: 'Amendes', tabBarIcon: ({ color }) => <Icone nom="amendes" couleur={String(color)} /> }} />
      <Tabs.Screen name="plus" options={{ title: 'Plus', tabBarIcon: ({ color }) => <Icone nom="plus" couleur={String(color)} /> }} />
    </Tabs>
  );
}
