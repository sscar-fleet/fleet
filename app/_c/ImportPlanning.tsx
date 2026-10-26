'use client';
// Planning d'un donneur d'ordre (Amazon…) collé ou pris en capture : l'IA en sort les tournées, on vérifie, on crée
import { useState } from 'react';
import { annoncer } from './Toast';

type Lue = { jour: string; debut: string; fin: string; nombre: number; donneur: string | null; depot: string | null };
async function reduire(f: File): Promise<string> {
  const img = await createImageBitmap(f);
  const k = Math.min(1, 1800 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
const jourFr = (j: string) => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function ImportPlanning({ lundi, lire, creer }: {
  lundi: string;
  lire: (lundi: string, texte: string, image: string | null) => Promise<{ tournees?: Lue[]; erreur?: string }>;
  creer: (lundi: string, lues: Lue[]) => Promise<{ erreur?: string; message?: string } | void>;
}) {
  const [texte, setTexte] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [lues, setLues] = useState<Lue[] | null>(null);
  const [attente, setAttente] = useState(false);
  const total = (lues ?? []).reduce((x, l) => x + l.nombre, 0);

  async function lancer() {
    setAttente(true);
    const r = await lire(lundi, texte, image);
    setAttente(false);
    if (r.erreur) return annoncer(r.erreur, true);
    setLues(r.tournees ?? []);
  }
  async function valider() {
    if (!lues) return;
    setAttente(true);
    const r = await creer(lundi, lues);
    setAttente(false);
    if (r && r.erreur) return annoncer(r.erreur, true);
    annoncer((r && r.message) || 'Tournées ajoutées');
    setLues(null); setTexte(''); setImage(null);
  }

  return (
    <div className="import-planning">
      {!lues ? <>
        <p className="gris" style={{ marginTop: 0, fontSize: 13.5 }}>Collez le planning reçu (Amazon, UPS…) ou prenez-le en capture d&apos;écran : Fleet AI en sort les tournées de la semaine. Vous vérifiez avant de créer.</p>
        <textarea rows={5} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Collez ici le planning de la semaine…" style={{ width: '100%' }} />
        <div className="ligne" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <label className="bouton petit" style={{ cursor: 'pointer' }}>
            {image ? 'Capture ajoutée ✓' : 'Ajouter une capture'}
            <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await reduire(f)); }} />
          </label>
          <button type="button" className="bouton principal" disabled={attente || (!texte.trim() && !image)} onClick={lancer}>{attente ? 'Lecture…' : 'Lire le planning'}</button>
        </div>
      </> : <>
        <p style={{ marginTop: 0 }}><b>{total} tournée{total > 1 ? 's' : ''}</b> trouvée{total > 1 ? 's' : ''}. Retirez ce qui ne va pas, puis créez.</p>
        <div className="lues">
          {lues.map((l, i) => (
            <div key={i} className="fichier">
              <span><b>{jourFr(l.jour)}</b> · {l.debut}–{l.fin} · {l.nombre} tournée{l.nombre > 1 ? 's' : ''}{l.donneur ? ` · ${l.donneur}` : ''}{l.depot ? ` · ${l.depot}` : ''}</span>
              <button type="button" className="bouton petit" onClick={() => setLues(lues.filter((_, k) => k !== i))}>Retirer</button>
            </div>
          ))}
        </div>
        <div className="ligne" style={{ gap: 8, marginTop: 10 }}>
          <button type="button" className="bouton principal" disabled={attente || !total} onClick={valider}>{attente ? 'Création…' : `Créer ces ${total} tournées`}</button>
          <button type="button" className="bouton" onClick={() => setLues(null)}>Annuler</button>
        </div>
      </>}
    </div>
  );
}
