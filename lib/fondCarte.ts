// Fond de carte commun au logiciel : OpenFreeMap « Liberty » en clair, « Nuit » (fiord) en sombre,
// et un bouton Plan / Satellite pour retrouver un véhicule dans un parking, une cité ou un terrain.
import 'maplibre-gl/dist/maplibre-gl.css';

export const STYLE_CLAIR = 'https://tiles.openfreemap.org/styles/liberty';
export const STYLE_SOMBRE = 'https://tiles.openfreemap.org/styles/fiord';
export const TUILES_SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const themeSombre = () => typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'clair';

export async function ajouterFond(L: any, carte: any, position: string = 'topright') {
  (window as any).L = L;
  await import('@maplibre/maplibre-gl-leaflet');
  const plan = (L as any).maplibreGL({ style: themeSombre() ? STYLE_SOMBRE : STYLE_CLAIR, attribution: '© OpenFreeMap © OpenStreetMap' });
  const satellite = L.tileLayer(TUILES_SATELLITE, { maxZoom: 19, attribution: 'Esri, Maxar' });
  const etiquettes = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
  plan.addTo(carte);
  let enSatellite = false;
  const Bouton = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('button', 'bouton-satellite');
      b.type = 'button';
      b.innerHTML = '<span>🛰</span> Satellite';
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', () => {
        enSatellite = !enSatellite;
        if (enSatellite) { carte.removeLayer(plan); satellite.addTo(carte); etiquettes.addTo(carte); }
        else { carte.removeLayer(satellite); carte.removeLayer(etiquettes); plan.addTo(carte); }
        b.innerHTML = enSatellite ? '<span>🗺</span> Plan' : '<span>🛰</span> Satellite';
        b.classList.toggle('actif', enSatellite);
      });
      return b;
    },
  });
  new Bouton({ position }).addTo(carte);
  // Changement de thème clair / sombre pendant que la carte est ouverte
  const obs = new MutationObserver(() => { try { plan.getMaplibreMap()?.setStyle(themeSombre() ? STYLE_SOMBRE : STYLE_CLAIR); } catch { /* */ } });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  carte.on('unload', () => obs.disconnect());
}
