'use client';
import { useEffect, useRef, useState } from 'react';

// Formulaire en étapes : une étape à la fois, boutons Retour / Suivant en bas des champs,
// récapitulatif avant de valider. Les blocs enfants portent data-etape="0", "1"…
export default function Etapes({ titres, recap, children }: {
  titres: string[]; recap: { libelle: string; champ: string; suffixe?: string; alerteSiVide?: string }[]; children: React.ReactNode;
}) {
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
        if (el instanceof HTMLSelectElement) v[r.champ] = el.value ? el.options[el.selectedIndex]?.text ?? '' : '';
        else if (/^\d{4}-\d{2}-\d{2}T/.test(el.value)) v[r.champ] = new Date(el.value).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        else v[r.champ] = el.value;
      });
      setValeurs(v);
    }
    ancre.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [etape, dernier, recap]);

  function suivant() {
    const form = ancre.current?.closest('form');
    const bloc = form?.querySelector<HTMLElement>(`[data-etape="${etape}"]`);
    const champs = Array.from(bloc?.querySelectorAll<HTMLInputElement>('input:not([type=hidden]), select, textarea') ?? []);
    for (const c of champs) if (c.offsetParent !== null && !c.checkValidity()) { c.reportValidity(); return; }
    setEtape((e) => Math.min(dernier, e + 1));
  }

  return (
    <div ref={ancre} style={{ scrollMarginTop: 12 }}>
      <div className="etapes">
        {titres.map((t, i) => (
          <button type="button" key={t} className={i === etape ? 'actif' : i < etape ? 'fait' : ''} onClick={() => i < etape && setEtape(i)}>
            {i < etape ? '✓ ' : `${i + 1}. `}{t}
          </button>
        ))}
      </div>
      {children}
      {etape === dernier && (
        <section className="carte">
          <h2>Vérifiez avant de valider</h2>
          <div className="recap">
            {recap.filter((r) => valeurs[r.champ] || r.alerteSiVide).map((r) => (
              <div key={r.champ}><span>{r.libelle}</span>
                {valeurs[r.champ] ? <b>{valeurs[r.champ] + (r.suffixe ?? '')}</b> : <b className="retard">{r.alerteSiVide}</b>}</div>
            ))}
          </div>
        </section>
      )}
      <div className="ligne navigation-etapes">
        {etape > 0 ? <button type="button" className="bouton" onClick={() => setEtape(etape - 1)}>← Retour</button> : <span />}
        {etape < dernier && <button type="button" className="bouton principal" onClick={suivant}>Suivant →</button>}
      </div>
      <style>{`form [data-valider] { display: ${etape === dernier ? 'flex' : 'none'} !important; }`}</style>
    </div>
  );
}
