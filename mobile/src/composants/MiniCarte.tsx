// Petite carte sans dépendance : tuiles OpenStreetMap assemblées, cadrage automatique sur les points.
// Un toucher ouvre l'itinéraire dans Google Maps (ou Plans).
import { useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useCouleurs } from '@/lib/theme';

export type Point = { id: string; lat: number; lng: number; couleur: string; titre?: string; onPress?: () => void };
const TUILE = 256;
const versPixel = (lat: number, lng: number, z: number) => {
  const n = TUILE * 2 ** z; const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};

export default function MiniCarte({ points, hauteur = 190, zoomMax = 16, onPress }: { points: Point[]; hauteur?: number; zoomMax?: number; onPress?: () => void }) {
  const c = useCouleurs();
  const [largeur, setLargeur] = useState(0);
  if (!points.length) return null;
  // Plus grand zoom où tous les points tiennent avec une marge
  let z = zoomMax;
  if (largeur) {
    for (; z > 3; z--) {
      const px = points.map((p) => versPixel(p.lat, p.lng, z));
      const w = Math.max(...px.map((p) => p.x)) - Math.min(...px.map((p) => p.x));
      const h = Math.max(...px.map((p) => p.y)) - Math.min(...px.map((p) => p.y));
      if (w < largeur - 70 && h < hauteur - 70) break;
    }
  }
  const px = points.map((p) => ({ ...p, ...versPixel(p.lat, p.lng, z) }));
  const cx = (Math.min(...px.map((p) => p.x)) + Math.max(...px.map((p) => p.x))) / 2;
  const cy = (Math.min(...px.map((p) => p.y)) + Math.max(...px.map((p) => p.y))) / 2;
  const x0 = cx - largeur / 2, y0 = cy - hauteur / 2;
  const tuiles: { x: number; y: number }[] = [];
  if (largeur) for (let tx = Math.floor(x0 / TUILE); tx <= Math.floor((x0 + largeur) / TUILE); tx++) for (let ty = Math.floor(y0 / TUILE); ty <= Math.floor((y0 + hauteur) / TUILE); ty++) tuiles.push({ x: tx, y: ty });
  const n = 2 ** z;
  const ouvrir = onPress ?? (() => { const p = points[0]; Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`); });

  return (
    <Pressable onPress={ouvrir} onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
      style={{ height: hauteur, borderRadius: 16, overflow: 'hidden', backgroundColor: c.panneau2, borderWidth: 1, borderColor: c.bord }}>
      {tuiles.map((t) => (
        <Image key={`${t.x}-${t.y}`} source={{ uri: `https://tile.openstreetmap.org/${z}/${((t.x % n) + n) % n}/${t.y}.png` }}
          style={{ position: 'absolute', left: t.x * TUILE - x0, top: t.y * TUILE - y0, width: TUILE, height: TUILE }} />
      ))}
      {largeur > 0 && px.map((p) => (
        <Pressable key={p.id} disabled={!p.onPress} onPress={p.onPress} style={{ position: 'absolute', left: p.x - x0 - 15, top: p.y - y0 - 15, alignItems: 'center' }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: p.couleur + '40', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: p.couleur, borderWidth: 3, borderColor: '#fff' }} />
          </View>
          {p.titre ? <Text style={{ marginTop: 1, backgroundColor: 'rgba(11,15,18,.82)', color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>{p.titre}</Text> : null}
        </Pressable>
      ))}
      <Text style={{ position: 'absolute', right: 6, bottom: 4, fontSize: 9, color: '#333', backgroundColor: 'rgba(255,255,255,.7)', paddingHorizontal: 4, borderRadius: 3 }}>© OpenStreetMap</Text>
    </Pressable>
  );
}
