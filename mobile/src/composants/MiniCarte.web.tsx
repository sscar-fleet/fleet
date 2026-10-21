// Version navigateur de la carte de l'appli : carte moderne OpenFreeMap (Liberty en clair, Nuit en sombre)
// et bouton Plan / Satellite pour retrouver un véhicule dans un parking, une cité ou un terrain.
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, View, useColorScheme } from 'react-native';
import { useCouleurs } from '@/lib/theme';
import type { Point } from './MiniCarte';
export type { Point } from './MiniCarte';

const VERSION = '4.7.1';
const SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
let chargement: Promise<any> | null = null;
function maplibre(): Promise<any> {
  const w = window as any;
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  if (!chargement) chargement = new Promise((ok, ko) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.css`; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.js`;
    js.onload = () => ok(w.maplibregl); js.onerror = ko; document.head.appendChild(js);
  });
  return chargement;
}
const styleSatellite = {
  version: 8, sources: { sat: { type: 'raster', tiles: [SATELLITE], tileSize: 256, maxzoom: 19, attribution: 'Esri, Maxar' } },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
};

export default function MiniCarte({ points, hauteur = 190, zoomMax = 16, onPress, centre, interactif }: { points: Point[]; hauteur?: number; zoomMax?: number; onPress?: () => void; centre?: { lat: number; lng: number; zoom: number } | null; interactif?: boolean }) {
  const c = useCouleurs();
  const sombre = useColorScheme() !== 'light';
  const boite = useRef<any>(null);
  const carte = useRef<any>(null);
  const reperes = useRef<any[]>([]);
  const [satellite, setSatellite] = useState(false);
  // Aperçu qui mène ailleurs (onPress) : un toucher l'ouvre. Sinon on peut déplacer, zoomer et passer en satellite.
  const interactive = interactif ?? !onPress;
  const style = satellite ? styleSatellite : `https://tiles.openfreemap.org/styles/${sombre ? 'fiord' : 'liberty'}`;

  useEffect(() => {
    let annule = false;
    maplibre().then((ml) => {
      if (annule || !boite.current) return;
      if (!carte.current) {
        carte.current = new ml.Map({ container: boite.current, style, center: [2.3522, 48.8566], zoom: 11, interactive, cooperativeGestures: interactive && hauteur < 350, attributionControl: { compact: true } });
        if (interactive) carte.current.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');
      }
      reperes.current.forEach((m) => m.remove()); reperes.current = [];
      points.forEach((p) => {
        const el = document.createElement('div');
        el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:' + (p.onPress ? 'pointer' : 'default');
        const rond = p.logo
          ? `<div style="width:38px;height:38px;border-radius:19px;background:#fff;border:3px solid ${p.couleur};display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.3)"><img src="${p.logo}" style="width:24px;height:24px;object-fit:contain"/></div>`
          : `<div style="width:30px;height:30px;border-radius:15px;background:${p.couleur}40;display:flex;align-items:center;justify-content:center"><div style="width:16px;height:16px;border-radius:8px;background:${p.couleur};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div></div>`;
        el.innerHTML = rond + (p.titre ? `<div style="margin-top:1px;background:rgba(11,15,18,.85);color:#fff;font:800 11px system-ui;padding:2px 6px;border-radius:6px;white-space:nowrap">${p.titre.replace(/</g, '')}</div>` : '');
        if (p.onPress) el.addEventListener('click', (e) => { e.stopPropagation(); p.onPress!(); });
        reperes.current.push(new ml.Marker({ element: el, anchor: 'top', offset: [0, p.logo ? -19 : -15] }).setLngLat([p.lng, p.lat]).addTo(carte.current));
      });
      if (centre) carte.current.jumpTo({ center: [centre.lng, centre.lat], zoom: centre.zoom });
      else if (points.length === 1) carte.current.jumpTo({ center: [points[0].lng, points[0].lat], zoom: zoomMax });
      else if (points.length > 1) {
        const lngs = points.map((p) => p.lng), lats = points.map((p) => p.lat);
        carte.current.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 50, maxZoom: zoomMax, duration: 0 });
      }
    }).catch(() => {});
    return () => { annule = true; };
  }, [points, centre?.lat, centre?.lng, centre?.zoom]);

  useEffect(() => { carte.current?.setStyle(style); }, [satellite, sombre]);
  useEffect(() => () => { carte.current?.remove(); carte.current = null; }, []);

  if (!points.length) return null;
  const ouvrir = () => { const p = points[0]; Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`); };
  return (
    <View style={{ height: hauteur, borderRadius: 16, overflow: 'hidden', backgroundColor: c.panneau2, borderWidth: 1, borderColor: c.bord }}>
      <View ref={boite} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {!interactive && <Pressable onPress={onPress ?? ouvrir} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />}
      {interactive && points.length === 1 && (
        <Pressable onPress={ouvrir} style={({ pressed }) => ({ position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 12, height: 34, borderRadius: 10, justifyContent: 'center',
          backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ color: c.surAccent, fontWeight: '800', fontSize: 13 }}>Itinéraire</Text>
        </Pressable>
      )}
      <Pressable onPress={() => setSatellite((s) => !s)} hitSlop={6}
        style={({ pressed }) => ({ position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 34, borderRadius: 10,
          backgroundColor: satellite ? '#111' : '#fff', opacity: pressed ? 0.85 : 1, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6 })}>
        <Text style={{ fontSize: 14 }}>{satellite ? '🗺' : '🛰'}</Text>
        <Text style={{ color: satellite ? '#fff' : '#111', fontWeight: '800', fontSize: 13 }}>{satellite ? 'Plan' : 'Satellite'}</Text>
      </Pressable>
    </View>
  );
}
