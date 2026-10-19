'use client';
import { useEffect, useRef, useState } from 'react';

export default function SignerContrat({ signer }: { signer: (image: string) => Promise<{ erreur?: string }> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dessin = useRef(false);
  const [vide, setVide] = useState(true);
  const [accepte, setAccepte] = useState(false);
  const [etat, setEtat] = useState<'' | 'envoi' | 'fait'>('');
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b0f12';
  }, []);

  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const effacer = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setVide(true); };

  async function valider() {
    setErreur(''); setEtat('envoi');
    // Image réduite pour rester légère
    const c = canvas.current!;
    const petit = document.createElement('canvas');
    petit.width = 600; petit.height = Math.round(600 * c.height / c.width);
    petit.getContext('2d')!.drawImage(c, 0, 0, petit.width, petit.height);
    const r = await signer(petit.toDataURL('image/png'));
    if (r.erreur) { setErreur(r.erreur); setEtat(''); return; }
    setEtat('fait');
  }

  if (etat === 'fait') return <p className="signer-ok">Merci, votre contrat est signé. Votre loueur a bien reçu la signature.</p>;

  return (
    <div className="signer-zone">
      <label className="signer-case"><input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} />
        J&apos;ai vérifié ma location et j&apos;accepte les conditions de location.</label>
      <p className="signer-consigne">Signez avec le doigt dans le cadre :</p>
      <canvas ref={canvas} className="signer-canvas" style={{ touchAction: 'none' }}
        onPointerDown={(e) => { dessin.current = true; const ctx = canvas.current!.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); canvas.current!.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!dessin.current) return; const ctx = canvas.current!.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setVide(false); }}
        onPointerUp={() => { dessin.current = false; }} onPointerCancel={() => { dessin.current = false; }} />
      <div className="signer-boutons">
        <button type="button" className="signer-secondaire" onClick={effacer} disabled={vide || etat === 'envoi'}>Effacer</button>
        <button type="button" className="signer-principal" onClick={valider} disabled={vide || !accepte || etat === 'envoi'}>
          {etat === 'envoi' ? 'Envoi…' : 'Signer le contrat'}</button>
      </div>
      {erreur && <p className="signer-erreur">{erreur}</p>}
    </div>
  );
}
