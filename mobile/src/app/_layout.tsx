import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { FournisseurSession, useSession } from '@/lib/session';
import { envoyerFile } from '@/lib/hors-ligne';
import { useCouleurs } from '@/lib/theme';
import { Chargement } from '@/composants/ui';

function Navigation() {
  const { session, pret } = useSession();
  const c = useCouleurs();
  useEffect(() => { if (session) envoyerFile().catch(() => {}); }, [session]);
  if (!pret) return <View style={{ flex: 1, backgroundColor: c.fond, justifyContent: 'center' }}><Chargement /></View>;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.fond } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="connexion" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(onglets)" />
        <Stack.Screen name="location/[id]" options={{ headerShown: true, title: '', headerBackTitle: 'Retour', headerTintColor: c.accent, headerStyle: { backgroundColor: c.fond } }} />
        <Stack.Screen name="edl/[id]" options={{ presentation: 'fullScreenModal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function Racine() {
  return (
    <FournisseurSession>
      <StatusBar style="auto" />
      <Navigation />
    </FournisseurSession>
  );
}
