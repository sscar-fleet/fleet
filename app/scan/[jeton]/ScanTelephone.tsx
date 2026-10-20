'use client';
// Scanner du téléphone : un cadre aux proportions du document, la photo est recadrée et nettoyée comme un vrai scan,
// puis envoyée directement sur l'ordinateur. Aucune pièce n'est obligatoire.
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type Seance = { agence_id: string; agence: string; couleur: string | null; client: string | null; pieces: Record<string, string>; expire_le: string; genre?: string } | null;
type Piece = { cle: string; titre: string; face: string; format: 'carte' | 'a4'; lire?: string };
const PIECES_CLIENT: Piece[] = [
  { cle: 'permis_path', titre: 'Permis de conduire', face: 'recto', format: 'carte', lire: 'permis' },
  { cle: 'permis_verso_path', titre: 'Permis de conduire', face: 'verso', format: 'carte' },
  { cle: 'piece_identite_path', titre: 'Pièce d’identité', face: 'recto', format: 'carte' },
  { cle: 'piece_identite_verso_path', titre: 'Pièce d’identité', face: 'verso', format: 'carte' },
  { cle: 'justificatif_domicile_path', titre: 'Justificatif de domicile', face: 'ou attestation d’hébergement', format: 'a4' },
];
// Un seul document à photographier pour les avis et la carte grise
const DOCUMENTS: Record<string, Piece> = {
  fps: { cle: 'document_path', titre: 'Avis de FPS', face: 'la page avec le montant', format: 'a4', lire: 'fps' },
  amende: { cle: 'document_path', titre: 'Avis de contravention', face: 'la page avec l’infraction', format: 'a4', lire: 'amende' },
  carte_grise: { cle: 'document_path', titre: 'Carte grise', face: 'ouverte, bien à plat', format: 'a4', lire: 'carte_grise' },
};
const SORTIE = { carte: { l: 1400, h: 883 }, a4: { l: 1240, h: 1754 } };
const nomPiece = (p: Piece) => (p.format === 'a4' ? p.titre : `${p.titre} (${p.face})`);

// Nettoyage « scan » : niveaux étirés (fond plus blanc, texte plus net), couleurs gardées
function nettoyer(ctx: CanvasRenderingContext2D, l: number, h: number) {
  const img = ctx.getImageData(0, 0, l, h); const d = img.data;
  const histo = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 16) histo[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
  const total = histo.reduce((a, b) => a + b, 0);
  let bas = 0, haut = 255, cumul = 0;
  for (let v = 0; v < 256; v++) { cumul += histo[v]; if (cumul > total * 0.02) { bas = v; break; } }
  cumul = 0;
  for (let v = 255; v >= 0; v--) { cumul += histo[v]; if (cumul > total * 0.04) { haut = v; break; } }
  const ecart = Math.max(40, haut - bas);
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, ((d[i + k] - bas) * 255) / ecart));
  ctx.putImageData(img, 0, 0);
}

