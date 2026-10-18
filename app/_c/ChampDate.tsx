'use client';
import { useEffect, useRef, useState } from 'react';

const heures = Array.from({ length: 36 }, (_, i) => {
  const h = 6 + Math.floor(i / 2); const m = i % 2 ? '30' : '00';
  return `${String(h).padStart(2, '0')}:${m}`;
});
const pad = (n: number) => String(n).padStart(2, '0');
const jourLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Date + heure faciles à choisir : gros champ date (calendrier visible), heure par demi-heure, raccourcis.
// Le champ caché `name` contient "AAAA-MM-JJTHH:MM" comme un champ datetime-local.
export default function ChampDate({ name, libelle, defaut, mode = 'depart', depuis }: {
  name: string; libelle: string; defaut: string; mode?: 'depart' | 'retour'; depuis?: string;
}) {
  const [jour, setJour] = useState(defaut.slice(0, 10));
  const [heure, setHeure] = useState(() => {
    const h = defaut.slice(11, 16);
    return heures.includes(h) ? h : heures.reduce((a, b) => (Math.abs(+b.replace(':', '') - +h.replace(':', '')) < Math.abs(+a.replace(':', '') - +h.replace(':', '')) ? b : a));
  });
  const cache = useRef<HTMLInputElement>(null);
  const champJour = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cache.current) return;
    cache.current.value = `${jour}T${heure}`;
    cache.current.dispatchEvent(new Event('change', { bubbles: true }));
  }, [jour, heure]);

  // Raccourcis : pour le départ par rapport à aujourd'hui, pour le retour par rapport au départ
  function decaler(jours: number, mois = 0) {
    let base = new Date();
    if (mode === 'retour' && depuis) {
      const v = (cache.current?.form?.elements.namedItem(depuis) as HTMLInputElement | null)?.value;
      if (v) { base = new Date(v); setHeure(v.slice(11, 16) || heure); }
    }
    const d = new Date(base); d.setDate(d.getDate() + jours); d.setMonth(d.getMonth() + mois);
    setJour(jourLocal(d));
  }
  const raccourcis: [string, () => void][] = mode === 'depart'
    ? [['Aujourd’hui', () => decaler(0)], ['Demain', () => decaler(1)], ['Après-demain', () => decaler(2)]]
    : [['1 jour', () => decaler(1)], ['2 jours', () => decaler(2)], ['3 jours', () => decaler(3)], ['1 semaine', () => decaler(7)], ['1 mois', () => decaler(0, 1)]];

  return (
    <div className="champ-date">
      <span className="champ-titre">{libelle}</span>
      <div className="champ-date-ligne">
        <input ref={champJour} type="date" value={jour} required onChange={(e) => setJour(e.target.value)}
          onClick={() => { try { champJour.current?.showPicker(); } catch { /* ancien navigateur */ } }} aria-label={`${libelle} : jour`} />
        <select value={heure} onChange={(e) => setHeure(e.target.value)} aria-label={`${libelle} : heure`}>
          {heures.map((h) => <option key={h} value={h}>{h.replace(':', 'h')}</option>)}
        </select>
      </div>
      <div className="raccourcis">{raccourcis.map(([t, f]) => <button key={t} type="button" onClick={f}>{t}</button>)}</div>
      <input ref={cache} type="hidden" name={name} defaultValue={defaut} />
    </div>
  );
}
