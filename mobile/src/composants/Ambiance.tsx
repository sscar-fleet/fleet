// Ambiance commune avec l'appli SS CAR SYSTEM : fond noir qui glisse vers le turquoise, cartes en verre fumé.
// Utilisée par les écrans Journée et Suivi. En thème clair, on garde le fond clair habituel.
import type { ReactNode } from 'react';
import { Pressable, Text, View, useColorScheme, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useCouleurs } from '@/lib/theme';

export const useSombre = () => useColorScheme() !== 'light';

export function FondDegrade() {
  const c = useCouleurs();
  const sombre = useSombre();
  if (!sombre) return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.fond }} />;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="fond" x1="0" y1="0" x2="1" y2="0.35">
            <Stop offset="0" stopColor="#0e1012" />
            <Stop offset="0.38" stopColor="#16201f" />
            <Stop offset="0.75" stopColor="#2a5a53" />
            <Stop offset="1" stopColor="#4fa898" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#fond)" />
      </Svg>
    </View>
  );
}

// Carte en verre fumé (sombre) ou carte blanche (clair)
export function Verre({ children, style, onPress, bord, label }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; bord?: string; label?: string }) {
  const c = useCouleurs();
  const sombre = useSombre();
  const fond = sombre ? 'rgba(6,10,14,.46)' : c.panneau;
  const contour = bord ?? (sombre ? 'rgba(255,255,255,.12)' : c.bord);
  const base: ViewStyle = { borderRadius: 18, borderWidth: 1, borderColor: contour, backgroundColor: fond, overflow: 'hidden' };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [base, style, { opacity: pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

export function Point({ couleur, taille = 10 }: { couleur: string; taille?: number }) {
  return <View style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: couleur, shadowColor: couleur, shadowOpacity: 0.8, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }} />;
}

export function Puce({ titre, n, actif, couleur, onPress }: { titre: string; n?: number; actif: boolean; couleur?: string; onPress: () => void }) {
  const c = useCouleurs();
  const sombre = useSombre();
  const coul = couleur ?? c.accent;
  return (
    <Pressable onPress={onPress} accessibilityLabel={n != null ? `${titre} : ${n}` : titre}
      style={({ pressed }) => ({ height: 38, paddingHorizontal: 14, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.8 : 1,
        backgroundColor: actif ? coul + '24' : sombre ? 'rgba(255,255,255,.06)' : c.panneau, borderWidth: 1, borderColor: actif ? coul : sombre ? 'rgba(255,255,255,.14)' : c.bord })}>
      <Text style={{ color: actif ? coul : c.texte2, fontWeight: actif ? '800' : '600', fontSize: 14 }}>{titre}</Text>
      {n != null ? <Text style={{ color: actif ? coul : c.gris, fontWeight: '800', fontSize: 14 }}>{n}</Text> : null}
    </Pressable>
  );
}

// Petit libellé en capitales espacées, comme les « .lab » de l'appli SS CAR SYSTEM
export function Libelle({ children, couleur }: { children: ReactNode; couleur?: string }) {
  const c = useCouleurs();
  const sombre = useSombre();
  return <Text style={{ color: couleur ?? (sombre ? '#b7c6cf' : c.gris), fontSize: 12, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' }}>{children}</Text>;
}
