'use client';
import { useEffect, useRef, useState } from 'react';

// Rappel du véhicule et de la durée choisis, avec le prix proposé (prix par jour × jours)
export default function AideTarif() {
  const ref = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<{ voiture: string; jours: number; prixJour: number | null } | null>(null);
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const lire = () => {
      const s = form.elements.namedItem('vehicule_id') as HTMLSelectElement | null;
      const d = (form.elements.namedItem('debut') as HTMLInputElement | null)?.value;
      const f = (form.elements.namedItem('fin_prevue') as HTMLInputElement | null)?.value;
      if (!s || !s.value || !d || !f) return setInfo(null);
      const opt = s.options[s.selectedIndex];
      const jours = Math.max(1, Math.ceil((new Date(f).getTime() - new Date(d).getTime()) / 864e5));
      setInfo({ voiture: opt.dataset.nom ?? opt.text, jours, prixJour: opt.dataset.prix ? Number(opt.dataset.prix) : null });
    };
    lire();
    form.addEventListener('change', lire);
    const obs = new MutationObserver(lire);
    obs.observe(form, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
    return () => { form.removeEventListener('change', lire); obs.disconnect(); };
  }, []);
  const total = info?.prixJour ? info.prixJour * info.jours : null;
  function utiliser() {
    const champ = ref.current?.closest('form')?.elements.namedItem('prix_total') as HTMLInputElement | null;
    if (champ && total) { champ.value = String(total); champ.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  return (
    <div ref={ref} className="aide-tarif pleine">
      {info ? <>
        <span><b>{info.voiture}</b> · {info.jours} jour{info.jours > 1 ? 's' : ''}</span>
        {total ? <span>{info.prixJour} €/jour × {info.jours} = <b>{total.toLocaleString('fr-FR')} €</b> <button type="button" className="bouton petit" onClick={utiliser}>Utiliser ce prix</button></span>
          : <span className="gris">Pas de prix par jour sur ce véhicule : indiquez le prix total.</span>}
      </> : <span className="gris">Choisissez d&apos;abord le véhicule et les dates.</span>}
    </div>
  );
}
