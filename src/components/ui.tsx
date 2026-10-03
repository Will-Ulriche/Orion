import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  Search,
  X,
} from 'lucide-react';

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

const FOCUS =
  'focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10';

const CONTROL =
  'w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 ' +
  FOCUS;

export const inputClass = CONTROL;

export const labelClass = 'mb-1.5 block text-[12px] font-semibold text-slate-600';

// ── Card ────────────────────────────────────────────────────────

export function Card({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200/80 bg-white shadow-card',
        interactive &&
          'transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-raise',
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: any;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Icon size={18} />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold tracking-tight text-slate-800">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Buttons ────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type BtnSize = 'sm' | 'md' | 'lg';

const BTN_BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50';

const BTN_SIZE: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
};

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-brand hover:bg-brand-700 active:scale-[0.98]',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
};

export function Btn({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  return (
    <button className={cx(BTN_BASE, BTN_SIZE[size], BTN_VARIANT[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function IconBtn({
  label,
  tone = 'slate',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: 'slate' | 'brand' | 'danger';
}) {
  const tones = {
    slate: 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
    brand: 'text-brand-500 hover:bg-brand-50 hover:text-brand-700',
    danger: 'text-slate-400 hover:bg-red-50 hover:text-red-600',
  };
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ── Form controls ──────────────────────────────────────────────

export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx('block', className)}>
      <span className={labelClass}>
        {label}
        {required && <span className="ml-0.5 text-brand-600">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...props} />;
}

export function NumberInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={cx(CONTROL, 'tabular-nums', className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(CONTROL, 'cursor-pointer appearance-none pr-9', className)} {...props} />
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Rechercher…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cx(CONTROL, 'pl-9')}
      />
      {value && (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand-600' : 'bg-slate-300'
      )}
    >
      <span
        className={cx(
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}

// ── Badges ─────────────────────────────────────────────────────

export type Tone = 'slate' | 'brand' | 'emerald' | 'amber' | 'red' | 'blue' | 'violet';

export const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-200/70',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  red: 'bg-red-50 text-red-700 ring-red-100',
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
};

export function Badge({
  tone = 'slate',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// ── KPI ────────────────────────────────────────────────────────

export function Kpi({
  icon: Icon,
  label,
  value,
  tone = 'slate',
  progress,
}: {
  icon?: any;
  label: string;
  value: ReactNode;
  tone?: Tone;
  progress?: number;
}) {
  const iconTone = TONES[tone];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-800">{value}</p>
        </div>
        {Icon && (
          <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', iconTone)}>
            <Icon size={16} />
          </div>
        )}
      </div>
      {progress !== undefined && (
        <div className="h-1 w-full bg-slate-100">
          <div
            className={cx(
              'h-full rounded-r-full transition-all duration-500',
              tone === 'emerald' ? 'bg-emerald-400' : tone === 'amber' ? 'bg-amber-400' : 'bg-brand-500'
            )}
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>
      )}
    </Card>
  );
}

// ── Segmented control ──────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: any; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cx('inline-flex items-center gap-1 rounded-2xl bg-slate-100/80 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cx(
              'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all',
              active
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {o.icon && <o.icon size={15} />}
            {o.label}
            {o.count !== undefined && (
              <span
                className={cx(
                  'rounded-md px-1.5 py-px text-[10px] font-bold tabular-nums',
                  active ? 'bg-brand-50 text-brand-700' : 'bg-slate-200/80 text-slate-500'
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Feedback ───────────────────────────────────────────────────

export function Alert({
  tone = 'error',
  message,
  onClose,
  className,
}: {
  tone?: 'error' | 'success' | 'info';
  message: string;
  onClose?: () => void;
  className?: string;
}) {
  const map = {
    error: {
      wrap: 'border-red-200 bg-red-50 text-red-700',
      Icon: AlertCircle,
    },
    success: {
      wrap: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      Icon: CheckCircle2,
    },
    info: {
      wrap: 'border-brand-200 bg-brand-50 text-brand-800',
      Icon: Info,
    },
  }[tone];

  return (
    <div
      role="status"
      className={cx(
        'mb-4 flex animate-fade-in items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px]',
        map.wrap,
        className
      )}
    >
      <map.Icon size={16} className="mt-px shrink-0" />
      <span className="flex-1 leading-relaxed">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="shrink-0 rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Loader2 size={26} className="animate-spin text-brand-500" />
      {label && <p className="text-[13px] text-slate-400">{label}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: any;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-8 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
        {Icon ? <Icon size={26} className="text-slate-300" /> : <Search size={26} className="text-slate-300" />}
      </div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({
  name,
  size = 36,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const palette = [
    'bg-brand-100 text-brand-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
    'bg-rose-100 text-rose-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;

  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight',
        palette[hash % palette.length],
        className
      )}
    >
      {initials || '?'}
    </span>
  );
}

// ── Overlays ───────────────────────────────────────────────────

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  useDismiss(true, onClose);
  useScrollLock(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'my-8 w-full animate-scale-in overflow-hidden rounded-3xl bg-white shadow-raise',
          size === 'md' ? 'max-w-lg' : 'max-w-2xl'
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <h3 className="text-base font-bold tracking-tight text-slate-800">{title}</h3>
            {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
          </div>
          <IconBtn label="Fermer" onClick={onClose}>
            <X size={16} />
          </IconBtn>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useDismiss(true, onCancel);
  useScrollLock(true);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm animate-scale-in rounded-3xl bg-white p-6 shadow-raise"
      >
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertCircle size={20} />
        </div>
        <h3 className="text-base font-bold tracking-tight text-slate-800">{title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Btn onClick={onCancel}>{cancelLabel}</Btn>
          <Btn variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Table shell ────────────────────────────────────────────────

export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card', className)}>
      {children}
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cx(
        'sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 backdrop-blur',
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('px-4 py-2.5', className)}>{children}</td>;
}

/** Niveaux scolaires pr\u00e9d\u00e9finis */
const LEVEL_GROUPS: { group: string; levels: string[] }[] = [
  { group: 'Coll\u00e8ge', levels: ['6\u00e8me', '5\u00e8me', '4\u00e8me', '3\u00e8me'] },
  { group: 'Lyc\u00e9e', levels: ['Seconde', 'Premi\u00e8re', 'Terminale'] },
];

/**
 * Dropdown anim\u00e9 pour les niveaux scolaires.
 * Remplace le <select> natif qui ne peut pas \u00eatre anim\u00e9.
 */
export function LevelDropdown({
  value,
  onChange,
  placeholder = '— Choisir un niveau —',
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fermer si clic en dehors
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Fermer avec Echap
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const label = value || placeholder;
  const hasValue = Boolean(value);

  return (
    <div ref={ref} className={cx('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cx(
          'w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-[13.5px] outline-none transition-all duration-150',
          open
            ? 'border-[#4f46e5] bg-white ring-2 ring-[#4f46e5]/20'
            : 'border-slate-200 bg-slate-50 hover:border-slate-300',
          hasValue ? 'text-slate-800' : 'text-slate-400',
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={15}
          className={cx(
            'flex-shrink-0 text-slate-400 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown panel */}
      <div
        className={cx(
          'absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden max-h-56 overflow-y-auto overscroll-contain',
          'transition-all duration-200 origin-top',
          open
            ? 'opacity-100 scale-y-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-y-95 -translate-y-1 pointer-events-none',
        )}
        style={{ transformOrigin: 'top center' }}
      >
        {/* Option vide */}
        <button
          type="button"
          onClick={() => { onChange(''); setOpen(false); }}
          className={cx(
            'w-full text-left px-4 py-2.5 text-[13px] transition-colors',
            !value ? 'bg-indigo-50 text-[#4f46e5] font-semibold' : 'text-slate-400 hover:bg-slate-50',
          )}
        >
          {placeholder}
        </button>

        {/* Groupes */}
        {LEVEL_GROUPS.map(grp => (
          <div key={grp.group}>
            <div className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-t border-slate-100">
              {grp.group}
            </div>
            {grp.levels.map(lvl => (
              <button
                key={lvl}
                type="button"
                onClick={() => { onChange(lvl); setOpen(false); }}
                className={cx(
                  'w-full text-left px-4 py-2.5 text-[13.5px] transition-colors flex items-center justify-between',
                  value === lvl
                    ? 'bg-indigo-50 text-[#4f46e5] font-semibold'
                    : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                {lvl}
                {value === lvl && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4f46e5]" />
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Dropdown anim\u00e9 g\u00e9n\u00e9rique — accepte n'importe quelle liste d'options.
 * M\u00eame animation que LevelDropdown.
 */
export function AnimatedSelect({
  value,
  onChange,
  options,
  placeholder = '— Choisir —',
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label;
  const hasValue = Boolean(value);

  return (
    <div ref={ref} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cx(
          'w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-[13px] outline-none transition-all duration-150 font-medium',
          open
            ? 'border-[#4f46e5] bg-white ring-2 ring-[#4f46e5]/20'
            : 'border-slate-200 bg-white hover:border-slate-300',
          hasValue ? 'text-slate-800' : 'text-slate-400',
        )}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <ChevronDown
          size={14}
          className={cx(
            'flex-shrink-0 text-slate-400 transition-transform duration-200 ml-2',
            open && 'rotate-180',
          )}
        />
      </button>

      <div
        className={cx(
          'absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden max-h-56 overflow-y-auto overscroll-contain',
          'transition-all duration-200',
          open
            ? 'opacity-100 scale-y-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-y-95 -translate-y-1 pointer-events-none',
        )}
        style={{ transformOrigin: 'top center' }}
      >
        <button
          type="button"
          onClick={() => { onChange(''); setOpen(false); }}
          className={cx(
            'w-full text-left px-4 py-2.5 text-[13px] transition-colors border-b border-slate-50',
            !value ? 'bg-indigo-50 text-[#4f46e5] font-semibold' : 'text-slate-400 hover:bg-slate-50',
          )}
        >
          {placeholder}
        </button>
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => { onChange(opt.value); setOpen(false); }}
            className={cx(
              'w-full text-left px-4 py-2.5 text-[13px] transition-colors flex items-center justify-between',
              value === opt.value
                ? 'bg-indigo-50 text-[#4f46e5] font-semibold'
                : 'text-slate-700 hover:bg-slate-50',
            )}
          >
            {opt.label}
            {value === opt.value && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#4f46e5] flex-shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}