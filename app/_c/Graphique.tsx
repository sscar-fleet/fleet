import { euros } from '@/lib/format';
import type { Periode } from '@/lib/pilotage';

// Recettes et coûts par période, en barres groupées sur un seul axe (euros).
// Couleurs validées pour le fond sombre et les daltoniens : recettes sarcelle, coûts violet.
export const RECETTES = '#0d9488';
export const COUTS = '#8b5cf6';

export default function Graphique({ periodes, selection, lien, hauteur = 220 }: {
  periodes: Periode[]; selection?: number; lien?: (i: number) => string; hauteur?: number;
}) {
  const L = 900; const H = hauteur; const bas = 26; const haut = 18; const gauche = 54;
  const max = Math.max(1, ...periodes.flatMap((p) => [p.recettes, p.couts]));
  const pas = Math.pow(10, Math.floor(Math.log10(max)));
  const plafond = Math.ceil(max / pas) * pas;
  const y = (v: number) => H - bas - ((H - bas - haut) * v) / plafond;
  const largeurGroupe = (L - gauche) / periodes.length;
  const barre = Math.max(3, Math.min(18, largeurGroupe * 0.32));
  const graduations = [0, plafond / 2, plafond];
  const etiquette = (i: number) => periodes.length <= 12 || i % Math.ceil(periodes.length / 10) === 0 || i === periodes.length - 1;

  return (
    <div className="graphique">
      <div className="legende" style={{ marginBottom: 6 }}>
        <span><i style={{ background: RECETTES }} />Recettes</span>
        <span><i style={{ background: COUTS }} />Coûts</span>
      </div>
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Recettes et coûts par période" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {graduations.map((g) => (
          <g key={g}>
            <line x1={gauche} x2={L} y1={y(g)} y2={y(g)} stroke="var(--bord)" strokeWidth={1} />
            <text x={gauche - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="var(--gris)">{Math.round(g).toLocaleString('fr-FR')} €</text>
          </g>
        ))}
        {periodes.map((p, i) => {
          const x0 = gauche + i * largeurGroupe + largeurGroupe / 2;
          const actif = selection === i;
          const contenu = (
            <g>
              <title>{`${p.libelle}\nRecettes : ${euros(p.recettes)}\nCoûts : ${euros(p.couts)}\nRésultat : ${euros(p.resultat)}`}</title>
              <rect x={gauche + i * largeurGroupe} y={haut - 10} width={largeurGroupe} height={H - bas - haut + 10} fill={actif ? 'rgba(255,255,255,.05)' : 'transparent'} rx={6} />
              <path d={barrePath(x0 - barre - 1, y(p.recettes), barre, H - bas - y(p.recettes))} fill={RECETTES} />
              <path d={barrePath(x0 + 1, y(p.couts), barre, H - bas - y(p.couts))} fill={COUTS} />
              {actif && <text x={x0} y={Math.min(y(p.recettes), y(p.couts)) - 6} textAnchor="middle" fontSize={12} fontWeight={700}
                fill={p.resultat >= 0 ? 'var(--vert)' : 'var(--rouge)'}>{p.resultat >= 0 ? '+' : ''}{Math.round(p.resultat).toLocaleString('fr-FR')} €</text>}
              {etiquette(i) && <text x={x0} y={H - 8} textAnchor="middle" fontSize={11} fill={actif ? 'var(--texte)' : 'var(--gris)'}>{p.libelle}</text>}
            </g>
          );
          return lien ? <a key={i} href={lien(i)}>{contenu}</a> : <g key={i}>{contenu}</g>;
        })}
      </svg>
    </div>
  );
}

// Barre arrondie en haut (4 px), posée sur la ligne de base
function barrePath(x: number, y: number, w: number, h: number) {
  if (h <= 0.5) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
