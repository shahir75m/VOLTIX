import { PASSWORD_RULES } from "../utils/passwordRules";
import "./PasswordInput.css";

// Live tick list under a new-password field. `password` is the value being typed.
// `evaluation` (optional) comes from evaluatePassword() and adds the strength meter.
export default function PasswordChecklist({ password = "", evaluation, id }) {
  const value = typeof password === "string" ? password : "";

  if (!value) {
    return (
      <p id={id} className="vx-password-hints" style={{ color: "#667085", fontSize: 12, margin: "8px 0 0" }}>
        Use {PASSWORD_RULES[0].label.toLowerCase()} with uppercase, lowercase, a number and a symbol.
      </p>
    );
  }

  return (
    <div className="vx-password-hints" id={id}>
      <ul className="vx-password-rules">
        {PASSWORD_RULES.map((rule) => {
          const passed = rule.test(value);
          return (
            <li key={rule.id} className={passed ? "passed" : "missing"}>
              <span className="vx-password-rules-mark" aria-hidden="true">
                {passed ? "✓" : "•"}
              </span>
              {rule.label}
            </li>
          );
        })}
      </ul>

      {evaluation && (
        <div className={`vx-password-strength level-${evaluation.score}`}>
          <div className="vx-password-strength-bars" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="vx-password-strength-label">{evaluation.strength || "Weak"}</span>
        </div>
      )}
    </div>
  );
}
