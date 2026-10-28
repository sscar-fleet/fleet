'use client';
import { ajouterFond } from '@/lib/fondCarte';
// Suivi GPS en tableau de bord : liste compacte à gauche, carte à droite, tout synchronisé.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import 'leaflet/dist/leaflet.css';
import { logoMarque } from '@/lib/logoMarque';
import { BadgeSport, badgeSportHtml } from './LogoMarque';
import { dessusSvg, type Gabarit } from '@/lib/visuel';

export type LigneSuivi = {
  id: string; immat: string; marque: string | null; modele: string | null;
  etat: 'roule' | 'arret' | 'coupe' | 'hors_ligne' | 'sans';
  vitesse: number; contact: boolean | null; lat: number | null; lng: number | null; le: string | null; km: number | null;
  client: string | null; retour: string | null; location_id: string | null; statut: string;
  // Carte façon appli SS CAR SYSTEM : photo du modèle à l'arrêt (même adresse que la liste, zéro image en plus), icône vue de dessus en route
  photo?: string | null; teinte?: string; gabarit?: Gabarit; cap?: number | null;
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

export default function SuiviFlotte({ lignes, demo, compact = false, initial, transport = false }: { lignes: LigneSuivi[]; demo: boolean; compact?: boolean; initial?: string; transport?: boolean }) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [q, setQ] = useState('');
  const [choisi, setChoisi] = useState<string | null>(initial ?? null);
  const [maj, setMaj] = useState(Date.now());
  const boite = useRef<HTMLDivElement>(null);
  const carte = useRef<any>(null);
  const calque = useRef<any>(null);
  const reperes = useRef<Record<string, any>>({});
  const cadre = useRef(false);
  const [plein, setPlein] = useState(false);
  const bornesRef = useRef<[number, number][]>([]);

  // Plein écran (depuis l'accueil) : Échap pour revenir, la carte se recalcule à chaque changement de taille
  useEffect(() => {
    const t = setTimeout(() => {
      const c = carte.current; if (!c) return;
      c.invalidateSize();
      // En miniature, la molette fait défiler la page, pas zoomer la carte
      if (compact && !plein) c.scrollWheelZoom.disable(); else c.scrollWheelZoom.enable();
      const b = bornesRef.current;
      if (b.length > 1) c.fitBounds(b, { padding: [60, 60], maxZoom: 14 }); else if (b.length === 1) c.setView(b[0], 14);
    }, 80);
    if (!plein) return () => clearTimeout(t);
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlein(false); };
    window.addEventListener('keydown', echap);
    document.documentElement.style.overflow = 'hidden';
    return () => { clearTimeout(t); window.removeEventListener('keydown', echap); document.documentElement.style.overflow = ''; };
  }, [plein]);

  // Actualisation toutes les 30 s
  useEffect(() => { setMaj(Date.now()); }, [lignes]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 300000);
    return () => clearInterval(t);
  }, [router]);
  const [, tic] = useState(0);
  useEffect(() => { const t = setInterval(() => tic((x) => x + 1), 5000); return () => clearInterval(t); }, []);

  const suivis = lignes.filter((l) => l.etat !== 'sans');
  const nb = (e: Filtre) => (e === 'tous' ? suivis.length : suivis.filter((l) => l.etat === e).length);
  const cherche = q.toLowerCase().replace(/[\s-]/g, '');
  const visibles = useMemo(() => suivis.filter((l) => (filtre === 'tous' || l.etat === filtre)
    && (!cherche || `${l.immat}${l.marque ?? ''}${l.modele ?? ''}${l.client ?? ''}`.toLowerCase().replace(/[\s-]/g, '').includes(cherche))), [suivis, filtre, cherche]);

  // Positions fraîches toutes les 30 s (la page entière ne se recharge que toutes les 5 min) : les voitures avancent sur la carte
  const [frais, setFrais] = useState<Record<string, { lat: number | null; lng: number | null; vitesse: number; cap: number | null; le: string | null; etat: string }>>({});
  useEffect(() => {
    if (demo) return;
    const lire = () => { if (document.visibilityState !== 'visible') return;
      fetch('/api/mobile/gps', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!j?.vehicules) return;
        setFrais(Object.fromEntries(j.vehicules.map((v: any) => [v.vehicule_id, { lat: v.lat, lng: v.lng, vitesse: v.vitesse ?? 0, cap: v.cap ?? null, le: v.le, etat: v.etat }])));
      }).catch(() => {}); };
    const t = setInterval(lire, 30000);
    return () => clearInterval(t);
  }, [demo]);
  const aJour = (l: LigneSuivi): LigneSuivi => {
    const f = frais[l.id];
    if (!f || !f.le || (l.le && f.le <= l.le)) return l;
    return { ...l, lat: f.lat, lng: f.lng, vitesse: f.vitesse, cap: f.cap, le: f.le, etat: (['roule', 'arret', 'coupe', 'hors_ligne'].includes(f.etat) ? f.etat : l.etat) as LigneSuivi['etat'] };
  };

  // Carte : un seul repère par voiture, réutilisé d'une mise à jour à l'autre ; photo à l'arrêt, icône vue de dessus qui tourne en route
  const rates = useRef<Record<string, 1>>({});
  const etatCarte = useRef<{ glisseLe: number; boucle: number | null; choisi: string | null }>({ glisseLe: 0, boucle: null, choisi: null });
  etatCarte.current.choisi = choisi;
  const etiquettes = !compact || plein;
  useEffect(() => {
    let annule = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (annule || !boite.current) return;
      if (!carte.current) {
        carte.current = L.map(boite.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: !compact }).setView([48.8566, 2.3522], 11);
        L.control.zoom({ position: 'bottomright' }).addTo(carte.current);
        await ajouterFond(L, carte.current);
        calque.current = L.layerGroup().addTo(carte.current);
        carte.current.on('dragstart', () => { etatCarte.current.glisseLe = Date.now(); });
        carte.current.on('zoomend', () => sobre()); carte.current.on('zoom', () => sobre());
      }
      sobre();
      const vus: Record<string, 1> = {};
      const bornes: [number, number][] = [];
      visibles.map(aJour).forEach((l) => {
        if (l.lat == null || l.lng == null) return;
        vus[l.id] = 1;
        let r = reperes.current[l.id];
        if (!r) {
          const icone = L.divIcon({ className: 'suivi-repere', iconSize: [0, 0],
            html: '<span class="v"><span class="om"></span><span class="fl"><i></i></span><img class="ph" alt=""><span class="ic"></span></span><em></em><span class="pt"></span><b></b>' });
          const m = L.marker([l.lat, l.lng], { icon: icone }).addTo(calque.current);
          m.on('click', () => setChoisi(l.id));
          const el = m.getElement() as HTMLElement;
          r = { m, el, img: el.querySelector('.ph'), om: el.querySelector('.om'), ic: el.querySelector('.ic'), fl: el.querySelector('.fl'), et: el.querySelector('b'), lg: el.querySelector('em'), aff: [l.lat, l.lng], angle: null, p: null, recu: 0 };
          reperes.current[l.id] = r;
        }
        mettreAJour(r, l, choisi === l.id);
        bornes.push([l.lat, l.lng]);
      });
      Object.keys(reperes.current).forEach((id) => { if (!vus[id]) { reperes.current[id].m.remove(); delete reperes.current[id]; } });
      bornesRef.current = bornes;
      const cible = initial ? visibles.find((l) => l.id === initial && l.lat != null) : undefined;
      if (cible && !cadre.current) { cadre.current = true; carte.current.setView([cible.lat, cible.lng], 15); }
      if (bornes.length && !cadre.current) {
        cadre.current = true;
        if (bornes.length === 1) carte.current.setView(bornes[0], 14);
        else carte.current.fitBounds(bornes, { padding: [50, 50], maxZoom: 14 });
      }
      animer();
    })();
    return () => { annule = true; };
  }, [visibles, choisi, frais, etiquettes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (etatCarte.current.boucle) cancelAnimationFrame(etatCarte.current.boucle); carte.current?.remove(); carte.current = null; reperes.current = {}; }, []);

  // Étiquettes (plaque, modèle) : seulement quand la carte est en grand ou qu'on zoome, et toujours pour la voiture choisie
  function sobre() {
    const z = carte.current ? carte.current.getZoom() : 12;
    boite.current?.classList.toggle('sobre', !etiquettes && !(z >= 15));
    // Les voitures rapetissent quand on dézoome, pour que la carte reste lisible
    boite.current?.style.setProperty('--e', String(z >= 15 ? 1 : z >= 13.5 ? 0.85 : z >= 12 ? 0.7 : z >= 10.5 ? 0.55 : 0.45));
  }
  const roule = (l: LigneSuivi) => l.etat === 'roule' && l.vitesse >= 5;
  function mettreAJour(r: any, l: LigneSuivi, ch: boolean) {
    r.p = l; r.recu = Date.now();
    const aPhoto = !!l.photo && !rates.current[l.photo];
    const mode = aPhoto ? 'photo' : 'icone'; // la photo pour toutes les voitures ; l'icône vue de dessus seulement si la photo manque
    r.el.classList.toggle('m-photo', mode === 'photo'); r.el.classList.toggle('m-icone', mode === 'icone'); r.el.classList.toggle('m-roule', roule(l)); r.el.classList.toggle('choisi', ch);
    r.m.setZIndexOffset(ch ? 1000 : 0);
    const et = `${l.immat.replace(/</g, '')}${badgeSportHtml(l.marque, l.modele)}${l.modele ? ` <i>${l.modele.replace(/</g, '')}</i>` : ''}`;
    if (r.etq !== et) { r.etq = et; r.et.innerHTML = et; }
    const svg = `${l.gabarit ?? 'citadine'}${l.teinte ?? ''}`;
    if (r.svg !== svg) { r.svg = svg; r.ic.innerHTML = dessusSvg(l.gabarit ?? 'citadine', l.teinte); }
    if (l.cap != null) { const a = r.angle ?? l.cap; r.angle = a + ((((l.cap - a) % 360) + 540) % 360) - 180; r.ic.style.transform = `rotate(${r.angle}deg)`; r.fl.style.transform = `rotate(${r.angle}deg)`; }
    if (aPhoto && r.img.getAttribute('data-src') !== l.photo) {
      const src = l.photo!;
      r.img.className = 'ph'; r.img.setAttribute('data-src', src);
      const ok = () => { r.img.className = 'ph ok'; r.om.className = 'om vu'; };
      r.img.addEventListener('load', ok, { once: true });
      r.img.addEventListener('error', () => { rates.current[src] = 1; r.img.removeAttribute('src'); mettreAJour(r, r.p, etatCarte.current.choisi === r.p.id); }, { once: true });
      r.img.src = src;
      if (r.img.complete && r.img.naturalWidth > 0) ok(); // déjà dans le cache du navigateur
    }
  }
  // Position estimée entre deux relevés (6 s au plus, au-dessus de 8 km/h), lissage ≈ 0,35 s ; une seule boucle, arrêtée quand rien ne bouge
  function cibleDe(r: any, maintenant: number): [number, number] {
    const l: LigneSuivi = r.p;
    if (!roule(l) || l.vitesse <= 8 || l.cap == null || l.lat == null || l.lng == null) return [l.lat!, l.lng!];
    let t0 = l.le ? Date.parse(l.le) : r.recu; if (!isFinite(t0)) t0 = r.recu;
    const dt = Math.max(0, Math.min(6, (maintenant - t0) / 1000)), d = (l.vitesse / 3.6) * dt, rad = Math.PI / 180;
    return [l.lat + (d * Math.cos(l.cap * rad)) / 111320, l.lng + (d * Math.sin(l.cap * rad)) / (111320 * Math.cos(l.lat * rad))];
  }
  function animer() {
    if (etatCarte.current.boucle) return;
    let dernier = performance.now();
    const pas = (t: number) => {
      const dtf = Math.min(0.1, (t - dernier) / 1000); dernier = t;
      const k = 1 - Math.exp(-dtf / 0.35), maintenant = Date.now(); let bouge = false;
      Object.values(reperes.current).forEach((r: any) => {
        if (!r.p) return;
        const c = cibleDe(r, maintenant), dy = c[0] - r.aff[0], dx = c[1] - r.aff[1];
        if (Math.abs(dx) > 1e-7 || Math.abs(dy) > 1e-7) { r.aff = [r.aff[0] + dy * k, r.aff[1] + dx * k]; r.m.setLatLng(r.aff); bouge = true; }
        if (roule(r.p) && r.p.vitesse > 8) bouge = true;
      });
      // La carte suit la voiture choisie quand elle roule, sauf si on vient de la faire glisser
      const ch = etatCarte.current.choisi && reperes.current[etatCarte.current.choisi];
      if (ch && ch.p && roule(ch.p) && Date.now() - etatCarte.current.glisseLe > 15000 && carte.current) carte.current.panTo(ch.aff, { animate: false });
      etatCarte.current.boucle = bouge ? requestAnimationFrame(pas) : null;
    };
    etatCarte.current.boucle = requestAnimationFrame(pas);
  }

  function viser(l: LigneSuivi) {
    setChoisi(l.id);
    if (l.lat != null && l.lng != null && carte.current) carte.current.flyTo([l.lat, l.lng], Math.max(carte.current.getZoom(), 15), { duration: 0.6 });
  }
  const sel = suivis.find((l) => l.id === choisi);

  return (
    <div className={`suivi ${compact && !plein ? 'compact' : ''} ${plein ? 'plein' : ''}`}>
      {(
        <div className="suivi-kpis">
          {(['tous', 'roule', 'arret', 'coupe', 'hors_ligne'] as Filtre[]).map((k) => (
            <button key={k} type="button" className={`suivi-kpi ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>
              <span className="pt" style={{ background: k === 'tous' ? 'var(--turquoise)' : COULEUR[k] }} />
              <span className="lib">{k === 'tous' ? 'Suivis' : LIBELLE[k]}</span>
              <b>{nb(k)}</b>
            </button>
          ))}
          <span className="suivi-direct"><i />En direct · {depuis(new Date(maj).toISOString())}{demo ? ' · aperçu' : ''}</span>
          {compact && (
            <button type="button" className="suivi-zoom" onClick={() => setPlein((v) => !v)} aria-label={plein ? 'Réduire' : 'Agrandir'} title={plein ? 'Réduire (Échap)' : 'Agrandir en plein écran'}>
              {plein
                ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
                : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>}
              <span>{plein ? 'Réduire' : 'Agrandir'}</span>
            </button>
          )}
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
                  <span className="logo">{logo ? <img src={logo} alt="" onError={(e) => e.currentTarget.remove()} /> : null}<i style={{ background: COULEUR[l.etat] }} /></span>
                  <span className="txt">
                    <span className="l1"><b>{l.immat}</b><span className="gris">{[l.marque, l.modele].filter(Boolean).join(' ')}</span><BadgeSport marque={l.marque} modele={l.modele} petit /></span>
                    <span className="l2">{l.client ? <>{l.client}{l.retour ? <span className="gris"> · retour {fmtHeure(l.retour)}</span> : null}</> : <span className="gris">{transport ? (l.statut === 'maintenance' ? 'Maintenance' : 'Pas de tournée en cours') : l.statut === 'disponible' ? 'Disponible' : l.statut === 'maintenance' ? 'Maintenance' : 'Pas de location'}</span>}</span>
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
                <span><b>{sel.immat}</b> <span className="gris">{[sel.marque, sel.modele].filter(Boolean).join(' ')}</span><BadgeSport marque={sel.marque} modele={sel.modele} petit /></span>
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
        </div>
      </div>
    </div>
  );
}
