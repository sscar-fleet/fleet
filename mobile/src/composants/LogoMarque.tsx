import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { logoMarque } from '@/lib/logoMarque';
import { useCouleurs } from '@/lib/theme';

// Logo de la marque sur fond blanc (lisible en mode nuit comme en mode jour)
export default function LogoMarque({ marque, modele, taille = 48 }: { marque?: string | null; modele?: string | null; taille?: number }) {
  const c = useCouleurs();
  const [rate, setRate] = useState(false);
  const src = logoMarque(marque, modele);
  return (
    <View style={{ width: taille, height: taille, borderRadius: taille / 4, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.bord, overflow: 'hidden' }}>
      {src && !rate
        ? <Image source={{ uri: src }} onError={() => setRate(true)} style={{ width: taille * 0.78, height: taille * 0.78 }} resizeMode="contain" />
        : <Text style={{ color: '#5b6b75', fontSize: taille * 0.42, fontWeight: '800' }}>{(marque ?? '').trim().charAt(0).toUpperCase() || '·'}</Text>}
    </View>
  );
}
