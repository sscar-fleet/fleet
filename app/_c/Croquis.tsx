// Croquis de la photo à prendre pour l'état des lieux (trait simple, zone visée en turquoise)
const T = 'currentColor';
const A = 'var(--turquoise)';

function Profil({ cote, avant }: { cote: 'gauche' | 'droit'; avant: boolean }) {
  // Voiture vue de côté ; la moitié à photographier est soulignée
  return (
    <g transform={cote === 'gauche' ? '' : 'translate(160,0) scale(-1,1)'}>
      <path d="M14 66 L22 50 Q30 40 46 38 L62 26 Q70 22 82 22 L108 22 Q120 22 128 32 L136 40 Q148 42 150 52 L150 66 Z" fill="none" stroke={T} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M64 28 L82 26 L82 40 L52 40 Z M88 26 L106 26 Q114 26 120 34 L124 40 L88 40 Z" fill="none" stroke={T} strokeWidth="1.6" />
      <circle cx="44" cy="66" r="10" fill="none" stroke={T} strokeWidth="2.2" />
      <circle cx="124" cy="66" r="10" fill="none" stroke={T} strokeWidth="2.2" />
      <rect x={avant ? 84 : 12} y="16" width="70" height="64" rx="8" fill={A} opacity=".16" stroke={A} strokeWidth="1.6" strokeDasharray="4 3" />
    </g>
  );
}

function Face({ arriere }: { arriere?: boolean }) {
  return (
    <g>
      <path d="M30 70 L30 46 Q32 36 44 32 L54 18 Q58 14 66 14 L94 14 Q102 14 106 18 L116 32 Q128 36 130 46 L130 70 Z" fill={A} fillOpacity=".12" stroke={T} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M58 20 L102 20 L110 32 L50 32 Z" fill="none" stroke={T} strokeWidth="1.6" />
      {arriere
        ? <><rect x="36" y="42" width="18" height="8" rx="2" fill="none" stroke={T} strokeWidth="1.6" /><rect x="106" y="42" width="18" height="8" rx="2" fill="none" stroke={T} strokeWidth="1.6" /><rect x="66" y="52" width="28" height="9" rx="1.5" fill="none" stroke={T} strokeWidth="1.4" /></>
        : <><ellipse cx="46" cy="45" rx="9" ry="5" fill="none" stroke={T} strokeWidth="1.6" /><ellipse cx="114" cy="45" rx="9" ry="5" fill="none" stroke={T} strokeWidth="1.6" /><rect x="62" y="48" width="36" height="10" rx="3" fill="none" stroke={T} strokeWidth="1.4" /></>}
      <rect x="32" y="70" width="14" height="8" rx="2" fill={T} /><rect x="114" y="70" width="14" height="8" rx="2" fill={T} />
    </g>
  );
}

function Roue({ libelle }: { libelle: string }) {
  return (
    <g>
      <circle cx="80" cy="46" r="30" fill={A} fillOpacity=".12" stroke={T} strokeWidth="2.4" />
      <circle cx="80" cy="46" r="16" fill="none" stroke={T} strokeWidth="2" />
      {[0, 72, 144, 216, 288].map((a) => <line key={a} x1="80" y1="46" x2={80 + 16 * Math.cos((a * Math.PI) / 180)} y2={46 + 16 * Math.sin((a * Math.PI) / 180)} stroke={T} strokeWidth="1.6" />)}
      <circle cx="80" cy="46" r="4" fill={T} />
      <text x="80" y="88" fontSize="10" fill={A} textAnchor="middle">{libelle}</text>
    </g>
  );
}

function Compteur() {
  return (
    <g>
      <rect x="18" y="16" width="124" height="60" rx="14" fill="none" stroke={T} strokeWidth="2.2" />
      <path d="M38 60 A24 24 0 0 1 86 60" fill="none" stroke={A} strokeWidth="3" />
      <line x1="62" y1="60" x2="74" y2="44" stroke={T} strokeWidth="2" />
      <rect x="92" y="30" width="38" height="14" rx="3" fill={A} fillOpacity=".2" stroke={T} strokeWidth="1.4" />
      <text x="111" y="41" fontSize="9" fill={T} textAnchor="middle">123456</text>
      <path d="M96 56 h28" stroke={T} strokeWidth="1.4" /><path d="M96 62 h18" stroke={A} strokeWidth="3" />
      <text x="80" y="90" fontSize="10" fill={A} textAnchor="middle">km · carburant · voyants</text>
    </g>
  );
}

export default function Croquis({ position }: { position: string }) {
  const contenu =
    position === 'face_avant' ? <Face />
    : position === 'face_arriere' ? <Face arriere />
    : position === 'lateral_gauche_avant' ? <Profil cote="gauche" avant />
    : position === 'lateral_gauche_arriere' ? <Profil cote="gauche" avant={false} />
    : position === 'lateral_droit_avant' ? <Profil cote="droit" avant />
    : position === 'lateral_droit_arriere' ? <Profil cote="droit" avant={false} />
    : position === 'roue_avant_gauche' ? <Roue libelle="avant gauche" />
    : position === 'roue_arriere_gauche' ? <Roue libelle="arrière gauche" />
    : position === 'roue_arriere_droite' ? <Roue libelle="arrière droite" />
    : position === 'roue_avant_droite' ? <Roue libelle="avant droite" />
    : position === 'compteur' ? <Compteur />
    : <g><text x="80" y="50" fontSize="28" fill={A} textAnchor="middle">+</text></g>;
  return <svg viewBox="0 0 160 96" className="croquis" aria-hidden="true">{contenu}</svg>;
}
