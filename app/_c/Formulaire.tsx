'use client';
import { useRef, useState } from 'react';
import { annoncer } from './Toast';

type Resultat = { erreur?: string; message?: string } | void;

// Formulaire relié à une action serveur : erreur en français, message vert après succès,
// et pour les actions importantes une question « Vous êtes sûr ? » avant d'agir.
export default function Formulaire({ action, children, className, style, vider = false, succes = 'Enregistré', confirmer, confirmerSiVide }: {
  action: (fd: FormData) => Promise<Resultat>; children: React.ReactNode; className?: string; style?: React.CSSProperties;
  vider?: boolean; succes?: string | false; confirmer?: string;
  confirmerSiVide?: { champ: string; message: string };
}) {
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState<FormData | null>(null);
  const [question, setQuestion] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  async function executer(fd: FormData) {
    setErreur('');
    const r = await action(fd);
    if (r && r.erreur) { setErreur(r.erreur); annoncer(r.erreur, true); return; }
    const message = r && (r as { message?: string }).message;
    if (message) annoncer(message); else if (succes) annoncer(succes);
    if (vider) ref.current?.reset();
  }

  return (
    <form ref={ref} className={className} style={style} action={async (fd) => {
      // Questions « Vous êtes sûr ? » : message fixe, champ vide, ou alertes posées par les champs cachés _alerte…
      const messages: string[] = [];
      if (confirmer) messages.push(confirmer);
      fd.forEach((v, k) => { if (k.startsWith('_alerte') && String(v).trim()) messages.push(String(v)); });
      if (confirmerSiVide && !String(fd.get(confirmerSiVide.champ) ?? '').trim()) messages.push(confirmerSiVide.message);
      if (messages.length) { setQuestion(messages.join('\n')); setAttente(fd); return; }
      await executer(fd);
    }}>
      {children}
      {attente && (
        <div className="fenetre-fond" onClick={() => setAttente(null)}>
          <div className="fenetre" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="fenetre-icone">!</div>
            {question.split('\n').map((q, i) => <p key={i} style={{ margin: '4px 0' }}>{q}</p>)}
            <div className="fenetre-boutons">
              <button type="button" className="bouton" autoFocus onClick={() => setAttente(null)}>Non, revenir</button>
              <button type="button" className="bouton principal" onClick={async () => { const fd = attente; setAttente(null); await executer(fd); }}>Oui, continuer</button>
            </div>
          </div>
        </div>
      )}
      {erreur && <p className="erreur pleine" style={{ margin: 0 }}>{erreur}</p>}
    </form>
  );
}
