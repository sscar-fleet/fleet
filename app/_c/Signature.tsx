'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavigateur } from '@/lib/supabase-navigateur';

// Signature au doigt sur le téléphone (ou à la souris)
export default function Signature({ agenceId, dossier, action, lien, libelle = 'Signature du client' }: {
  agenceId: string; dossier: string; action: (chemin: string) => Promise<{ erreur?: string } | void>; lien?: string | null; libelle?: string;
}) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const dessin = useRef(false);
  const [vide, setVide] = useState(true);
  const [etat, setEtat] = useState('');
  const [refaire, setRefaire] = useState(!lien);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#0b0f12';
  }, [refaire]);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const debut = (e: React.PointerEvent) => {
    dessin.current = true;
    const ctx = canvas.current!.getContext('2d')!;
    const [x, y] = point(e); ctx.beginPath(); ctx.moveTo(x, y);
    canvas.current!.setPointerCapture(e.pointerId);
  };
  const trace = (e: React.PointerEvent) => {
    if (!dessin.current) return;
    const ctx = canvas.current!.getContext('2d')!;
    const [x, y] = point(e); ctx.lineTo(x, y); ctx.stroke(); setVide(false);
  };
  const effacer = () => {
    const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setVide(true);
  };
  async function valider() {
    setEtat('Enregistrement…');
    try {
      const blob: Blob = await new Promise((r) => canvas.current!.toBlob((b) => r(b!), 'image/png'));
      const chemin = `${agenceId}/${dossier}/signature-${Date.now()}.png`;
      const { error } = await supabaseNavigateur().storage.from('documents').upload(chemin, blob, { contentType: 'image/png' });
      if (error) throw error;
      const r = await action(chemin);
      if (r && r.erreur) throw new Error(r.erreur);
      setEtat(''); setRefaire(false); router.refresh();
    } catch (err: any) {
      setEtat('Échec : ' + (err?.message ?? 'erreur'));
    }
  }

  if (!refaire && lien) {
    return (
      <div className="signature-faite">
        <span className="gris">{libelle}</span>
        <img src={lien} alt="Signature" />
        <button type="button" className="bouton petit" onClick={() => setRefaire(true)}>Refaire</button>
      </div>
    );
  }
  return (
    <div className="signature">
      <span className="gris">{libelle}</span>
      <canvas ref={canvas} onPointerDown={debut} onPointerMove={trace} onPointerUp={() => (dessin.current = false)} onPointerLeave={() => (dessin.current = false)} />
      <div className="ligne">
        <button type="button" className="bouton petit" onClick={effacer}>Effacer</button>
        <button type="button" className="bouton principal petit" disabled={vide} onClick={valider}>Valider la signature</button>
      </div>
      {etat && <span className={etat.startsWith('Échec') ? 'erreur' : 'gris'}>{etat}</span>}
    </div>
  );
}
