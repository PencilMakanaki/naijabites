import { useId, useState } from 'react';
import './Field.css';

/** A labelled text input with a hint and an error message that screen readers announce. */
export function Field({ label, error, hint, id, trailing, ...inputProps }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label htmlFor={fieldId} className="field__label">{label}</label>
      <div className="field__wrap">
        <input id={fieldId} className="field__input" aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined} {...inputProps} />
        {trailing}
      </div>
      {hint ? <p id={`${fieldId}-hint`} className="field__hint">{hint}</p> : null}
      {error ? <p id={`${fieldId}-error`} className="field__error" role="alert">{error}</p> : null}
    </div>
  );
}

export function PasswordField(props) {
  const [visible, setVisible] = useState(false);
  return (
    <Field {...props} type={visible ? 'text' : 'password'}
      trailing={(
        <button type="button" className="field__toggle" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
          {visible ? 'Hide' : 'Show'}
        </button>
      )} />
  );
}
