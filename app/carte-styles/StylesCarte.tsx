'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

const STYLES = [
  { nom: 'A · Voyager', note: 'Clair et coloré, proche de Google Maps. Gratuit (CARTO).', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap &copy; CARTO' },
  { nom: 'B · Positron', note: 'Très épuré, gris clair : les véhicules ressortent. Gratuit (CARTO).', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap &copy; CARTO' },
  { nom: 'C · Dark Matter', note: 'Sombre, pour le mode nuit. Gratuit (CARTO).', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap &copy; CARTO' },
  { nom: 'D · Satellite', note: 'Vue satellite, utile pour retrouver un véhicule dans un parking. Gratuit (Esri).', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, Maxar' },
  { nom: 'Actuelle', note: 'La carte d’aujourd’hui (OpenStreetMap brut).', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap' },
];
const POS: [number, number] = [48.844983, 2.300712];

function Carte({ s }: { s: typeof STYLES[number] }) {
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let carte: any; let annule = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (annule || !boite.current) return;
      carte = L.map(boite.current).setView(POS, 16);
      L.tileLayer(s.url, { maxZoom: 19, subdomains: 'abcd', attribution: s.attr, detectRetina: false }).addTo(carte);
      const icone = L.divIcon({ className: 'suivi-repere', html: '<span style="background:#19c3a6"></span><b>FZ-348-WR</b>', iconSize: [0, 0] });
      L.marker(POS, { icon: icone }).addTo(carte);
    })();
    return () => { annule = true; carte?.remove(); };
  }, [s.url, s.attr]);
  return (
    <section className="carte" style={{ padding: 12, display: 'grid', gap: 8 }}>
      <div><b style={{ fontSize: 17 }}>{s.nom}</b><div className="gris" style={{ fontSize: 13.5 }}>{s.note}</div></div>
      <div ref={boite} style={{ height: 340, borderRadius: 12, overflow: 'hidden' }} />
    </section>
  );
}

export default function StylesCarte() {
  return <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>{STYLES.map((s) => <Carte key={s.nom} s={s} />)}</div>;
}
