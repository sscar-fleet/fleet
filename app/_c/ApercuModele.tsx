'use client';
import { useEffect, useRef, useState } from 'react';

// Affiche la photo du modèle dès que la marque et le modèle sont saisis (ou lus sur la carte grise)
export default function ApercuModele() {
  const ici = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [etat, setEtat] = useState('Tapez la marque et le modèle : la photo apparaît ici.');

  useEffect(() => {
    const form = ici.current?.closest('form');
    if (!form) return;
    let minuteur: any; let derniere = '';
    const lire = () => {
      const marque = form.querySelector<HTMLInputElement>('[name="marque"]')?.value.trim() ?? '';
      const modele = form.querySelector<HTMLInputElement>('[name="modele"]')?.value.trim() ?? '';
      const cle = `${marque}|${modele}`;
      if (cle === derniere) return;
      derniere = cle;
      clearTimeout(minuteur);
      if (!marque || !modele) { setPhoto(null); setEtat('Tapez la marque et le modèle : la photo apparaît ici.'); return; }
      minuteur = setTimeout(async () => {
        setEtat('Recherche de la photo…');
        try {
          const r = await fetch(`/api/photo-modele?marque=${encodeURIComponent(marque)}&modele=${encodeURIComponent(modele)}`);
          const { photo } = await r.json();
          if (derniere !== cle) return;
          setPhoto(photo ?? null);
          setEtat(photo ? '' : 'Pas de photo trouvée pour ce modèle. Vous pourrez ajouter la vôtre.');
        } catch { setEtat('Recherche impossible pour le moment.'); }
      }, 700);
    };
    form.addEventListener('input', lire);
    const veille = setInterval(lire, 1500); // la carte grise remplit les champs sans saisie
    return () => { form.removeEventListener('input', lire); clearInterval(veille); clearTimeout(minuteur); };
  }, []);

  return (
    <div ref={ici} className="pleine apercu-modele">
      {photo ? <img src={photo} alt="Photo du modèle" /> : <div className="apercu-vide">🚗</div>}
      <span className="gris">{photo ? 'Photo du modèle (enregistrée avec le véhicule)' : etat}</span>
      <input type="hidden" name="photo_modele" value={photo ?? ''} />
    </div>
  );
}
