// Où en est la location : réservée → partie → rendue
import { Text, View } from 'react-native';
import { useCouleurs } from '@/lib/theme';

export default function Frise({ etapes, actuelle, couleur }: { etapes: string[]; actuelle: number; couleur?: string }) {
  const c = useCouleurs();
  const coul = couleur ?? c.accent;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {etapes.map((e, i) => (
        <View key={e} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
            <View style={{ flex: 1, height: 3, backgroundColor: i === 0 ? 'transparent' : i <= actuelle ? coul : c.bord }} />
            <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: i === actuelle ? 20 : 12, height: i === actuelle ? 20 : 12, borderRadius: 10, backgroundColor: i <= actuelle ? coul : c.panneau2, borderWidth: i === actuelle ? 5 : 0, borderColor: c.panneau }} />
            </View>
            <View style={{ flex: 1, height: 3, backgroundColor: i === etapes.length - 1 ? 'transparent' : i < actuelle ? coul : c.bord }} />
          </View>
          <Text numberOfLines={1} style={{ color: i === actuelle ? c.texte : c.gris, fontSize: 12, fontWeight: i === actuelle ? '800' : '600' }}>{e}</Text>
        </View>
      ))}
    </View>
  );
}
