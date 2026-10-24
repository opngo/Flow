import { useState } from 'react';
import { Dialog, DialogPanel } from '@headlessui/react';
import { motion } from 'framer-motion';
import { useFlow } from '../store';
import { Btn, ColorPicker, Field, Icon, Modal, RadioCards, Segmented, Select, Toggle } from './ui';
import { ACCENTS, FONTS, PRESETS } from '../lib/theme';
import { TOOLS } from '../lib/nav';
import { notifyHealth, requestNotificationPermission, systemNotify } from '../lib/platform';

const STEPS = ['Welcome', 'Look', 'Type', 'Sidebar', 'Tools', 'Alerts'];

export function Onboarding() {
  const settings = useFlow((s) => s.db.settings);
  const updateSettings = useFlow((s) => s.updateSettings);
  const [step, setStep] = useState(0);
  const [permission, setPermission] = useState<string>(notifyHealth().permission);
  const [enabled, setEnabled] = useState<string[]>(settings.enabledTools.length ? settings.enabledTools : TOOLS.slice(0, 18).map((t) => t.id));

  const finish = () => {
    updateSettings((s) => ({ ...s, onboardingComplete: true, enabledTools: enabled }));
  };

  const body = [
    <div key="w" className="space-y-3">
      <p className="text-[13px] text-muted">
        Flow keeps one local database for tasks, habits, timers, grades and notes. Nothing leaves this machine and there are no accounts.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: 'CheckSquare', label: 'Todos with dates and times' },
          { icon: 'Flame', label: 'Weekly habits and streaks' },
          { icon: 'Timer', label: 'Focus engine that logs study time' },
        ].map((f) => (
          <div key={f.label} className="panel-flat p-3">
            <Icon name={f.icon} size={16} className="text-accent" />
            <div className="mt-2 text-[12px] text-muted">{f.label}</div>
          </div>
        ))}
      </div>
    </div>,
    <div key="l" className="space-y-4">
      <Field label="Theme preset">
        <Select
          value={settings.theme.preset}
          onChange={(v) => updateSettings((s) => ({ ...s, theme: { ...s.theme, preset: v } }))}
          options={PRESETS.map((p) => ({ value: p.id, label: `${p.name} (${p.mode})` }))}
        />
      </Field>
      <Field label="Mode">
        <Segmented
          value={settings.theme.mode}
          onChange={(v) => updateSettings((s) => ({ ...s, theme: { ...s.theme, mode: v } }))}
          options={[{ value: 'dark', label: 'Dark', icon: 'Moon' }, { value: 'light', label: 'Light', icon: 'Sun' }, { value: 'system', label: 'System', icon: 'Monitor' }]}
        />
      </Field>
      <Field label="Accent">
        <ColorPicker value={settings.theme.accent} onChange={(v) => updateSettings((s) => ({ ...s, theme: { ...s.theme, accent: v } }))} />
      </Field>
      <div className="flex gap-2">
        {ACCENTS.slice(0, 6).map((a) => (
          <button key={a} onClick={() => updateSettings((s) => ({ ...s, theme: { ...s.theme, accent: a } }))} aria-label={`Accent ${a}`}
            className="focusable flex h-8 flex-1 items-center justify-center rounded-[10px]"
            style={{ background: a, boxShadow: settings.theme.accent === a ? `0 6px 20px -6px ${a}` : undefined }}>
            {settings.theme.accent === a && <Icon name="Check" size={13} className="text-white" strokeWidth={3} />}
          </button>
        ))}
      </div>
    </div>,
    <div key="t" className="space-y-3">
      <Field label="UI font">
        <Select value={settings.typography.ui} onChange={(v) => updateSettings((s) => ({ ...s, typography: { ...s.typography, ui: v } }))} options={FONTS.map((f) => ({ value: f.id, label: f.id }))} />
      </Field>
      <div className="panel-flat p-3">
        <div className="text-[13px]" style={{ fontFamily: `'${settings.typography.ui}', sans-serif` }}>
          The quick brown fox jumps over the lazy dog — 0123456789
        </div>
        <div className="num mt-1 text-[24px] font-semibold">25:00</div>
      </div>
      <p className="text-[11.5px] text-faint">Every font, size and spacing value lives in Settings → Appearance.</p>
    </div>,
    <div key="s" className="space-y-3">
      <RadioCards
        value={settings.sidebar.mode}
        onChange={(v) => updateSettings((s) => ({ ...s, sidebar: { ...s.sidebar, mode: v } }))}
        options={[
          { value: 'auto', label: 'Auto-hide', description: 'Slides away after a moment of inactivity; returns at the left edge.', icon: 'PanelLeft' },
          { value: 'always', label: 'Always visible', description: 'Pinned open at all times.', icon: 'Pin' },
        ]}
      />
      <Toggle label="Icons only" description="Compact rail without labels." checked={settings.sidebar.iconsOnly} onChange={(v) => updateSettings((s) => ({ ...s, sidebar: { ...s.sidebar, iconsOnly: v } }))} />
    </div>,
    <div key="tools" className="space-y-2">
      <p className="text-[12.5px] text-muted">Pick what shows up in the sidebar and palette. You can change this later — everything stays reachable from Ctrl K.</p>
      <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
        {TOOLS.slice(0, 60).map((t) => {
          const on = enabled.includes(t.id);
          return (
            <button key={t.id} onClick={() => setEnabled((e) => (on ? e.filter((x) => x !== t.id) : [...e, t.id]))}
              className="focusable flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[12px]"
              style={{ background: on ? 'var(--accent-soft)' : 'var(--surface-2)', color: on ? 'var(--accent)' : 'var(--text-muted)' }}>
              <Icon name={t.icon} size={13} />
              <span className="flex-1 truncate">{t.name}</span>
              {on && <Icon name="Check" size={12} />}
            </button>
          );
        })}
      </div>
    </div>,
    <div key="n" className="space-y-3">
      <div className="panel-flat p-3">
        <div className="flex items-center gap-2">
          <Icon name={permission === 'granted' ? 'ShieldCheck' : 'Shield'} size={15} className={permission === 'granted' ? 'text-success' : 'text-warning'} />
          <span className="text-[13px]">Notification permission: <span className="num">{permission}</span></span>
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted">
          Reminders are scheduled in the main process so they fire even when the window is closed and survive restarts, sleep and quiet hours.
        </p>
        <div className="mt-2 flex gap-2">
          <Btn size="sm" icon="Bell" onClick={async () => { const r = await requestNotificationPermission(); setPermission(String(r)); }}>Allow</Btn>
          <Btn size="sm" variant="soft" icon="Play" onClick={() => systemNotify({ title: 'Flow test notification', body: 'If you can see this, toasts are working.' })}>Send test</Btn>
        </div>
      </div>
      <Toggle label="Notification sounds" checked={settings.notifications.sound}
        onChange={(v) => updateSettings((s) => ({ ...s, notifications: { ...s.notifications, sound: v } }))} />
    </div>,
  ];

  return (
    <Dialog open onClose={() => {}} className="relative z-[110]" static>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="panel-raised w-full max-w-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 pb-2 pt-5">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px]" style={{ background: 'var(--accent)' }}>
              <Icon name="Waves" size={15} className="text-white" />
            </span>
            <span className="text-[14px] font-semibold">Welcome to Flow</span>
            <div className="ml-auto flex items-center gap-1">
              {STEPS.map((s, i) => (
                <button key={s} onClick={() => setStep(i)} aria-label={s}
                  className="focusable h-1.5 rounded-full transition-all"
                  style={{ width: i === step ? 20 : 6, background: i === step ? 'var(--accent)' : 'var(--surface-3)' }} />
              ))}
            </div>
          </div>
          <div className="px-5 py-2">
            <div className="label mb-2">{STEPS[step]}</div>
            <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
              {body[step]}
            </motion.div>
          </div>
          <div className="flex items-center gap-2 px-5 py-4">
            <Btn variant="ghost" onClick={finish}>Skip setup</Btn>
            <div className="ml-auto flex gap-2">
              {step > 0 && <Btn variant="soft" icon="ArrowLeft" onClick={() => setStep(step - 1)}>Back</Btn>}
              {step < STEPS.length - 1
                ? <Btn variant="primary" iconRight="ArrowRight" onClick={() => setStep(step + 1)}>Continue</Btn>
                : <Btn variant="primary" icon="Sparkles" onClick={finish}>Enter Flow</Btn>}
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
