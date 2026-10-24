import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { badgeSport, logoMarque } from '@/lib/logoMarque';

// Logo de la marque posé directement sur le fond (sans pastille, sans contour).
// Marque inconnue ou image introuvable : la place reste vide, rien d'autre ne s'affiche.
export default function LogoMarque({ marque, modele, taille = 48 }: { marque?: string | null; modele?: string | null; taille?: number }) {
  const [rate, setRate] = useState(false);
  const src = logoMarque(marque, modele);
  return (
    <View style={{ width: taille, height: taille, alignItems: 'center', justifyContent: 'center' }}>
      {src && !rate ? <Image source={{ uri: src }} onError={() => setRate(true)} style={{ width: taille, height: taille }} resizeMode="contain" /> : null}
    </View>
  );
}

// Badge sport à côté du nom du véhicule (RS, AMG, M, GTI, R.S.…), déduit de la marque et du modèle
export function BadgeSport({ marque, modele, petit = false }: { marque?: string | null; modele?: string | null; petit?: boolean }) {
  const b = badgeSport(marque, modele);
  if (!b) return null;
  const h = petit ? 15 : 18;
  const bandes = b.fond.startsWith('linear-gradient') ? ['#0166b1', '#1c2b6b', '#e22028'] : null; // BMW M
  return (
    <View style={{ height: h, paddingHorizontal: petit ? 4 : 6, borderRadius: petit ? 4 : 5, overflow: 'hidden', justifyContent: 'center', backgroundColor: bandes ? undefined : b.fond, alignSelf: 'center' }}>
      {bandes && <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' }}>{bandes.map((c) => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}</View>}
      <Text style={{ color: b.encre, fontSize: petit ? 9 : 10.5, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.6 }}>{b.texte}</Text>
    </View>
  );
}
