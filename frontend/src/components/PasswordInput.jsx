import { useState } from "react";
import "./PasswordInput.css";

function EyeIcon({ hidden }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {hidden ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s3-8 11-8 11 8 11 8-3 8-11 8S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

// Password input with a show/hide (eye) button, used by every password form.
// All props are forwarded to the input, so autoComplete / aria / onBlur keep working.
export default function PasswordInput({ id, value, onChange, onBlur, disabled, className, ...rest }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`vx-password-field ${className || ""}`.trim()}>
      <input
        {...rest}
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
      />
      <button
        type="button"
        className="vx-password-toggle"
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
      >
        <EyeIcon hidden={visible} />
      </button>
    </div>
  );
}
