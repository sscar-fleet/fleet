'use client';
import { useEffect, useState } from 'react';

// Interrupteur jour / nuit, toujours en haut à droite
export default function BoutonTheme() {
  const [clair, setClair] = useState(false);
  useEffect(() => { setClair(document.documentElement.dataset.theme === 'clair'); }, []);
  function basculer() {
    const suivant = !clair;
    document.documentElement.dataset.theme = suivant ? 'clair' : 'sombre';
    document.cookie = `theme=${suivant ? 'clair' : 'sombre'}; path=/; max-age=31536000; samesite=lax`;
    setClair(suivant);
  }
  return (
    <button type="button" className={`interrupteur ${clair ? 'jour' : ''}`} onClick={basculer}
      aria-label={clair ? 'Passer en mode nuit' : 'Passer en mode jour'} title={clair ? 'Mode nuit' : 'Mode jour'}>
      <span className="pastille-int">{clair ? '☀' : '☾'}</span>
    </button>
  );
}
