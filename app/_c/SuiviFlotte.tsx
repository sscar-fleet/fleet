'use client';
// Suivi GPS en tableau de bord : liste compacte à gauche, carte à droite, tout synchronisé.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import 'leaflet/dist/leaflet.css';
import { logoMarque } from '@/lib/logoMarque';

export type LigneSuivi = {
  id: string; immat: string; marque: string | null; modele: string | null;
  etat: 'roule' | 'arret' | 'coupe' | 'hors_ligne' | 'sans';
  vitesse: number; contact: boolean | null; lat: number | null; lng: number | null; le: string | null; km: number | null;
  client: string | null; retour: string | null; location_id: string | null; statut: string;
};
type Filtre = 'tous' | 'roule' | 'arret' | 'coupe' | 'hors_ligne';

const COULEUR = { roule: '#3b82f6', arret: '#22c55e', coupe: '#ef4444', hors_ligne: '#8a99a3', sans: '#56656e' } as const;
const LIBELLE = { roule: 'Roule', arret: 'À l’arrêt', coupe: 'Moteur coupé', hors_ligne: 'Hors ligne', sans: 'Sans traceur' } as const;
const depuis = (iso: string | null) => {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'à l’instant' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`;
};
const fmtKm = (n: number | null) => (n == null ? '—' : `${Math.round(n).toLocaleString('fr-FR')} km`);
const fmtHeure = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '');

export default function SuiviFlotte({ lignes, demo, compact = false }: { lignes: LigneSuivi[]; demo: boolean; compact?: boolean }) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [q, setQ] = useState('');
  const [choisi, setChoisi] = useState<string | null>(null);
  const [maj, setMaj] = useState(Date.now());
  const boite = useRef<HTMLDivElement>(null);
  const carte = useRef<any>(null);
  const calque = useRef<any>(null);
  const reperes = useRef<Record<string, any>>({});
  const cadre = useRef(false);

  // Actualisation toutes les 30 s
  useEffect(() => { setMaj(Date.now()); }, [lignes]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 30000);
    return () => clearInterval(t);
  }, [router]);
  const [, tic] = useState(0);
  useEffect(() => { const t = setInterval(() => tic((x) => x + 1), 5000); return () => clearInterval(t); }, []);

  const suivis = lignes.filter((l) => l.etat !== 'sans');
  const nb = (e: Filtre) => (e === 'tous' ? suivis.length : suivis.filter((l) => l.etat === e).length);
  const cherche = q.toLowerCase().replace(/[\s-]/g, '');
  const visibles = useMemo(() => suivis.filter((l) => (filtre === 'tous' || l.etat === filtre)
    && (!cherche || `${l.immat}${l.marque ?? ''}${l.modele ?? ''}${l.client ?? ''}`.toLowerCase().replace(/[\s-]/g, '').includes(cherche))), [suivis, filtre, cherche]);

  // Carte : repères colorés avec l'immatriculation, cadrage automatique une seule fois
  useEffect(() => {
    let annule = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (annule || !boite.current) return;
      if (!carte.current) {
        carte.current = L.map(boite.current, { zoomControl: false, attributionControl: true }).setView([48.8566, 2.3522], 11);
        L.control.zoom({ position: 'bottomright' }).addTo(carte.current);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'suivi-tuiles', attribution: '&copy; OpenStreetMap' }).addTo(carte.current);
        calque.current = L.layerGroup().addTo(carte.current);
      }
      calque.current.clearLayers(); reperes.current = {};
      const bornes: [number, number][] = [];
      visibles.forEach((l) => {
        if (l.lat == null || l.lng == null) return;
        const icone = L.divIcon({
          className: 'suivi-repere' + (choisi === l.id ? ' choisi' : ''),
          html: `<span style="background:${COULEUR[l.etat]}">${l.etat === 'roule' ? '<i></i>' : ''}</span><b>${l.immat.replace(/</g, '')}</b>`,
          iconSize: [0, 0],
        });
        const m = L.marker([l.lat, l.lng], { icon: icone, zIndexOffset: choisi === l.id ? 1000 : 0 }).addTo(calque.current);
        m.on('click', () => setChoisi(l.id));
        reperes.current[l.id] = m;
        bornes.push([l.lat, l.lng]);
      });
      if (bornes.length && !cadre.current) {
        cadre.current = true;
        if (bornes.length === 1) carte.current.setView(bornes[0], 14);
        else carte.current.fitBounds(bornes, { padding: [50, 50], maxZoom: 14 });
      }
    })();
    return () => { annule = true; };
  }, [visibles, choisi]);
  useEffect(() => () => { carte.current?.remove(); carte.current = null; }, []);

  function viser(l: LigneSuivi) {
    setChoisi(l.id);
    if (l.lat != null && l.lng != null && carte.current) carte.current.flyTo([l.lat, l.lng], Math.max(carte.current.getZoom(), 15), { duration: 0.6 });
  }
  const sel = suivis.find((l) => l.id === choisi);

  return (
    <div className={`suivi ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="suivi-kpis">
          {(['tous', 'roule', 'arret', 'coupe', 'hors_ligne'] as Filtre[]).map((k) => (
            <button key={k} type="button" className={`suivi-kpi ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>
              <span className="pt" style={{ background: k === 'tous' ? 'var(--turquoise)' : COULEUR[k] }} />
              <span className="lib">{k === 'tous' ? 'Suivis' : LIBELLE[k]}</span>
              <b>{nb(k)}</b>
            </button>
          ))}
          <span className="suivi-direct"><i />En direct · {depuis(new Date(maj).toISOString())}{demo ? ' · aperçu' : ''}</span>
        </div>
      )}
      <div className="suivi-corps">
        <aside className="suivi-liste">
          <input className="suivi-recherche" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Immatriculation, modèle, client…" />
          <div className="suivi-lignes">
            {visibles.map((l) => {
              const logo = logoMarque(l.marque, l.modele);
              return (
                <button key={l.id} type="button" className={`suivi-ligne ${choisi === l.id ? 'actif' : ''}`} onClick={() => viser(l)}>
                  <span className="logo">{logo ? <img src={logo} alt="" /> : null}<i style={{ background: COULEUR[l.etat] }} /></span>
                  <span className="txt">
                    <span className="l1"><b>{l.immat}</b><span className="gris">{[l.marque, l.modele].filter(Boolean).join(' ')}</span></span>
                    <span className="l2">{l.client ? <>{l.client}{l.retour ? <span className="gris"> · retour {fmtHeure(l.retour)}</span> : null}</> : <span className="gris">{l.statut === 'disponible' ? 'Disponible' : l.statut === 'maintenance' ? 'Maintenance' : 'Pas de location'}</span>}</span>
                  </span>
                  <span className="droite">
                    <span className="etat" style={{ color: COULEUR[l.etat] }}>{l.etat === 'roule' ? `${l.vitesse} km/h` : LIBELLE[l.etat]}</span>
                    <span className="gris">{depuis(l.le)}</span>
                  </span>
                </button>
              );
            })}
            {!visibles.length && <p className="gris" style={{ padding: 14, margin: 0 }}>Aucun véhicule dans ce filtre.</p>}
          </div>
        </aside>
        <div className="suivi-carte">
          <div ref={boite} className="suivi-map" />
          {sel && (
            <div className="suivi-fiche">
              <div className="t">
                <span><b>{sel.immat}</b> <span className="gris">{[sel.marque, sel.modele].filter(Boolean).join(' ')}</span></span>
                <button type="button" aria-label="Fermer" onClick={() => setChoisi(null)}>×</button>
              </div>
              <div className="g">
                <div><span>État</span><b style={{ color: COULEUR[sel.etat] }}>{sel.etat === 'roule' ? `Roule · ${sel.vitesse} km/h` : LIBELLE[sel.etat]}</b></div>
                <div><span>Dernière position</span><b>{depuis(sel.le)}</b></div>
                <div><span>Kilométrage</span><b>{fmtKm(sel.km)}</b></div>
                <div><span>Client</span><b>{sel.client ?? '—'}</b></div>
              </div>
              <div className="a">
                <a className="bouton petit principal" href={`/vehicules/${sel.id}`}>Fiche</a>
                {sel.location_id && <a className="bouton petit" href={`/locations/${sel.location_id}`}>Location</a>}
                {sel.lat != null && <a className="bouton petit" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}`}>Itinéraire</a>}
              </div>
            </div>
          )}
          {compact && (
            <div className="suivi-mini-kpis">
              {(['roule', 'arret', 'coupe', 'hors_ligne'] as const).filter((k) => nb(k) > 0).map((k) => <span key={k}><i style={{ background: COULEUR[k] }} />{nb(k)} {LIBELLE[k].toLowerCase()}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
