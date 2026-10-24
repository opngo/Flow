import React, { useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogPanel, DialogTitle, Menu, MenuButton, MenuItems, MenuItem,
  Listbox, ListboxButton, ListboxOptions, ListboxOption, Switch, TabGroup, TabList, Tab, TabPanels, TabPanel,
  RadioGroup, Radio, Combobox, ComboboxInput, ComboboxOptions, ComboboxOption, Popover, PopoverButton, PopoverPanel,
  Disclosure, DisclosureButton, DisclosurePanel, Transition,
} from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { ICONS, ICON_NAMES, type IconName } from '../lib/icons';
import { cn } from '../lib/utils';

/* Icon ---------------------------------------------------------------- */
export function Icon({ name, size = 16, className, strokeWidth = 1.9, style }: {
  name?: string; size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties;
}) {
  const Cmp = (ICONS[(name ?? 'Circle') as IconName] ?? ICONS.Circle) as React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  return <Cmp size={size} className={className} strokeWidth={strokeWidth} style={style} />;
}

/* Buttons -------------------------------------------------------------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'soft' | 'ghost' | 'danger' | 'tonal';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconRight?: string;
  full?: boolean;
};

export const Btn = React.forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = 'soft', size = 'md', icon, iconRight, full, className, children, ...rest }, ref,
) {
  const base = 'focusable inline-flex items-center justify-center gap-2 rounded-[12px] font-medium select-none whitespace-nowrap disabled:opacity-45 disabled:pointer-events-none';
  const sizes = { sm: 'h-8 px-3 text-[12.5px]', md: 'h-9 px-3.5 text-[13px]', lg: 'h-11 px-5 text-[14px]' };
  const variants = {
    primary: 'text-white shadow-soft',
    soft: 'bg-s2 text-ink hover:bg-s3',
    tonal: 'bg-accentsoft text-accent hover:brightness-110',
    ghost: 'text-muted hover:text-ink hover:bg-s2',
    danger: 'bg-danger/15 text-danger hover:bg-danger/25',
  };
  return (
    <button
      ref={ref}
      className={cn(base, sizes[size], variants[variant], full && 'w-full', className)}
      style={variant === 'primary' ? { background: 'var(--accent)' } : undefined}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
    </button>
  );
});

/** forwardRef matters: Headless UI clones menu/popover triggers and hands them
 *  a ref, so a plain function component would silently lose focus management. */
