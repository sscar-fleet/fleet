'use client';
import { useEffect, useRef, useState } from 'react';

// Formulaire en étapes : on ne voit qu'une étape à la fois, avec un récapitulatif à la fin.
// Les blocs enfants portent data-etape="0", "1"… ; le dernier écran affiche le récapitulatif.
export default function Etapes({ titres, recap }: { titres: string[]; recap: { libelle: string; champ: string; suffixe?: string }[] }) {
  const [etape, setEtape] = useState(0);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const ancre = useRef<HTMLDivElement>(null);
  const dernier = titres.length - 1;

  useEffect(() => {
    const form = ancre.current?.closest('form');
    form?.querySelectorAll<HTMLElement>('[data-etape]').forEach((el) => { el.hidden = Number(el.dataset.etape) !== etape; });
    if (etape === dernier && form) {
      const v: Record<string, string> = {};
      recap.forEach((r) => {
        const el = form.elements.namedItem(r.champ) as HTMLInputElement | HTMLSelectElement | null;
        if (!el) return;
        v[r.champ] = el instanceof HTMLSelectElement ? (el.value ? el.options[el.selectedIndex]?.text ?? '' : '') : el.value.replace('T', ' à ');
      });
      setValeurs(v);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [etape, dernier, recap]);

  function suivant() {
    const form = ancre.current?.closest('form');
    const bloc = form?.querySelector<HTMLElement>(`[data-etape="${etape}"]`);
    const champs = Array.from(bloc?.querySelectorAll<HTMLInputElement>('input, select, textarea') ?? []);
    for (const c of champs) if (!c.checkValidity()) { c.reportValidity(); return; }
    setEtape((e) => Math.min(dernier, e + 1));
  }

  return (
    <div ref={ancre}>
      <div className="etapes">
        {titres.map((t, i) => <span key={t} className={i === etape ? 'actif' : i < etape ? 'fait' : ''}>{i < etape ? '✓ ' : `${i + 1}. `}{t}</span>)}
      </div>
      {etape === dernier && (
        <section className="carte">
          <h2>Vérifiez avant de valider</h2>
          <div className="recap">
            {recap.map((r) => <div key={r.champ}><span>{r.libelle}</span><b>{valeurs[r.champ] ? valeurs[r.champ] + (r.suffixe ?? '') : '—'}</b></div>)}
          </div>
        </section>
      )}
      <div className="ligne" style={{ justifyContent: 'space-between', margin: '4px 0 16px' }} data-navigation>
        {etape > 0 ? <button type="button" className="bouton" onClick={() => setEtape(etape - 1)}>← Retour</button> : <span />}
        {etape < dernier && <button type="button" className="bouton principal" onClick={suivant}>Suivant →</button>}
      </div>
      <style>{`form [data-valider] { display: ${etape === dernier ? 'inline-flex' : 'none'} !important; }`}</style>
    </div>
  );
}
