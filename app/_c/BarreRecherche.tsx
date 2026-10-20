'use client';
// Barre du haut : un mot ou une plaque lance la recherche, une vraie question part à Fleet AI
export default function BarreRecherche() {
  return (
    <form action="/recherche" className="recherche" role="search" onSubmit={(e) => {
      const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
      if (q.includes('?') || q.split(/\s+/).length >= 3) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('fleet-ai', { detail: q }));
        (e.currentTarget.querySelector('input') as HTMLInputElement).value = '';
      }
    }}>
      <input name="q" type="search" placeholder="Rechercher, ou demander à Fleet AI : « qui rend une voiture demain ? »" aria-label="Rechercher ou demander à Fleet AI" />
    </form>
  );
}
