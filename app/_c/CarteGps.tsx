'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import 'leaflet/dist/leaflet.css';
import { ajouterFond } from '@/lib/fondCarte';

export type PointGps = {
  id: string; lat: number; lng: number; titre: string; detail?: string; lien?: string;
  etat: 'roule' | 'arret' | 'coupe' | 'hors_ligne';
};

const couleurs: Record<PointGps['etat'], string> = { roule: '#22c55e', arret: '#19f7d6', coupe: '#ef4444', hors_ligne: '#8a99a3' };

// Carte des véhicules (plan ou satellite), rafraîchie toute seule toutes les 30 secondes
export default function CarteGps({ points, hauteur = 420, rafraichir = 300 }: { points: PointGps[]; hauteur?: number; rafraichir?: number }) {
  const boite = useRef<HTMLDivElement>(null);
  const carte = useRef<any>(null);
  const calque = useRef<any>(null);
  const cadre = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!rafraichir) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, rafraichir * 1000);
    return () => clearInterval(t);
  }, [rafraichir, router]);

  useEffect(() => {
    let annule = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (annule || !boite.current) return;
      if (!carte.current) {
        carte.current = L.map(boite.current, { zoomControl: true, attributionControl: true }).setView([48.8566, 2.3522], 11);
        await ajouterFond(L, carte.current);
        calque.current = L.layerGroup().addTo(carte.current);
      }
      calque.current.clearLayers();
      const bornes: [number, number][] = [];
      points.forEach((p) => {
        const icone = L.divIcon({
          className: 'repere-gps',
          html: `<span style="background:${couleurs[p.etat]}"></span><b>${p.titre.replace(/</g, '&lt;')}</b>`,
          iconSize: [0, 0],
        });
        const m = L.marker([p.lat, p.lng], { icon: icone }).addTo(calque.current);
        const lien = p.lien ? `<br><a href="${p.lien}">Ouvrir la fiche</a>` : '';
        const route = `<br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noreferrer">Itinéraire</a>`;
        m.bindPopup(`<b>${p.titre.replace(/</g, '&lt;')}</b>${p.detail ? '<br>' + p.detail.replace(/</g, '&lt;') : ''}${lien}${route}`);
        bornes.push([p.lat, p.lng]);
      });
      // Cadrage automatique une seule fois, pour ne pas gêner si on a zoomé à la main
      if (bornes.length && !cadre.current) {
        cadre.current = true;
        if (bornes.length === 1) carte.current.setView(bornes[0], 15);
        else carte.current.fitBounds(bornes, { padding: [40, 40], maxZoom: 15 });
      }
    })();
    return () => { annule = true; };
  }, [points]);

  useEffect(() => () => { carte.current?.remove(); carte.current = null; }, []);

  return <div ref={boite} className="carte-gps" style={{ height: hauteur }} />;
}
