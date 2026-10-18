// Logo blanc sur thème sombre, noir sur thème clair (avec la ligne turquoise de la charte)
export default function Logo({ style, className }: { style?: React.CSSProperties; className?: string }) {
  return (
    <span className={`logo-double ${className ?? ''}`}>
      <img src="/logo-blanc.svg" alt="SS CAR FLEET" className="logo-sombre" style={style} />
      <img src="/logo-noir.svg" alt="SS CAR FLEET" className="logo-clair" style={style} />
    </span>
  );
}
