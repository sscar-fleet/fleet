// Historique d'une fiche : qui a fait quoi, et quand. Les 8 dernières lignes, le reste sous « Voir tout ».
import { dateHeure } from '@/lib/format';

export type LigneHistorique = { action: string; detail: string | null; created_at: string; auteur?: { nom: string | null } | null };

export const CHAMPS_HISTORIQUE = 'action, detail, created_at, auteur:utilisateurs(nom)';

function Ligne({ h }: { h: LigneHistorique }) {
  return (
    <div className="ligne-historique">
      <span><b>{h.action}</b>{h.detail ? <span className="gris"> · {h.detail}</span> : null}</span>
      <span className="gris quand">{dateHeure(h.created_at)}{h.auteur?.nom ? ` · ${h.auteur.nom.split(' ')[0]}` : ''}</span>
    </div>
  );
}

export default function Historique({ lignes, titre = 'Historique', vide = 'Rien pour l’instant.' }: { lignes: LigneHistorique[] | null | undefined; titre?: string; vide?: string }) {
  const l = lignes ?? [];
  return (
    <div className="historique">
      {titre && <h3 style={{ marginTop: 18 }}>{titre}</h3>}
      {!l.length && <p className="gris" style={{ margin: 0 }}>{vide}</p>}
      {l.slice(0, 8).map((h, i) => <Ligne key={i} h={h} />)}
      {l.length > 8 && (
        <details>
          <summary className="lien" style={{ cursor: 'pointer', fontSize: 13.5, margin: '6px 0' }}>Voir tout ({l.length})</summary>
          {l.slice(8).map((h, i) => <Ligne key={i} h={h} />)}
        </details>
      )}
    </div>
  );
}
