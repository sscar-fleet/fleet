'use client';
// Choix de la voiture en cartes, après les dates : les voitures déjà prises sur la période sont grisées.
// La vraie valeur reste dans le <select name="vehicule_id"> (masqué), que lisent le tarif et le récapitulatif.
import { useEffect, useRef, useState } from 'react';
import LogoMarque from './LogoMarque';

type Voiture = { id: string; marque: string | null; modele: string | null; plaque: string; prix: string | null; note: string | null; echeances?: { libelle: string; date: string }[] };

export default function ChoixVoiture({ voitures }: { voitures: Voiture[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [choisie, setChoisie] = useState('');
  const [prises, setPrises] = useState<Record<string, string>>({});
  const [fin, setFin] = useState<Date | null>(null);
  const select = () => ref.current?.closest('form')?.querySelector<HTMLSelectElement>('select[name=vehicule_id]') ?? null;

  useEffect(() => {
    const form = ref.current?.closest('form');
    const s = select();
    if (!form || !s) return;
    // Les options grisées par DispoVehicules disent quelles voitures sont prises ; on les relit après chaque changement
    const lire = () => setTimeout(() => {
      const p: Record<string, string> = {};
      Array.from(s.options).forEach((o) => { if (o.value && o.disabled) p[o.value] = (o.text.match(/déjà réservé \(n° \d+\)/) ?? ['déjà réservée'])[0]; });
      setPrises(p); setChoisie(s.value);
      const f = new Date(form.querySelector<HTMLInputElement>('[name=fin_prevue]')?.value || '');
      setFin(isNaN(f.getTime()) ? null : f);
    }, 0);
    lire();
    form.addEventListener('input', lire); form.addEventListener('change', lire);
    return () => { form.removeEventListener('input', lire); form.removeEventListener('change', lire); };
  }, []);

  function choisir(id: string) {
    const s = select(); if (!s || prises[id]) return;
    s.value = id; setChoisie(id);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const libres = voitures.filter((v) => !prises[v.id]);
  // Assurance ou contrôle technique qui expire avant la fin de la location : signalé, pas bloquant
  const papiers = (v: Voiture) => (v.echeances ?? []).filter((e) => fin && new Date(e.date + 'T23:59:59') < fin)
    .map((e) => `${e.libelle} ${new Date(e.date) < new Date() ? 'expiré' : 'expire'} le ${new Date(e.date).toLocaleDateString('fr-FR')}`);
  const occupees = voitures.filter((v) => prises[v.id]);

  return (
    <div ref={ref} className="pleine choix-voitures">
      <div className="choix-voitures-titre">Voitures libres sur ces dates <span className="gris">· {libres.length}</span></div>
      <div className="choix-voitures-grille">
        {libres.map((v) => (
          <button type="button" key={v.id} className={`choix-voiture ${choisie === v.id ? 'actif' : ''}`} onClick={() => choisir(v.id)}>
            <LogoMarque marque={v.marque} modele={v.modele} className="choix-voiture-logo" />
            <span className="choix-voiture-txt"><b>{[v.marque, v.modele].filter(Boolean).join(' ') || v.plaque}</b><span className="gris">{v.plaque}{v.prix ? ` · ${v.prix}/jour` : ''}</span>{v.note && <span className="choix-voiture-note">{v.note}</span>}{papiers(v).map((t) => <span key={t} className="choix-voiture-note">{t}</span>)}</span>
          </button>
        ))}
        {!libres.length && <p className="gris" style={{ margin: 0 }}>Aucune voiture libre sur ces dates. Changez les dates ci-dessus.</p>}
      </div>
      {occupees.length > 0 && (
        <details className="choix-voitures-prises">
          <summary className="gris">{occupees.length} voiture{occupees.length > 1 ? 's' : ''} déjà prise{occupees.length > 1 ? 's' : ''} sur ces dates</summary>
          {occupees.map((v) => <div key={v.id} className="gris">{[v.marque, v.modele].filter(Boolean).join(' ')} · {v.plaque} · {prises[v.id]}</div>)}
        </details>
      )}
    </div>
  );
}