export const IconBtn = React.forwardRef<HTMLButtonElement, {
  icon: string; label: string; size?: number; className?: string; active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>>(function IconBtn(
  { icon, label, size = 16, className, active, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        'focusable inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted hover:text-ink hover:bg-s2',
        active && 'text-accent bg-accentsoft',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
});

/* Surfaces ------------------------------------------------------------- */
export function Panel({ className, children, raised, ...rest }: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div className={cn(raised ? 'panel-raised' : 'panel', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionHead({ title, subtitle, right, className }: { title: string; subtitle?: string; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="h2">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('divider my-3', className)} />;
}

export function Chip({ children, icon, color, className, onClick, active }: {
  children?: React.ReactNode; icon?: string; color?: string; className?: string; onClick?: () => void; active?: boolean;
}) {
  return (
    <span
      onClick={onClick}
      className={cn('chip transition-colors', onClick && 'cursor-pointer hover:bg-s3', active && 'text-accent', className)}
      style={color ? { color, background: `color-mix(in srgb, ${color} 16%, transparent)` } : undefined}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: string; icon?: string; tone?: 'accent' | 'success' | 'warning' | 'danger' }) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : tone === 'danger' ? 'var(--danger)' : 'var(--accent)';
  return (
    <div className="panel-flat p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-faint">
        {icon && <Icon name={icon} size={12} style={{ color }} />}
        {label}
      </div>
      <div className="num mt-1.5 text-[22px] font-semibold leading-none">{value}</div>
      {sub && <div className="mt-1 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

/* Form fields ---------------------------------------------------------- */
export function Field({ label, hint, children, className }: { label?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="label mb-1.5 block">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-faint">{hint}</span>}
    </label>
  );
}

/* Slider --------------------------------------------------------------- */

type SliderProps = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  /** Accessible name when the slider is not inside a SliderField. */
  label?: string;
  /** Rendered next to the label. Defaults to the raw number. */
  format?: (value: number) => string;
  disabled?: boolean;
  /** Fill the row instead of the default fixed width. */
  full?: boolean;
  className?: string;
  /** Marks drawn under the track: preset stops the user can click. */
  stops?: number[];
  /** Show the value at the right of the track. */
  showValue?: boolean;
};

const roundTo = (value: number, step: number) => {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number((Math.round(value / step) * step).toFixed(decimals + 2));
};

/**
 * A range control drawn from scratch.
 *
 * The native `input[type=range]` cannot be styled consistently across
 * platforms, and its default rendering also brings back the boxy track the
 * design rules forbid. This one is a plain div with pointer capture, keyboard
 * handling and the same ARIA contract a native slider exposes.
 */
export function Slider({
  value, min = 0, max = 1, step = 0.01, onChange, label, format, disabled, full, className, stops, showValue,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useSliderDrag();

  const clamp = (v: number) => Math.min(max, Math.max(min, roundTo(v, step)));
  const pct = max > min ? ((clamp(value) - min) / (max - min)) * 100 : 0;

  const commit = (raw: number) => {
    if (disabled) return;
    const next = clamp(raw);
    if (next !== value) onChange(next);
  };

  const fromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const t = (clientX - rect.left) / rect.width;
    commit(min + Math.min(1, Math.max(0, t)) * (max - min));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const big = (max - min) / 10;
    const jump = e.shiftKey ? step * 10 : step;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + jump;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - jump;
    else if (e.key === 'PageUp') next = value + big;
    else if (e.key === 'PageDown') next = value - big;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    commit(next);
  };

  return (
    <div className={cn('flex items-center gap-2.5', disabled && 'opacity-45', className)} style={full ? undefined : { minWidth: 0 }}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamp(value)}
        aria-valuetext={format ? format(value) : String(clamp(value))}
        aria-disabled={disabled || undefined}
        data-dragging={dragging || undefined}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragging(true);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => { if (dragging) fromPointer(e.clientX); }}
        onPointerUp={(e) => {
          setDragging(false);
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKeyDown}
        onDoubleClick={() => commit(min + (max - min) / 2)}
        className={cn('flow-slider focusable group relative flex h-7 flex-1 cursor-pointer touch-none select-none items-center', disabled && 'cursor-not-allowed')}
      >
        <div className="flow-slider-track relative h-[5px] w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
            style={{ width: `${pct}%`, background: disabled ? 'var(--text-faint)' : 'var(--accent)' }} />
        </div>
        {stops?.length ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
            {stops.map((stop) => (
              <span key={stop}
                className="absolute h-[5px] w-[5px] -translate-x-1/2 rounded-full"
                style={{
                  left: `${((stop - min) / (max - min)) * 100}%`,
                  background: stop <= clamp(value) ? 'color-mix(in srgb, var(--surface) 70%, transparent)' : 'color-mix(in srgb, var(--text-faint) 55%, transparent)',
                }} />
            ))}
          </div>
        ) : null}
        <span
          aria-hidden="true"
          className="flow-slider-thumb pointer-events-none absolute top-1/2 h-[14px] w-[14px] -translate-y-1/2 rounded-full transition-transform duration-150"
          style={{
            left: `calc(${pct}% - 7px)`,
            background: disabled ? 'var(--text-faint)' : 'var(--accent)',
            boxShadow: disabled ? 'none' : '0 2px 10px -2px color-mix(in srgb, var(--accent) 70%, transparent)',
          }}
        />
      </div>
      {showValue && (
        <span className="num w-11 shrink-0 text-right text-[11px] text-faint">{format ? format(value) : clamp(value)}</span>
      )}
    </div>
  );
}

/** Local drag state; kept out of Slider so the component stays a single hook call. */
function useSliderDrag(): [boolean, (v: boolean) => void] {
  const [dragging, setDragging] = React.useState(false);
  return [dragging, setDragging];
}

export function SliderField({
  label, value, min, max, step, onChange, format, disabled, hint, stops, className,
}: Omit<SliderProps, 'showValue'> & { hint?: string }) {
  return (
    <div className={cn('block', className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="label">{label}</span>
        <span className="num text-[11px] text-muted">{format ? format(value) : value}</span>
      </span>
      <Slider value={value} min={min} max={max} step={step} onChange={onChange} label={label} disabled={disabled} stops={stops} />
      {hint && <span className="mt-1 block text-[11.5px] text-faint">{hint}</span>}
    </div>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} {...props} className={cn('input focusable', className)} />;
  },
);

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...props }, ref) {
    return <textarea ref={ref} {...props} className={cn('input focusable resize-none', className)} />;
  },
);

export function Select<T extends string | number>({ value, onChange, options, placeholder, className }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; icon?: string }>; placeholder?: string; className?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Listbox value={value} onChange={onChange}>
      <div className={cn('relative', className)}>
        <ListboxButton className="focusable flex h-9 w-full items-center justify-between gap-2 rounded-[12px] bg-s2 px-3 text-left text-[13px] hover:bg-s3">
          <span className="flex items-center gap-2 truncate">
            {current?.icon && <Icon name={current.icon} size={14} className="text-muted" />}
            {current?.label ?? placeholder ?? 'Select'}
          </span>
          <Icon name="ChevronDown" size={14} className="shrink-0 text-faint" />
        </ListboxButton>
        <Transition
          enter="transition duration-150 ease-out" enterFrom="opacity-0 -translate-y-1" enterTo="opacity-100 translate-y-0"
          leave="transition duration-120 ease-in" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <ListboxOptions className="panel-raised absolute z-50 mt-1.5 max-h-64 w-full overflow-auto p-1.5 text-[13px]">
            {options.map((o) => (
              <ListboxOption key={String(o.value)} value={o.value} className="flex cursor-pointer items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 data-[focus]:bg-s3 data-[selected]:text-accent">
                <span className="flex items-center gap-2 truncate">
                  {o.icon && <Icon name={o.icon} size={14} />}
                  {o.label}
                </span>
                <Icon name="Check" size={13} className="opacity-0 data-[selected]:opacity-100" />
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Transition>
      </div>
    </Listbox>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {description && <div className="mt-0.5 text-[11.5px] text-muted">{description}</div>}
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        className="focusable relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? 'var(--accent)' : 'var(--surface-3)' }}
      >
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white/95 transition-[left] duration-200" style={{ left: checked ? 22 : 2 }} />
      </Switch>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; icon?: string }>; className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-[12px] bg-s2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'focusable flex h-7 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] transition-colors',
            value === o.value ? 'bg-s3 text-ink shadow-soft' : 'text-muted hover:text-ink',
          )}
        >
          {o.icon && <Icon name={o.icon} size={13} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RadioCards<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; description?: string; icon?: string }>;
}) {
  return (
    <RadioGroup value={value} onChange={onChange} className="grid gap-2">
      {options.map((o) => (
        <Radio
          key={o.value}
          value={o.value}
          className={({ checked }) => cn(
            'focusable cursor-pointer rounded-[14px] p-3 transition-all',
            checked ? 'bg-accentsoft' : 'bg-s2 hover:bg-s3',
          )}
        >
          {({ checked }) => (
            <div className="flex items-start gap-3">
              {o.icon && <Icon name={o.icon} size={16} className={checked ? 'text-accent' : 'text-muted'} />}
              <div className="flex-1">
                <div className="text-[13px] font-medium">{o.label}</div>
                {o.description && <div className="mt-0.5 text-[11.5px] text-muted">{o.description}</div>}
              </div>
              {checked && <Icon name="Check" size={15} className="mt-0.5 text-accent" />}
            </div>
          )}
        </Radio>
      ))}
    </RadioGroup>
  );
}

