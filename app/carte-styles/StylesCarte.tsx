'use client';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'leaflet/dist/leaflet.css';

type Style = { nom: string; note: string; vecteur?: string; tuiles?: string; attr?: string };
const STYLES: Style[] = [
  { nom: 'A · Liberty', note: 'Coloré et lisible, proche de Google Maps, bâtiments en relief au zoom. Gratuit (OpenFreeMap).', vecteur: 'https://tiles.openfreemap.org/styles/liberty' },
  { nom: 'B · Bright', note: 'Plus contrasté, routes très visibles. Gratuit (OpenFreeMap).', vecteur: 'https://tiles.openfreemap.org/styles/bright' },
  { nom: 'C · Positron', note: 'Très épuré, gris clair : les véhicules ressortent. Gratuit (OpenFreeMap).', vecteur: 'https://tiles.openfreemap.org/styles/positron' },
  { nom: 'D · Nuit', note: 'Sombre, pour le mode nuit de l’appli. Gratuit (OpenFreeMap).', vecteur: 'https://tiles.openfreemap.org/styles/fiord' },
  { nom: 'E · Satellite', note: 'Vue satellite, pour retrouver un véhicule dans un parking. Gratuit (Esri).', tuiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, Maxar' },
  { nom: 'Actuelle', note: 'La carte d’aujourd’hui (OpenStreetMap brut).', tuiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap' },
];
const POS: [number, number] = [48.844983, 2.300712];

function Carte({ s }: { s: Style }) {
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let carte: any; let annule = false;
    (async () => {
      if (!boite.current) return;
      const el = document.createElement('div');
      el.className = 'suivi-repere'; el.innerHTML = '<span style="background:#19c3a6"></span><b>FZ-348-WR</b>';
      if (s.vecteur) {
        const maplibre = (await import('maplibre-gl')).default;
        if (annule) return;
        carte = new maplibre.Map({ container: boite.current, style: s.vecteur, center: [POS[1], POS[0]], zoom: 15.5, attributionControl: { compact: true } });
        carte.addControl(new maplibre.NavigationControl({ showCompass: false }), 'bottom-right');
        new maplibre.Marker({ element: el, anchor: 'left' }).setLngLat([POS[1], POS[0]]).addTo(carte);
      } else {
        const L = (await import('leaflet')).default;
        if (annule) return;
        carte = L.map(boite.current).setView(POS, 16);
        L.tileLayer(s.tuiles!, { maxZoom: 19, attribution: s.attr }).addTo(carte);
        L.marker(POS, { icon: L.divIcon({ className: 'suivi-repere', html: el.innerHTML, iconSize: [0, 0] }) }).addTo(carte);
      }
    })();
    return () => { annule = true; carte?.remove(); };
  }, [s]);
  return (
    <section className="carte" style={{ padding: 12, display: 'grid', gap: 8 }}>
      <div><b style={{ fontSize: 17 }}>{s.nom}</b><div className="gris" style={{ fontSize: 13.5 }}>{s.note}</div></div>
      <div ref={boite} style={{ height: 340, borderRadius: 12, overflow: 'hidden', position: 'relative' }} />
    </section>
  );
}

export default function StylesCarte() {
  return <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>{STYLES.map((s) => <Carte key={s.nom} s={s} />)}</div>;
}
