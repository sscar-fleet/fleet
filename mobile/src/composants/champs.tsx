// Champs et puces au pouce
import { useState } from 'react';
import { Pressable, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useCouleurs, T } from '@/lib/theme';

export function Champ({ libelle, valeur, onChange, clavier, placeholder, majuscules = false, autoFocus = false }: {
  libelle?: string; valeur: string; onChange: (t: string) => void; clavier?: KeyboardTypeOptions; placeholder?: string; majuscules?: boolean; autoFocus?: boolean;
}) {
  const c = useCouleurs();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {libelle ? <Text style={{ color: c.gris, fontSize: 14, fontWeight: '700' }}>{libelle}</Text> : null}
      <TextInput value={valeur} onChangeText={onChange} keyboardType={clavier} placeholder={placeholder} placeholderTextColor={c.gris}
        autoCapitalize={majuscules ? 'characters' : 'sentences'} autoFocus={autoFocus} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ backgroundColor: c.panneau, color: c.texte, borderWidth: 1.5, borderColor: focus ? c.accent : c.bord, borderRadius: T.rayon, minHeight: 56, paddingHorizontal: 16, fontSize: 18, outlineStyle: 'none' as never }} />
    </View>
  );
}

export function Puce({ titre, actif, onPress, couleur }: { titre: string; actif?: boolean; onPress: () => void; couleur?: string }) {
  const c = useCouleurs();
  const fond = actif ? (couleur ?? c.accent) : c.panneau2;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      style={{ paddingHorizontal: 16, minHeight: T.cible, justifyContent: 'center', borderRadius: 99, backgroundColor: fond, borderWidth: 1, borderColor: actif ? fond : c.bord }}>
      <Text style={{ color: actif ? c.surAccent : c.texte, fontSize: 16, fontWeight: '700' }}>{titre}</Text>
    </Pressable>
  );
}

export function Puces({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

export function Recherche({ valeur, onChange, placeholder }: { valeur: string; onChange: (t: string) => void; placeholder: string }) {
  const c = useCouleurs();
  return (
    <TextInput value={valeur} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.gris} autoCorrect={false}
      style={{ backgroundColor: c.panneau2, color: c.texte, borderRadius: 99, minHeight: 50, paddingHorizontal: 20, fontSize: 17, outlineStyle: 'none' as never }} />
  );
}