/* Modal ---------------------------------------------------------------- */
export function Modal({ open, onClose, title, subtitle, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <Transition show={open} as={React.Fragment}>
      <Dialog onClose={onClose} className="relative z-[80]">
        <Transition.Child
          enter="duration-200 ease-out" enterFrom="opacity-0" enterTo="opacity-100"
          leave="duration-150 ease-in" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px]" />
        </Transition.Child>
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            enter="duration-200 ease-out" enterFrom="opacity-0 scale-[0.97] translate-y-2" enterTo="opacity-100 scale-100 translate-y-0"
            leave="duration-150 ease-in" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-[0.98]"
          >
            <DialogPanel className={cn('panel-raised flex max-h-[86vh] w-full flex-col overflow-hidden', wide ? 'max-w-3xl' : 'max-w-lg')}>
              <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
                <div>
                  <DialogTitle className="h2">{title}</DialogTitle>
                  {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
                </div>
                <IconBtn icon="X" label="Close" onClick={onClose} />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
              {footer && <div className="flex items-center justify-end gap-2 bg-surface/40 px-5 py-3.5">{footer}</div>}
            </DialogPanel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: string; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={body}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Btn>
      </>}>
      <div className="text-[13px] text-muted">This action can be undone with <span className="num">Ctrl+Z</span> unless it is a destructive reset.</div>
    </Modal>
  );
}

