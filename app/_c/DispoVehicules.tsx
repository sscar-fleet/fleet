'use client';
import { useEffect, useRef } from 'react';

type Resa = { vehicule_id: string; debut: string; fin: string; numero: number };

// Liste des véhicules intelligente : selon les dates choisies, ceux déjà réservés sont signalés et grisés
export default function DispoVehicules({ reservations }: { reservations: Resa[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const select = form.querySelector<HTMLSelectElement>('select[name=vehicule_id]');
    if (!select) return;
    const bases = new Map<string, string>();
    Array.from(select.options).forEach((o) => bases.set(o.value, o.text));
    const maj = () => {
      const d = new Date((form.querySelector<HTMLInputElement>('[name=debut]')?.value) || '');
      const f = new Date((form.querySelector<HTMLInputElement>('[name=fin_prevue]')?.value) || '');
      const ok = !isNaN(d.getTime()) && !isNaN(f.getTime()) && f > d;
      Array.from(select.options).forEach((o) => {
        if (!o.value) return;
        const conflit = ok ? reservations.find((r) => r.vehicule_id === o.value && new Date(r.debut) < f && new Date(r.fin) > d) : undefined;
        o.disabled = !!conflit;
        o.text = (bases.get(o.value) ?? o.text) + (conflit ? ` · déjà réservé (n° ${conflit.numero})` : '');
      });
      if (select.selectedOptions[0]?.disabled) select.value = '';
    };
    maj();
    form.addEventListener('input', maj);
    form.addEventListener('change', maj);
    return () => { form.removeEventListener('input', maj); form.removeEventListener('change', maj); };
  }, [reservations]);
  return <span ref={ref} hidden />;
}
