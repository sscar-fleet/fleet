'use client';
import { useRef, useState } from 'react';
import { annoncer } from './Toast';

type Resultat = { erreur?: string } | void;

// Formulaire relié à une action serveur : erreur en français, message vert après succès,
// et pour les actions importantes une question « Vous êtes sûr ? » avant d'agir.
export default function Formulaire({ action, children, className, style, vider = false, succes = 'Enregistré', confirmer }: {
  action: (fd: FormData) => Promise<Resultat>; children: React.ReactNode; className?: string; style?: React.CSSProperties;
  vider?: boolean; succes?: string | false; confirmer?: string;
}) {
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState<FormData | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  async function executer(fd: FormData) {
    setErreur('');
    const r = await action(fd);
    if (r && r.erreur) { setErreur(r.erreur); annoncer(r.erreur, true); return; }
    if (succes) annoncer(succes);
    if (vider) ref.current?.reset();
  }

  return (
    <form ref={ref} className={className} style={style} action={async (fd) => {
      if (confirmer && !attente) { setAttente(fd); return; }
      await executer(fd);
    }}>
      {children}
      {attente && (
        <div className="confirmation pleine">
          <span>{confirmer}</span>
          <button type="button" className="bouton petit danger" onClick={async () => { const fd = attente; setAttente(null); await executer(fd); }}>Oui, confirmer</button>
          <button type="button" className="bouton petit" onClick={() => setAttente(null)}>Non</button>
        </div>
      )}
      {erreur && <p className="erreur pleine" style={{ margin: 0 }}>{erreur}</p>}
    </form>
  );
}
