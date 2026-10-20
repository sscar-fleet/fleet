'use client';
// Bouton d'ajout en haut à droite : ouvre (ou referme) le formulaire de la page, sans bloc vide quand il est fermé
export default function OuvrirFormulaire({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" className="bouton principal" onClick={() => {
      const d = document.querySelector<HTMLDetailsElement>('details.formulaire-haut');
      if (!d) return;
      d.open = !d.open;
      if (d.open) { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => d.querySelector<HTMLInputElement>('input:not([type=hidden]):not([type=file]), select')?.focus(), 250); }
    }}>{children}</button>
  );
}