/* Menus ---------------------------------------------------------------- */
export function MenuBtn({ trigger, items, align = 'right' }: {
  trigger: React.ReactNode;
  items: Array<{ label: string; icon?: string; onClick: () => void; danger?: boolean; separator?: boolean; checked?: boolean }>;
  align?: 'left' | 'right';
}) {
  return (
    <Menu>
      <MenuButton as={React.Fragment}>{trigger}</MenuButton>
      <Transition
        enter="transition duration-150 ease-out" enterFrom="opacity-0 scale-95 translate-y-1" enterTo="opacity-100 scale-100 translate-y-0"
        leave="transition duration-120 ease-in" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
      >
        <MenuItems className={cn('panel-raised absolute z-[70] mt-1.5 min-w-48 overflow-hidden p-1.5 text-[13px]', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((item, i) => (
            <React.Fragment key={`${item.label}-${i}`}>
              {item.separator && <div className="divider my-1" />}
              <MenuItem>
                <button
                  onClick={item.onClick}
                  className={cn('flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left data-[focus]:bg-s3',
                    item.danger ? 'text-danger' : 'text-ink')}
                >
                  {item.icon && <Icon name={item.icon} size={14} className={item.danger ? '' : 'text-muted'} />}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.checked && <Icon name="Check" size={13} className="text-accent" />}
                </button>
              </MenuItem>
            </React.Fragment>
          ))}
        </MenuItems>
      </Transition>
    </Menu>
  );
}

/* Tabs ----------------------------------------------------------------- */
export function Tabs({ tabs, panels, value, onChange, className }: {
  tabs: Array<{ id: string; label: string; icon?: string; badge?: number }>;
  panels: React.ReactNode[]; value?: string; onChange?: (id: string) => void; className?: string;
}) {
  return (
    <TabGroup selectedIndex={value ? tabs.findIndex((t) => t.id === value) : undefined}
      onChange={(i) => onChange?.(tabs[i].id)} className={className}>
      <TabList className="no-scrollbar flex gap-1 overflow-x-auto rounded-[12px] bg-s1 p-1">
        {tabs.map((t) => (
          <Tab key={t.id} className="focusable flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] text-muted transition-colors data-[selected]:bg-s3 data-[selected]:text-ink data-[hover]:text-ink">
            {t.icon && <Icon name={t.icon} size={13} />}
            {t.label}
            {t.badge != null && t.badge > 0 && <span className="num rounded-full bg-accentsoft px-1.5 text-[10px] text-accent">{t.badge}</span>}
          </Tab>
        ))}
      </TabList>
      <TabPanels className="mt-3">
        {panels.map((p, i) => <TabPanel key={i} className="focus-visible:outline-none">{p}</TabPanel>)}
      </TabPanels>
    </TabGroup>
  );
}

