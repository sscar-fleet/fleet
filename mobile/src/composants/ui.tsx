// Briques d'écran : tout est gros, lisible et se touche au pouce
import { ActivityIndicator, Pressable, ScrollView, Text, View, RefreshControl, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useCouleurs, T } from '@/lib/theme';

export function Ecran({ titre, sousTitre, children, rafraichir, enChargement = false, bas }: {
  titre: string; sousTitre?: string; children: ReactNode; rafraichir?: () => void; enChargement?: boolean; bas?: ReactNode;
}) {
  const c = useCouleurs();
  const marges = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.fond }}>
      <ScrollView
        contentContainerStyle={{ padding: T.marge, paddingTop: marges.top + 12, paddingBottom: (bas ? 110 : 32), gap: 12 }}
        refreshControl={rafraichir ? <RefreshControl refreshing={enChargement} onRefresh={rafraichir} tintColor={c.accent} /> : undefined}>
        <View style={{ marginBottom: 6 }}>
          <Text style={{ color: c.texte, fontSize: T.titre, fontWeight: '800' }}>{titre}</Text>
          {sousTitre ? <Text style={{ color: c.gris, fontSize: T.petit, marginTop: 2 }}>{sousTitre}</Text> : null}
        </View>
        {children}
      </ScrollView>
      {bas ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: T.marge, paddingBottom: marges.bottom + 10, backgroundColor: c.fond }}>{bas}</View> : null}
    </View>
  );
}

// Le bouton principal : un seul par écran, il dit quoi faire ensuite
export function GrosBouton({ titre, onPress, secondaire = false, desactive = false, style }: {
  titre: string; onPress: () => void; secondaire?: boolean; desactive?: boolean; style?: ViewStyle;
}) {
  const c = useCouleurs();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={desactive}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onPress(); }}
      style={({ pressed }) => [{
        minHeight: secondaire ? T.cible + 4 : T.bouton, borderRadius: T.rayon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18,
        backgroundColor: secondaire ? c.panneau2 : c.accent, opacity: desactive ? 0.4 : pressed ? 0.85 : 1,
        borderWidth: secondaire ? 1 : 0, borderColor: c.bord,
      }, style]}>
      <Text style={{ color: secondaire ? c.texte : c.surAccent, fontSize: secondaire ? 16 : 18, fontWeight: '800' }}>{titre}</Text>
    </Pressable>
  );
}

export function Carte({ children, onPress, accent }: { children: ReactNode; onPress?: () => void; accent?: string }) {
  const c = useCouleurs();
  const style: ViewStyle = { backgroundColor: c.panneau, borderRadius: T.rayon, padding: 16, gap: 6, borderWidth: 1, borderColor: c.bord, borderLeftWidth: accent ? 5 : 1, borderLeftColor: accent ?? c.bord };
  if (!onPress) return <View style={style}>{children}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.8 : 1 }]}>{children}</Pressable>;
}

export function Ligne({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Texte({ children, gris = false, gras = false, taille = T.texte, couleur }: { children: ReactNode; gris?: boolean; gras?: boolean; taille?: number; couleur?: string }) {
  const c = useCouleurs();
  return <Text style={{ color: couleur ?? (gris ? c.gris : c.texte), fontSize: taille, fontWeight: gras ? '700' : '400' }}>{children}</Text>;
}

export function Pastille({ ok, titre }: { ok: boolean; titre: string }) {
  const c = useCouleurs();
  const coul = ok ? c.vert : c.orange;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: coul + '22' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: coul }} />
      <Text style={{ color: coul, fontSize: 13, fontWeight: '700' }}>{titre}</Text>
    </View>
  );
}

export function Titre({ children }: { children: ReactNode }) {
  const c = useCouleurs();
  return <Text style={{ color: c.gris, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10 }}>{children}</Text>;
}

export function Vide({ titre, texte }: { titre: string; texte?: string }) {
  const c = useCouleurs();
  return (
    <View style={{ alignItems: 'center', padding: 28, gap: 6 }}>
      <Text style={{ color: c.texte, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{titre}</Text>
      {texte ? <Text style={{ color: c.gris, fontSize: 15, textAlign: 'center' }}>{texte}</Text> : null}
    </View>
  );
}

export function Chargement() {
  const c = useCouleurs();
  return <View style={{ padding: 40 }}><ActivityIndicator color={c.accent} size="large" /></View>;
}

export function BandeauHorsLigne({ majLe }: { majLe?: string }) {
  const c = useCouleurs();
  return (
    <View style={{ backgroundColor: c.orange + '22', borderRadius: 12, padding: 12 }}>
      <Text style={{ color: c.orange, fontWeight: '700' }}>Pas de réseau : affichage de la dernière version{majLe ? ` (${new Date(majLe.replace(' ', 'T') + 'Z').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})` : ''}. Vous pouvez continuer, tout sera envoyé au retour du réseau.</Text>
    </View>
  );
}
