// Logo blanc sur thème sombre, noir sur thème clair (avec la ligne turquoise de la charte).
// « complet » = SS CAR FLEET (pages publiques, documents) ; « fleet » = FLEET seul (dans le logiciel).
export default function Logo({ style, className, variante = 'complet' }: { style?: React.CSSProperties; className?: string; variante?: 'complet' | 'fleet' }) {
  const [blanc, noir, alt] = variante === 'fleet' ? ['/fleet-blanc.svg', '/fleet-noir.svg', 'FLEET'] : ['/logo-blanc.svg', '/logo-noir.svg', 'SS CAR FLEET'];
  return (
    <span className={`logo-double ${className ?? ''}`}>
      <img src={blanc} alt={alt} className="logo-sombre" style={style} />
      <img src={noir} alt={alt} className="logo-clair" style={style} />
    </span>
  );
}
