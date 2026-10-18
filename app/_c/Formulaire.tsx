'use client';
import { useRef, useState } from 'react';

type Resultat = { erreur?: string } | void;

// Formulaire relié à une action serveur : affiche l'erreur en français, vide les champs après un ajout
export default function Formulaire({ action, children, className, style, vider = false }: {
  action: (fd: FormData) => Promise<Resultat>; children: React.ReactNode; className?: string; style?: React.CSSProperties; vider?: boolean;
}) {
  const [erreur, setErreur] = useState('');
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} className={className} style={style} action={async (fd) => {
      setErreur('');
      const r = await action(fd);
      if (r && r.erreur) setErreur(r.erreur);
      else if (vider) ref.current?.reset();
    }}>
      {children}
      {erreur && <p className="erreur pleine" style={{ margin: 0 }}>{erreur}</p>}
    </form>
  );
}
