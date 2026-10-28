import { useState } from 'react';
import { Image, View } from 'react-native';
import LogoMarque from './LogoMarque';
import { enteteVisuel, urlVisuel, type VehiculeVisuel } from '@/lib/visuel';

// Photo du modèle (trois quarts avant, sans fond, dans la couleur du véhicule) quand elle existe, sinon le logo de la marque.
// « taille » = hauteur ; la photo prend un peu plus de largeur que le logo pour que la voiture reste lisible.
// Pendant le chargement le logo reste affiché : rien ne saute, et jamais d'image cassée.
export default function VisuelVehicule({ v, taille = 48 }: { v: VehiculeVisuel | null | undefined; taille?: number }) {
  const src = urlVisuel(v);
  const [etat, setEtat] = useState<'charge' | 'ok' | 'rate'>('charge');
  if (!src || etat === 'rate') return <LogoMarque marque={v?.marque} modele={v?.modele} taille={taille} />;
  const largeur = Math.round(taille * 1.7);
  return (
    <View style={{ width: largeur, height: taille, alignItems: 'center', justifyContent: 'center' }}>
      {etat === 'charge' && <View style={{ position: 'absolute' }}><LogoMarque marque={v?.marque} modele={v?.modele} taille={Math.round(taille * 0.8)} /></View>}
      <Image
        source={{ uri: src, headers: enteteVisuel(), cache: 'force-cache' }}
        onLoad={() => setEtat('ok')}
        onError={() => setEtat('rate')}
        style={{ width: largeur, height: taille, opacity: etat === 'ok' ? 1 : 0 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
