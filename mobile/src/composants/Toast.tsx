// Petit message en bas de l'écran après une action (« Caution notée »), sans bloquer
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useCouleurs } from '@/lib/theme';
import Icone from './Icone';

type Genre = 'ok' | 'alerte' | 'info';
const Contexte = createContext<(texte: string, genre?: Genre) => void>(() => {});
export const useToast = () => useContext(Contexte);

export function FournisseurToast({ children }: { children: ReactNode }) {
  const c = useCouleurs();
  const marges = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ texte: string; genre: Genre; n: number } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);

  const montrer = useCallback((texte: string, genre: Genre = 'ok') => {
    if (genre === 'ok') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (genre === 'alerte') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setMsg((m) => ({ texte, genre, n: (m?.n ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!msg) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null)), 2600);
  }, [msg, anim]);

  const coul = msg?.genre === 'alerte' ? c.orange : msg?.genre === 'info' ? c.bleu : c.vert;
  return (
    <Contexte.Provider value={montrer}>
      {children}
      {msg && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, top: marges.top + 8, alignItems: 'center', opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.panneau, borderColor: coul + '88', borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, maxWidth: 520 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: coul + '26', alignItems: 'center', justifyContent: 'center' }}>
              <Icone nom={msg.genre === 'alerte' ? 'alerte' : msg.genre === 'info' ? 'sync' : 'ok'} couleur={coul} taille={15} epaisseur={2.6} />
            </View>
            <Text style={{ color: c.texte, fontWeight: '700', fontSize: 15, flexShrink: 1 }}>{msg.texte}</Text>
          </View>
        </Animated.View>
      )}
    </Contexte.Provider>
  );
}
