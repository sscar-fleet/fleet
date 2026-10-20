import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { FournisseurSession, useSession } from '@/lib/session';
import { envoyerFile } from '@/lib/hors-ligne';
import { useCouleurs } from '@/lib/theme';
import { Chargement } from '@/composants/ui';
import { FournisseurToast } from '@/composants/Toast';

function Navigation() {
  const { session, pret } = useSession();
  const c = useCouleurs();
  useEffect(() => { if (session) envoyerFile().catch(() => {}); }, [session]);
  if (!pret) return <View style={{ flex: 1, backgroundColor: c.fond, justifyContent: 'center', padding: 16 }}><Chargement /></View>;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.fond }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="connexion" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(onglets)" />
        <Stack.Screen name="location/[id]" />
        <Stack.Screen name="edl/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="nouvelle" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="amende" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="vehicule/[id]" />
        <Stack.Screen name="client/[id]" />
        <Stack.Screen name="clients" />
        <Stack.Screen name="carte" />
        <Stack.Screen name="vehicules" />
        <Stack.Screen name="compte" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Racine() {
  return (
    <FournisseurSession>
      <FournisseurToast>
        <StatusBar style="auto" />
        <Navigation />
      </FournisseurToast>
    </FournisseurSession>
  );
}
