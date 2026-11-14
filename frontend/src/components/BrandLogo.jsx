import voltixLogo from "../assets/voltix-logo.svg";
import "./BrandLogo.css";

// The VOLTIX logo. Use it in EVERY navbar / sidebar / auth header.
// size: "sm" | "md" (default) | "lg"
function BrandLogo({ size = "md", className = "" }) {
  return <img className={`voltix-brand-logo ${size} ${className}`.trim()} src={voltixLogo} alt="VOLTIX" />;
}

export default BrandLogo;
