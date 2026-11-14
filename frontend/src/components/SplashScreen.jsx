import { useEffect, useState } from "react";
import voltixLogo from "../assets/voltix-logo.svg";
import "./SplashScreen.css";

function SplashScreen({ onFinish }) {
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    const hideTimer = setTimeout(() => {
      setHiding(true);
    }, 1200);

    const finishTimer = setTimeout(() => {
      onFinish();
    }, 1600);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div
      className={`voltix-splash ${hiding ? "hide" : ""}`}
      role="status"
      aria-label="Loading VOLTIX"
    >
      <div className="voltix-splash-content">
        <img
          src={voltixLogo}
          alt="VOLTIX"
          className="voltix-splash-logo"
        />


        <div className="voltix-splash-loader">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;