export default function ScanTelephone({ jeton, seance }: { jeton: string; seance: Seance }) {
  const PIECES: Piece[] = seance?.genre && DOCUMENTS[seance.genre] ? [DOCUMENTS[seance.genre]] : PIECES_CLIENT;
  const [etape, setEtape] = useState(0);
  const [pris, setPris] = useState<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    Object.keys(seance?.pieces ?? {}).forEach((k) => (p[k] = 'deja'));
    return p;
  });
  const [apercu, setApercu] = useState<{ url: string; blob: Blob; dataUrl: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fini, setFini] = useState(false);
  const [accepte, setAccepte] = useState(false);
  const [camera, setCamera] = useState<'attente' | 'ok' | 'non'>('attente');
  const video = useRef<HTMLVideoElement>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const couleur = seance?.couleur || '#19f7d6';
  const piece = PIECES[etape];
  const enCamera = !fini && !apercu && !!piece;

  // Caméra arrière en direct
  useEffect(() => {
    if (!seance || !enCamera) return;
    let annule = false;
    (async () => {
      try {
        if (!flux.current) flux.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (annule || !video.current) return;
        video.current.srcObject = flux.current;
        await video.current.play().catch(() => {});
        setCamera('ok');
      } catch { setCamera('non'); }
    })();
    return () => { annule = true; };
  }, [seance, enCamera]);
  useEffect(() => () => flux.current?.getTracks().forEach((t) => t.stop()), []);

  // Recadre exactement ce qui est dans le cadre, à la taille du document, puis nettoie
  function produire(source: CanvasImageSource, sl: number, sh: number, zone: { x: number; y: number; l: number; h: number }) {
    const s = SORTIE[piece.format];
    const c = document.createElement('canvas'); c.width = s.l; c.height = s.h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, Math.max(0, zone.x), Math.max(0, zone.y), Math.min(sl, zone.l), Math.min(sh, zone.h), 0, 0, s.l, s.h);
    nettoyer(ctx, s.l, s.h);
    const dataUrl = c.toDataURL('image/jpeg', 0.86);
    c.toBlob((blob) => blob && setApercu({ url: URL.createObjectURL(blob), blob, dataUrl }), 'image/jpeg', 0.86);
  }

  function declencher() {
    const v = video.current, f = cadre.current;
    if (!v || !f || !v.videoWidth) return;
    // La vidéo est affichée en « cover » : on retrouve la zone du cadre dans l'image réelle
    const r = v.getBoundingClientRect(), z = f.getBoundingClientRect();
    const echelle = Math.max(r.width / v.videoWidth, r.height / v.videoHeight);
    const dx = (r.width - v.videoWidth * echelle) / 2, dy = (r.height - v.videoHeight * echelle) / 2;
    produire(v, v.videoWidth, v.videoHeight, { x: (z.left - r.left - dx) / echelle, y: (z.top - r.top - dy) / echelle, l: z.width / echelle, h: z.height / echelle });
    navigator.vibrate?.(30);
  }

  async function depuisFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const bmp = await createImageBitmap(f);
    const s = SORTIE[piece.format], ratio = s.l / s.h;
    // Centre de la photo aux proportions du document
    let l = bmp.width, h = l / ratio;
    if (h > bmp.height) { h = bmp.height; l = h * ratio; }
    produire(bmp, bmp.width, bmp.height, { x: (bmp.width - l) / 2, y: (bmp.height - h) / 2, l, h });
  }

  async function valider() {
    if (!apercu || !seance) return;
    setEnvoi(true); setErreur('');
    try {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      const chemin = `${seance.agence_id}/scans-tel/${jeton}/${piece.cle.replace('_path', '')}-${Date.now()}.jpg`;
      const { error } = await sb.storage.from('documents').upload(chemin, apercu.blob, { contentType: 'image/jpeg' });
      if (error) throw new Error(error.message.includes('row-level') ? 'Lien expiré : générez un nouveau QR code sur l’ordinateur.' : error.message);
      const { error: e2 } = await sb.rpc('scan_ajouter', { le_jeton: jeton, piece: piece.cle, chemin });
      if (e2) throw new Error(e2.message);
      if (piece.lire) fetch(`/api/scans/${jeton}/lire`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: apercu.dataUrl, genre: piece.lire }) }).catch(() => {});
      setPris((x) => ({ ...x, [piece.cle]: apercu.url }));
      setApercu(null);
      suivante(etape + 1);
    } catch (err: any) { setErreur(err.message ?? 'Envoi impossible, réessayez.'); }
    setEnvoi(false);
  }
  function suivante(i: number) {
    if (i >= PIECES.length) { setFini(true); if (!PIECES.some((p) => !pris[p.cle] && p.cle !== piece.cle)) flux.current?.getTracks().forEach((t) => t.stop()); }
    else setEtape(i);
  }

  if (!seance) return (
    <main className="scan-page"><style>{CSS}</style>
      <div className="scan-fin"><h1>Lien expiré</h1><p>Ce QR code n’est plus valable. Sur l’ordinateur, touchez à nouveau « Scanner avec le téléphone ».</p></div>
    </main>
  );

  const manquants = PIECES.filter((p) => !pris[p.cle]);
  if (fini) return (
    <main className="scan-page" style={{ ['--accent' as any]: couleur }}><style>{CSS}</style>
      <div className="scan-fin">
        {manquants.length && !accepte ? <>
          <h1>Presque fini</h1>
          <p>Ces papiers n’ont pas été pris :</p>
          <ul className="scan-manque">{manquants.map((p) => <li key={p.cle}><button onClick={() => { setFini(false); setEtape(PIECES.indexOf(p)); }}>{nomPiece(p)}<span>Prendre</span></button></li>)}</ul>
          <p className="gris">Ce n’est pas obligatoire. Êtes-vous d’accord pour terminer sans ?</p>
          <button className="scan-btn" onClick={() => { flux.current?.getTracks().forEach((t) => t.stop()); setAccepte(true); }}>Oui, terminer</button>
        </> : null}
        {(!manquants.length || accepte) && <>
          <div className="scan-ok">✓</div>
          <h1>C’est envoyé</h1>
          <p>{PIECES.length - manquants.length} papier{PIECES.length - manquants.length > 1 ? 's' : ''} sur l’ordinateur{seance.client ? `, dans la fiche de ${seance.client}` : ''}.</p>
          <p className="gris">Vous pouvez fermer cette page.</p>
        </>}
      </div>
    </main>
  );

  return (
    <main className="scan-page" style={{ ['--accent' as any]: couleur }}><style>{CSS}</style>
      <header className="scan-haut">
        <div className="scan-points">{PIECES.map((p, i) => <span key={p.cle} className={pris[p.cle] ? 'fait' : i === etape ? 'actuel' : ''} />)}</div>
        <b>{piece.titre}</b><span>{piece.face}{seance.client ? ` · ${seance.client}` : ''}</span>
      </header>

      {apercu ? (
        <section className="scan-apercu">
          <img src={apercu.url} alt="" className={`f-${piece.format}`} />
          <p>Le texte est-il bien lisible, sans reflet ?</p>
          {erreur && <p className="scan-erreur">{erreur}</p>}
          <div className="scan-actions">
            <button className="scan-btn sec" disabled={envoi} onClick={() => setApercu(null)}>Reprendre</button>
            <button className="scan-btn" disabled={envoi} onClick={valider}>{envoi ? 'Envoi…' : 'Valider'}</button>
          </div>
        </section>
      ) : (
        <section className="scan-camera">
          <video ref={video} playsInline muted autoPlay />
          <div className="scan-masque">
            <div ref={cadre} className={`scan-cadre f-${piece.format}`}><i /><i /><i /><i /></div>
            <p>{camera === 'non' ? 'Caméra indisponible : utilisez « Choisir une photo ».' : piece.format === 'a4' ? 'Placez la feuille dans le cadre' : 'Placez la carte dans le cadre, bien à plat'}</p>
          </div>
          <div className="scan-bas">
            <button className="scan-lien" onClick={() => fichier.current?.click()}>Choisir une photo</button>
            <button className="scan-declencheur" aria-label="Prendre la photo" disabled={camera !== 'ok'} onClick={declencher}><span /></button>
            <button className="scan-lien" onClick={() => suivante(etape + 1)}>Passer</button>
          </div>
          <input ref={fichier} type="file" accept="image/*" hidden onChange={depuisFichier} />
        </section>
      )}
    </main>
  );
}

