import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Every API / validation error is shown inside `data-testid="error-message"`. */
export function ErrorMessage({ children, className }: { children: ReactNode; className?: string }) {
  if (children === null || children === undefined || children === false || children === '') return null;
  return (
    <div role="alert" data-testid="error-message" className={`alert alert-error ${className ?? ''}`}>
      {children}
    </div>
  );
}

export function Loading({ text = 'กำลังโหลด…' }: { text?: string }) {
  return (
    <p className="muted" aria-live="polite">
      {text}
    </p>
  );
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · บิตบ้าน คอมพิวเตอร์` : 'บิตบ้าน คอมพิวเตอร์';
  }, [title]);
}

export function Breadcrumb({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav aria-label="breadcrumb" className="breadcrumb">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true"> / </span>}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Product image placeholder (the shop has no photos yet). */
export function Ph({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={`ph ${className ?? ''}`} aria-hidden="true">
      {label && <span className="mono">{label}</span>}
    </div>
  );
}
