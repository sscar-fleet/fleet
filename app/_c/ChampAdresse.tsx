'use client';
import { useEffect, useRef, useState } from 'react';

// Adresse pré-remplie : « 4 rue em » propose « 4 Rue Émile Bertin 75018 Paris » (Base Adresse Nationale, gratuite)
export default function ChampAdresse({ name = 'adresse', defaut = '', libelle = 'Adresse', disabled = false }: {
  name?: string; defaut?: string; libelle?: string; disabled?: boolean;
}) {
  const [valeur, setValeur] = useState(defaut);
  const [choix, setChoix] = useState<string[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(minuteur.current), []);

  function taper(v: string) {
    setValeur(v);
    clearTimeout(minuteur.current);
    if (v.trim().length < 4) { setChoix([]); return; }
    minuteur.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(v)}&limit=5&autocomplete=1`);
        const j = await r.json();
        setChoix((j.features ?? []).map((f: any) => `${f.properties.name}, ${f.properties.postcode} ${f.properties.city}`));
        setOuvert(true);
      } catch { setChoix([]); }
    }, 250);
  }

  return (
    <label className="pleine champ-adresse">{libelle}
      <input name={name} value={valeur} onChange={(e) => taper(e.target.value)} onFocus={() => choix.length && setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)} autoComplete="off" disabled={disabled} placeholder="Tapez le début : 4 rue em…" />
      {ouvert && choix.length > 0 && (
        <span className="suggestions">
          {choix.map((c) => <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setValeur(c); setOuvert(false); }}>{c}</button>)}
        </span>
      )}
    </label>
  );
}