const CSS = `
.scan-page{--accent:#19f7d6;position:fixed;inset:0;background:#05080a;color:#eef3f5;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;overflow:hidden}
.scan-haut{padding:calc(env(safe-area-inset-top) + 14px) 18px 12px;display:grid;gap:3px;text-align:center;z-index:2;background:linear-gradient(#05080a,#05080acc)}
.scan-haut b{font-size:20px}.scan-haut span{color:#8a99a3;font-size:14px}
.scan-points{display:flex;gap:6px;justify-content:center;margin-bottom:8px}
.scan-points span{width:28px;height:5px;border-radius:3px;background:#24313a}.scan-points span.actuel{background:var(--accent)}.scan-points span.fait{background:var(--accent);opacity:.45}
.scan-camera{position:relative;flex:1}
.scan-camera video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
.scan-masque{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding-bottom:120px}
.scan-cadre{position:relative;border-radius:14px;box-shadow:0 0 0 100vmax rgba(0,0,0,.55);outline:2px solid rgba(255,255,255,.85)}
.scan-cadre.f-carte{width:88vw;max-width:520px;aspect-ratio:85.6/54}
.scan-cadre.f-a4{height:min(62vh,120vw);aspect-ratio:210/297}
.scan-cadre i{position:absolute;width:30px;height:30px;border:4px solid var(--accent)}
.scan-cadre i:nth-child(1){top:-4px;left:-4px;border-right:0;border-bottom:0;border-top-left-radius:14px}
.scan-cadre i:nth-child(2){top:-4px;right:-4px;border-left:0;border-bottom:0;border-top-right-radius:14px}
.scan-cadre i:nth-child(3){bottom:-4px;left:-4px;border-right:0;border-top:0;border-bottom-left-radius:14px}
.scan-cadre i:nth-child(4){bottom:-4px;right:-4px;border-left:0;border-top:0;border-bottom-right-radius:14px}
.scan-masque p{position:relative;font-weight:700;font-size:15px;background:rgba(0,0,0,.55);padding:8px 14px;border-radius:99px;margin:0}
.scan-bas{position:absolute;left:0;right:0;bottom:0;padding:18px 18px calc(env(safe-area-inset-bottom) + 22px);display:flex;align-items:center;justify-content:space-between;background:linear-gradient(transparent,#05080a)}
.scan-lien{background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:99px;padding:12px 16px;font-weight:700;font-size:14px;min-width:96px}
.scan-declencheur{width:78px;height:78px;border-radius:50%;border:5px solid #fff;background:transparent;padding:5px}
.scan-declencheur span{display:block;width:100%;height:100%;border-radius:50%;background:var(--accent)}
.scan-declencheur:disabled{opacity:.4}
.scan-apercu{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:16px 18px calc(env(safe-area-inset-bottom) + 20px)}
.scan-apercu img{max-width:100%;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.6)}.scan-apercu img.f-a4{max-height:58vh}
.scan-apercu p{margin:0;color:#c9d3d9;font-weight:600}
.scan-actions{display:flex;gap:10px;width:100%;max-width:480px}
.scan-btn{flex:1;min-height:58px;border:0;border-radius:18px;background:var(--accent);color:#00140f;font-weight:800;font-size:18px;width:100%}
.scan-btn.sec{background:#182027;color:#eef3f5;border:1px solid #24313a}.scan-btn:disabled{opacity:.6}
.scan-erreur{color:#f87171!important}
.scan-fin{margin:auto;max-width:440px;padding:24px;text-align:center;display:grid;gap:12px}
.scan-fin h1{margin:0;font-size:28px}.scan-fin p{margin:0;color:#c9d3d9;font-size:16px;line-height:1.45}.scan-fin .gris{color:#8a99a3}
.scan-ok{width:96px;height:96px;margin:0 auto 6px;border-radius:50%;display:grid;place-items:center;font-size:48px;color:var(--accent);border:2px solid var(--accent);background:rgba(25,247,214,.1)}
.scan-manque{list-style:none;margin:0;padding:0;display:grid;gap:8px;text-align:left}
.scan-manque button{width:100%;display:flex;justify-content:space-between;align-items:center;background:#12181d;border:1px solid #f59e0b55;color:#eef3f5;border-radius:14px;padding:14px 16px;font-size:16px;font-weight:700}
.scan-manque button span{color:#f59e0b;font-size:14px}
`;