export function Accordion({ title, children, defaultOpen, icon }: { title: string; children: React.ReactNode; defaultOpen?: boolean; icon?: string }) {
  return (
    <Disclosure defaultOpen={defaultOpen}>
      {({ open }) => (
        <div className="rounded-[14px] bg-s1">
          <DisclosureButton className="focusable flex w-full items-center gap-2 rounded-[14px] px-3 py-2.5 text-left text-[13px] hover:bg-s2">
            <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={14} className="text-faint" />
            {icon && <Icon name={icon} size={14} className="text-muted" />}
            <span className="flex-1">{title}</span>
          </DisclosureButton>
          <Transition
            enter="transition duration-180 ease-out" enterFrom="opacity-0 -translate-y-1" enterTo="opacity-100 translate-y-0"
            leave="transition duration-120 ease-in" leaveFrom="opacity-100" leaveTo="opacity-0"
          >
            <DisclosurePanel className="px-3 pb-3 text-[13px]">{children}</DisclosurePanel>
          </Transition>
        </div>
      )}
    </Disclosure>
  );
}

export function PopoverHint({ label, children, icon = 'Info' }: { label: string; children: React.ReactNode; icon?: string }) {
  return (
    <Popover className="relative inline-flex">
      <PopoverButton className="focusable inline-flex h-6 w-6 items-center justify-center rounded-full text-faint hover:bg-s2 hover:text-ink">
        <Icon name={icon} size={13} />
      </PopoverButton>
      <Transition
        enter="transition duration-150 ease-out" enterFrom="opacity-0 translate-y-1" enterTo="opacity-100 translate-y-0"
        leave="transition duration-100 ease-in" leaveFrom="opacity-100" leaveTo="opacity-0"
      >
        <PopoverPanel className="panel-raised absolute bottom-full right-0 z-50 mb-2 w-64 p-3 text-[12px]">
          <div className="label mb-1">{label}</div>
          <div className="text-muted">{children}</div>
        </PopoverPanel>
      </Transition>
    </Popover>
  );
}

/* Pickers -------------------------------------------------------------- */
export function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color?: string }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => ICON_NAMES.filter((n) => n.toLowerCase().includes(query.toLowerCase())).slice(0, 120),
    [query],
  );
  return (
    <Combobox value={value} onChange={(v: string | null) => { if (v) onChange(v); }}>
      <div className="relative">
        <div className="flex items-center gap-2 rounded-[12px] bg-s2 px-2.5">
          <ComboboxInput
            className="h-9 flex-1 bg-transparent text-[13px] placeholder:text-faint"
            placeholder="Search icons"
            onChange={(e) => setQuery(e.target.value)}
            displayValue={() => ''}
          />
          <div className="flex items-center gap-1.5">
            <Icon name={value} size={15} style={{ color: color ?? 'var(--accent)' }} />
            <Icon name="Search" size={13} className="text-faint" />
          </div>
        </div>
        <ComboboxOptions className="panel-raised absolute z-[70] mt-1.5 max-h-56 w-full overflow-y-auto p-2">
          <div className="grid grid-cols-9 gap-1">
            {filtered.map((name) => (
              <ComboboxOption
                key={name}
                value={name}
                className="flex aspect-square cursor-pointer items-center justify-center rounded-[9px] text-muted data-[focus]:bg-s3 data-[selected]:bg-accentsoft data-[selected]:text-accent"
                title={name}
              >
                <Icon name={name} size={15} />
              </ComboboxOption>
            ))}
          </div>
          {!filtered.length && <div className="p-2 text-[12px] text-faint">No icons match.</div>}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}

