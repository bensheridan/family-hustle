import type { CSSProperties, ReactNode } from 'react';
import { useEffect } from 'react';
import type { Person } from '../types';
import { colourVar } from '../domain/categories';

export function Avatar({
  person,
  size = 'md',
}: {
  person: Person;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls = size === 'lg' ? 'avatar avatar--lg' : size === 'sm' ? 'avatar avatar--sm' : 'avatar';
  return (
    <span className={cls} style={{ background: colourVar(person.colour) }} aria-hidden>
      {initials(person.name)}
    </span>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1);
  return (parts[0][0] ?? '') + (parts[1][0] ?? '');
}

export function AvatarStack({ people, max = 4 }: { people: Person[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size="sm" />
      ))}
      {rest > 0 && (
        <span className="avatar avatar--sm" style={{ background: 'var(--ink-3)' }}>
          +{rest}
        </span>
      )}
    </span>
  );
}

export function PersonDot({ person }: { person: Person }) {
  return <span className="dot" style={{ background: colourVar(person.colour) }} aria-hidden />;
}

export function Chip({
  children,
  active,
  outline,
  onClick,
  style,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  outline?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  title?: string;
}) {
  const cls = ['chip', active && 'chip--on', outline && !active && 'chip--outline']
    .filter(Boolean)
    .join(' ');
  if (!onClick) {
    return (
      <span className={cls} style={style} title={title}>
        {children}
      </span>
    );
  }
  return (
    <button type="button" className={cls} style={style} onClick={onClick} aria-pressed={!!active} title={title}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/** Same as Field but for groups of buttons, where a <label> would misbehave. */
export function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  description,
  on,
  onChange,
}: {
  label: string;
  description?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" className="toggle" onClick={() => onChange(!on)} aria-pressed={on}>
      <span className="row__main">
        <span className="row__title" style={{ fontWeight: 600 }}>
          {label}
        </span>
        {description && (
          <span className="row__meta" style={{ whiteSpace: 'normal' }}>
            {description}
          </span>
        )}
      </span>
      <span className="toggle__switch" data-on={on} />
    </button>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__grab" />
        <h2 className="sheet__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty__big">{icon}</div>}
      {children}
    </div>
  );
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section__head">
      <h2 className="section__title">{title}</h2>
      {action}
    </div>
  );
}
