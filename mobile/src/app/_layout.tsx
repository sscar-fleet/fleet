import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { FournisseurSession, useSession } from '@/lib/session';
import { envoyerFile } from '@/lib/hors-ligne';
import { useCouleurs } from '@/lib/theme';
import { Chargement } from '@/composants/ui';
import { FournisseurToast } from '@/composants/Toast';

function Navigation() {
  const { session, pret, profil } = useSession();
  const c = useCouleurs();
  useEffect(() => { if (session) envoyerFile().catch(() => {}); }, [session]);
  if (!pret) return <View style={{ flex: 1, backgroundColor: c.fond, justifyContent: 'center', padding: 16 }}><Chargement /></View>;
  // Employé qui n'a accès qu'au logiciel (ordinateur)
  if (session && profil?.acces === 'logiciel') return (
    <View style={{ flex: 1, backgroundColor: c.fond, justifyContent: 'center', padding: 24, gap: 14 }}>
      <Text style={{ color: c.texte, fontSize: 24, fontWeight: '800' }}>Accès au logiciel uniquement</Text>
      <Text style={{ color: c.gris, fontSize: 16, lineHeight: 23 }}>Votre gérant vous a donné accès au logiciel sur ordinateur, pas à l’appli. Demandez-lui de changer votre accès si vous en avez besoin sur le téléphone.</Text>
      <Pressable onPress={() => supabase.auth.signOut()} style={{ height: 52, borderRadius: 16, borderWidth: 1, borderColor: c.bord, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.texte, fontWeight: '800', fontSize: 16 }}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
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
        <Stack.Screen name="assistant" />
        <Stack.Screen name="stock" />
        <Stack.Screen name="notifications" />
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
