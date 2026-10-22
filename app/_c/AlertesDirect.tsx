'use client';
// Alertes du boîtier à la seconde près (serveur GPS SS CAR SYSTEM) : bandeau + petit son, tant que Fleet est ouvert.
import { useEffect, useRef, useState } from 'react';

type Alerte = { id: string; libelle: string; critique: boolean; le: string | null; vehicule_id: string; immat: string };

function bip(fort: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [0, 0.25, ...(fort ? [0.5] : [])].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = fort ? 880 : 660; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
    });
  } catch { /* son bloqué par le navigateur */ }
}

export default function AlertesDirect() {
  const [liste, setListe] = useState<Alerte[]>([]);
  const vues = useRef<Set<string>>(new Set());
  const premier = useRef(true);
  useEffect(() => {
    if (window.self !== window.top) return;
    try { JSON.parse(sessionStorage.getItem('alertes-vues') || '[]').forEach((x: string) => vues.current.add(x)); } catch {}
    let arret = false; let minuteur: any;
    const lire = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const r = await fetch('/api/gps/alertes', { cache: 'no-store' }).then((x) => x.json());
          if (!r.actif) return; // serveur direct pas branché : on n'insiste pas
          const nouvelles: Alerte[] = (r.alertes ?? []).filter((a: Alerte) => !vues.current.has(a.id));
          nouvelles.forEach((a) => vues.current.add(a.id));
          try { sessionStorage.setItem('alertes-vues', JSON.stringify([...vues.current].slice(-200))); } catch {}
          if (nouvelles.length && !premier.current) { setListe((l) => [...nouvelles, ...l].slice(0, 4)); bip(nouvelles.some((a) => a.critique)); }
          premier.current = false;
        } catch {}
      }
      if (!arret) minuteur = setTimeout(lire, 10_000);
    };
    lire();
    return () => { arret = true; clearTimeout(minuteur); };
  }, []);
  if (!liste.length) return null;
  return (
    <div className="alertes-direct" role="alert">
      {liste.map((a) => (
        <div key={a.id} className={`alerte-direct ${a.critique ? 'critique' : ''}`}>
          <a href={`/vehicules/${a.vehicule_id}#suivi-gps`}><b>{a.libelle}</b> · {a.immat}<span className="gris"> · {a.le ? new Date(a.le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'à l’instant'}</span></a>
          <button type="button" aria-label="Fermer" onClick={() => setListe((l) => l.filter((x) => x.id !== a.id))}>✕</button>
        </div>
      ))}
    </div>
  );
}
