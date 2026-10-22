// Le client signe avec le doigt. L'image est produite pour le PDF.
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useCouleurs } from '@/lib/theme';

const H = 220;
// Sur téléphone natif, la zone affichée est capturée directement en PNG
let svgActif: any = null;

export default function Signature({ onChange }: { onChange: (traits: string[], largeur: number) => void }) {
  const c = useCouleurs();
  const [traits, setTraits] = useState<string[]>([]);
  const courant = useRef('');
  const largeur = useRef(320);
  const maj = (t: string[]) => { setTraits(t); onChange(t, largeur.current); };
  const zone = useRef<any>(null);
  // Navigateur (iPhone) : la page ne doit pas défiler pendant que le client signe
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = zone.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const bloquer = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', bloquer, { passive: false });
    el.addEventListener('touchmove', bloquer, { passive: false });
    return () => { el.removeEventListener('touchstart', bloquer); el.removeEventListener('touchmove', bloquer); };
  }, []);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { const { locationX: x, locationY: y } = e.nativeEvent; courant.current = `M${x.toFixed(1)} ${y.toFixed(1)}`; setTraits((t) => [...t, courant.current]); },
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      courant.current += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      setTraits((t) => [...t.slice(0, -1), courant.current]);
    },
    onPanResponderRelease: () => { setTraits((t) => { onChange(t, largeur.current); return t; }); },
  })).current;

  return (
    <View style={{ gap: 8 }}>
      <View ref={zone} onLayout={(e) => { largeur.current = e.nativeEvent.layout.width; }} {...pan.panHandlers}
        style={{ height: H, borderRadius: 16, backgroundColor: '#fff', borderWidth: 2, borderColor: traits.length ? c.accent : c.bord, overflow: 'hidden', ...((Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', overscrollBehavior: 'contain', cursor: 'crosshair' } : {}) as object) }}>
        <Svg ref={(r) => { if (r) svgActif = r; }} width="100%" height={H} pointerEvents="none">
          <Rect x={0} y={0} width="100%" height={H} fill="#fff" />
          {traits.map((d, i) => <Path key={i} d={d} stroke="#0b1215" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        </Svg>
        {!traits.length && <Text pointerEvents="none" style={{ position: 'absolute', alignSelf: 'center', top: H / 2 - 12, color: '#8a99a3', fontSize: 17 }}>Le client signe ici avec le doigt</Text>}
      </View>
      {traits.length > 0 && <Pressable onPress={() => maj([])} hitSlop={10}><Text style={{ color: c.gris, fontSize: 15 }}>Effacer et recommencer</Text></Pressable>}
    </View>
  );
}

// Transforme les traits en image PNG (navigateur : dessin sur canvas ; téléphone natif : capture de la zone).
export async function signatureEnImage(traits: string[], largeur: number): Promise<string | null> {
  if (!traits.length) return null;
  if (Platform.OS !== 'web') {
    if (!svgActif?.toDataURL) return null;
    return new Promise((ok) => {
      const delai = setTimeout(() => ok(null), 4000);
      svgActif.toDataURL((b64: string) => { clearTimeout(delai); ok(b64 ? `data:image/png;base64,${b64}` : null); }, { width: Math.round(largeur * 2), height: H * 2 });
    });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${H}" viewBox="0 0 ${largeur} ${H}">${traits.map((d) => `<path d="${d}" stroke="#0b1215" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
  const img = new (globalThis as any).Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const canvas = (globalThis as any).document.createElement('canvas');
  canvas.width = largeur * 2; canvas.height = H * 2;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
