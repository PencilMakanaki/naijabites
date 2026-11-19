import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './icons.jsx';
import './Modal.css';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** An accessible pop-up: focus stays inside, Esc closes, and focus returns to where it was. */
export function Modal({ title, eyebrow, onClose, size, placement, children }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    (dialog.querySelector('[data-autofocus]') ?? dialog.querySelector(FOCUSABLE))?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={`modal__backdrop${placement === 'left' ? ' modal__backdrop--left' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeRef.current(); }}>
      <div ref={dialogRef} className={`modal${size === 'lg' ? ' modal--lg' : ''}${placement === 'left' ? ' modal--drawer' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="modal__close" onClick={() => closeRef.current()} aria-label="Close">
          <IconClose size={18} />
        </button>
        {eyebrow ? <p className="modal__eyebrow">{eyebrow}</p> : null}
        <h2 id={titleId} className="modal__title">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