export const SWATCHES = ['#7c8cff', '#57c9a0', '#f0a75a', '#ef6f6c', '#b18cff', '#4db6e5', '#e577b5', '#c9d24b', '#f5f5f5', '#9aa2b4'];

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SWATCHES.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label={`Colour ${c}`}
          className="focusable flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110"
          style={{ background: c, boxShadow: value.toLowerCase() === c.toLowerCase() ? `0 4px 14px -4px ${c}` : undefined }}
        >
          {value.toLowerCase() === c.toLowerCase() && <Check size={11} className="text-white" strokeWidth={3} />}
        </button>
      ))}
      <label className="focusable ml-1 flex h-6 items-center gap-1.5 rounded-full bg-s2 px-2 text-[11px] text-muted">
        <span className="h-3 w-3 rounded-full" style={{ background: value }} />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-0 opacity-0" />
        Custom
      </label>
    </div>
  );
}

/* Data viz ------------------------------------------------------------- */
export function ProgressRing({ value, size = 44, stroke = 5, color, label, children }: {
  value: number; size?: number; stroke?: number; color?: string; label?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color ?? 'var(--accent)'} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (v / 100) * c }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children ?? <span className="num text-[11px] font-semibold">{Math.round(v)}</span>}
      </div>
    </div>
  );
}

export function Sparkline({ data, width = 72, height = 24, color }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (!data.length) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 3) - 1.5;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={color ?? 'var(--accent)'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({ icon = 'Sparkles', title, body, action, className }: { icon?: string; title: string; body?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-[var(--radius)] bg-s1/50 px-6 py-14 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] bg-s2 text-muted">
        <Icon name={icon} size={22} />
      </div>
      <div className="text-[14px] font-medium">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[12.5px] text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const map = {
    default: 'bg-s3 text-muted',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/15 text-danger',
    accent: 'bg-accentsoft text-accent',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', map[tone])}>{children}</span>;
}

export function ScrollArea({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('min-h-0 overflow-y-auto', className)}>{children}</div>;
}

export function AnimatedList({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>{children}</motion.div>
    </AnimatePresence>
  );
}

export { Transition, AnimatePresence, motion };

/* Error state ---------------------------------------------------------- */
export function ErrorPanel({ title, message, scope, stack, onRetry, onReload, onCopy }: {
  title: string; message: string; scope?: string; stack?: string;
  onRetry: () => void; onReload: () => void; onCopy: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-[520px] rounded-[20px] p-5" style={{ background: 'var(--surface-1)' }}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]" style={{ background: 'color-mix(in srgb, var(--danger) 18%, transparent)', color: 'var(--danger)' }}>
            <Icon name="CircleAlert" size={17} />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-medium">{title}</div>
            <div className="mt-0.5 text-[12px] text-muted">{message}</div>
            {scope && <div className="mt-1 text-[11px] text-faint">at {scope}</div>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="primary" size="sm" icon="RotateCcw" onClick={onRetry}>Try again</Btn>
          <Btn size="sm" icon="RefreshCw" onClick={onReload}>Reload Flow</Btn>
          <Btn size="sm" variant="ghost" icon="Copy" onClick={onCopy}>Copy report</Btn>
          <Btn size="sm" variant="ghost" icon={open ? 'ChevronDown' : 'ChevronRight'} onClick={() => setOpen(!open)}>Details</Btn>
        </div>
        {open && stack && (
          <pre className="mt-3 max-h-56 overflow-auto rounded-[12px] p-2.5 text-[10.5px] leading-relaxed text-faint" style={{ background: 'var(--surface)' }}>
            {stack}
          </pre>
        )}
        <div className="mt-3 text-[11px] text-faint">
          Your database is untouched. Everything is stored locally, so reloading never loses work.
        </div>
      </div>
    </div>
  );
}
