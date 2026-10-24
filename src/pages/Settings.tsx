import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import {
  Badge, Btn, ColorPicker, ConfirmDialog, Field, Icon, IconBtn, Panel, RadioCards, SectionHead, Segmented,
  Select, Slider, SliderField, TextArea, TextInput, Toggle,
} from '../components/ui';
import { ACCENTS, FONTS, PRESETS } from '../lib/theme';
import { DEFAULT_SIDEBAR, NAV } from '../lib/nav';
import { download, isElectron } from '../lib/platform';
import { cn, uuid } from '../lib/utils';
import { engine } from '../audio/engine';
import { countDemoItems } from '../lib/demo';
import { BackdropPanel } from '../components/BackdropPanel';
import { CornersPanel } from '../components/CornersPanel';

type Tab = 'appearance' | 'type' | 'sidebar' | 'notifications' | 'behavior' | 'timers' | 'data' | 'security' | 'about';

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'appearance';
  const setTab = (t: Tab) => { params.set('tab', t); setParams(params, { replace: true }); };
  const db = useFlow((s) => s.db);
  const updateSettings = useFlow((s) => s.updateSettings);
  const toast = useUI((s) => s.toast);
  const s = db.settings;

  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'appearance', label: 'Appearance', icon: 'Palette' },
    { id: 'type', label: 'Typography', icon: 'Type' },
    { id: 'sidebar', label: 'Sidebar', icon: 'PanelLeft' },
    { id: 'notifications', label: 'Notifications', icon: 'Bell' },
    { id: 'behavior', label: 'Behavior', icon: 'Settings' },
    { id: 'timers', label: 'Timers', icon: 'Timer' },
    { id: 'data', label: 'Data', icon: 'Database' },
    { id: 'security', label: 'Security', icon: 'Lock' },
    { id: 'about', label: 'About', icon: 'Info' },
  ];

  return (
    <div className="space-y-4 pb-10">
      <div className="pt-2">
        <h1 className="h1">Settings</h1>
        <div className="mt-0.5 text-[12px] text-muted">Local preferences · stored in your database, never synced</div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-[12px] bg-s1 p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('focusable flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[12.5px]', tab === t.id ? 'bg-s3 text-ink' : 'text-muted hover:text-ink')}>
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'appearance' && (
        <div className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="p-4">
            <SectionHead title="Theme" subtitle="Presets, mode and accent" />
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => updateSettings((x) => ({ ...x, theme: { ...x.theme, preset: p.id } }))}
                  className="focusable rounded-[12px] p-2.5 text-left"
                  style={{ background: s.theme.preset === p.id ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                  <div className="flex gap-1">
                    {[p.dark.surface, p.dark.s2, p.dark.accent].map((c, i) => <span key={i} className="h-5 flex-1 rounded-[5px]" style={{ background: c }} />)}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[12px]">
                    {p.name}
                    {s.theme.preset === p.id && <Icon name="Check" size={11} className="text-accent" />}
                    <span className="ml-auto text-[10px] text-faint">{p.mode}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <Field label="Mode">
                <Segmented value={s.theme.mode} onChange={(v) => updateSettings((x) => ({ ...x, theme: { ...x.theme, mode: v } }))}
                  options={[{ value: 'dark', label: 'Dark', icon: 'Moon' }, { value: 'light', label: 'Light', icon: 'Sun' }, { value: 'system', label: 'System', icon: 'Monitor' }]} />
              </Field>
              <Field label="Accent"><ColorPicker value={s.theme.accent} onChange={(v) => updateSettings((x) => ({ ...x, theme: { ...x.theme, accent: v } }))} /></Field>
              <div className="flex flex-wrap gap-1.5">
                {ACCENTS.map((a) => (
                  <button key={a} onClick={() => updateSettings((x) => ({ ...x, theme: { ...x.theme, accent: a } }))} aria-label={`Accent ${a}`}
                    className="focusable flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ background: a, boxShadow: s.theme.accent === a ? `0 4px 14px -4px ${a}` : undefined }}>
                    {s.theme.accent === a && <Icon name="Check" size={11} className="text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionHead title="Custom theme" subtitle="Override individual tokens" />
            <div className="grid gap-2">
              {(['surface', 's1', 's2', 's3', 'text', 'muted', 'accent', 'success', 'warning', 'danger'] as const).map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-24 text-[11.5px] capitalize text-muted">{key}</span>
                  <input type="color" value={s.theme.overrides[key] ?? readToken(key)} onChange={(e) => updateSettings((x) => ({ ...x, theme: { ...x.theme, overrides: { ...x.theme.overrides, [key]: e.target.value } } }))}
                    className="h-6 w-10 cursor-pointer rounded-[6px] bg-transparent" aria-label={`${key} colour`} />
                  <span className="num text-[10.5px] text-faint">{s.theme.overrides[key] ?? readToken(key)}</span>
                  {s.theme.overrides[key] && <IconBtn icon="X" label="Reset" className="h-6 w-6" onClick={() => updateSettings((x) => {
                    const next = { ...x.theme.overrides };
                    delete next[key];
                    return { ...x, theme: { ...x.theme, overrides: next } };
                  })} />}
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <SliderField label="Density" value={s.theme.density} min={0.85} max={1.2} step={0.01}
                format={(v) => v.toFixed(2)}
                onChange={(v) => updateSettings((x) => ({ ...x, theme: { ...x.theme, density: v } }))} />
              <SliderField label="Surface blur" value={s.theme.blur} min={0} max={40} step={1}
                format={(v) => `${v}px`}
                onChange={(v) => updateSettings((x) => ({ ...x, theme: { ...x.theme, blur: v } }))} />
            </div>
          </Panel>
        </div>
        <BackdropPanel />
        <CornersPanel />
        </div>
      )}

      {tab === 'type' && <TypographyPanel />}
      {tab === 'sidebar' && <SidebarPanel />}

      {tab === 'notifications' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="p-4">
            <SectionHead title="Delivery" subtitle="Scheduler lives in the main process when packaged" />
            <Toggle label="Enable notifications" checked={s.notifications.enabled} onChange={(v) => updateSettings((x) => ({ ...x, notifications: { ...x.notifications, enabled: v } }))} />
            <Toggle label="Notification sounds" description="Plays through the Sound Studio master bus" checked={s.notifications.sound} onChange={(v) => updateSettings((x) => ({ ...x, notifications: { ...x.notifications, sound: v } }))} />
            <Field label={`Volume — ${Math.round(s.notifications.volume * 100)}`}>
              <Slider label="Notification volume" value={s.notifications.volume} min={0} max={1} step={0.05}
                onChange={(v) => updateSettings((x) => ({ ...x, notifications: { ...x.notifications, volume: v } }))}
                format={(v) => `${Math.round(v * 100)}%`} showValue full />
            </Field>
            <div className="mt-2 flex gap-2">
              <Btn size="sm" variant="soft" icon="Play" onClick={() => engine.notificationChime()}>Preview sound</Btn>
              <Btn size="sm" variant="ghost" icon="Bell" onClick={() => useUI.getState().toast({ title: 'In-app toast', body: 'This is the fallback channel.', tone: 'success' })}>Preview toast</Btn>
            </div>
          </Panel>
          <Panel className="p-4">
            <SectionHead title="Quiet hours" subtitle="Never drop, only hold" />
            <Toggle label="Enable quiet hours" checked={s.notifications.quietHours.enabled} onChange={(v) => updateSettings((x) => ({ ...x, notifications: { ...x.notifications, quietHours: { ...x.notifications.quietHours, enabled: v } } }))} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="From"><TextInput type="time" value={s.notifications.quietHours.from} onChange={(e) => updateSettings((x) => ({ ...x, notifications: { ...x.notifications, quietHours: { ...x.notifications.quietHours, from: e.target.value } } }))} /></Field>
              <Field label="To"><TextInput type="time" value={s.notifications.quietHours.to} onChange={(e) => updateSettings((x) => ({ ...x, notifications: { ...x.notifications, quietHours: { ...x.notifications.quietHours, to: e.target.value } } }))} /></Field>
            </div>
            <div className="mt-3 space-y-1">
              {(['todo', 'habit', 'timer', 'mark', 'wellness', 'system'] as const).map((kind) => (
                <Toggle key={kind} label={`${kind} notifications`} checked={s.notifications.perType[kind] !== false}
                  onChange={(v) => updateSettings((x) => ({ ...x, notifications: { ...x.notifications, perType: { ...x.notifications.perType, [kind]: v } } }))} />
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'behavior' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="p-4">
            <SectionHead title="Window and startup" />
            <Toggle label="Close to tray" description="Closing the window keeps timers and reminders alive" checked={s.behavior.closeToTray} onChange={(v) => updateSettings((x) => ({ ...x, behavior: { ...x.behavior, closeToTray: v } }))} />
            <Toggle label="Minimize to tray" checked={s.behavior.minimizeToTray} onChange={(v) => updateSettings((x) => ({ ...x, behavior: { ...x.behavior, minimizeToTray: v } }))} />
            <Toggle label="Launch at startup (hidden)" checked={s.behavior.launchAtStartup} onChange={(v) => updateSettings((x) => ({ ...x, behavior: { ...x.behavior, launchAtStartup: v } }))} />
            <Toggle label="Pin window on top" checked={s.behavior.pinOnTop} onChange={(v) => updateSettings((x) => ({ ...x, behavior: { ...x.behavior, pinOnTop: v } }))} />
            <Toggle label="Reduce motion" description="Disables non-essential animation everywhere" checked={s.behavior.reduceMotion} onChange={(v) => updateSettings((x) => ({ ...x, behavior: { ...x.behavior, reduceMotion: v } }))} />
            {!isElectron() && <div className="mt-1 text-[11px] text-faint">Window controls activate in the packaged Electron build.</div>}
          </Panel>
          <Panel className="p-4">
            <SectionHead title="Calendar and hotkeys" />
            <Field label="Week starts on">
              <Segmented value={String(s.behavior.weekStart)} onChange={(v) => updateSettings((x) => ({ ...x, behavior: { ...x.behavior, weekStart: Number(v) } }))}
                options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} />
            </Field>
            <div className="mt-3 space-y-2">
              {Object.entries(s.behavior.hotkeys).map(([key, value]) => (
                <Field key={key} label={key.replace(/([A-Z])/g, ' $1')}>
                  <TextInput value={value} onChange={(e) => updateSettings((x) => ({ ...x, behavior: { ...x.behavior, hotkeys: { ...x.behavior.hotkeys, [key]: e.target.value } } }))} className="num text-[12px]" />
                </Field>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-faint">Global hotkeys register in the main process; in the browser they apply while the window is focused.</div>
          </Panel>
        </div>
      )}

      {tab === 'timers' && <TimersPanel />}

      {tab === 'data' && <DataPanel />}

      {tab === 'security' && (
        <Panel className="p-4">
          <SectionHead title="App lock" subtitle="A PIN gate on launch" />
          <Toggle label="Require PIN to open Flow" checked={s.behavior.appLock.enabled} onChange={(v) => updateSettings((x) => ({ ...x, behavior: { ...x.behavior, appLock: { ...x.behavior.appLock, enabled: v } } }))} />
          <Field label="PIN (4-8 digits)">
            <TextInput type="password" inputMode="numeric" maxLength={8} value={s.behavior.appLock.pin}
              onChange={(e) => updateSettings((x) => ({ ...x, behavior: { ...x.behavior, appLock: { ...x.behavior.appLock, pin: e.target.value.replace(/\D/g, '') } } }))}
              placeholder="••••" />
          </Field>
          <div className="mt-2 flex gap-2">
            <Btn size="sm" variant="soft" icon="Lock" onClick={() => { useUI.getState().setLocked(true); toast({ title: 'Locked' }); }}>Lock now</Btn>
          </div>
          <div className="mt-3 rounded-[12px] bg-s1 p-3 text-[11.5px] text-muted">
            The PIN is stored locally in your database. It is a convenience gate, not encryption — the Electron build can add OS keychain backed encryption.
          </div>
        </Panel>
      )}

      {tab === 'about' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: 'var(--accent)' }}>
                <Icon name="Waves" size={20} className="text-white" />
              </span>
              <div>
                <div className="text-[15px] font-semibold">Flow 1.0.0</div>
                <div className="text-[11.5px] text-muted">All-in-one local-first productivity</div>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-[11.5px] text-muted">
              <div className="flex justify-between"><span>Platform</span><span className="num">{isElectron() ? 'Electron desktop' : 'Browser preview'}</span></div>
              <div className="flex justify-between"><span>Database version</span><span className="num">{db.version}</span></div>
              <div className="flex justify-between"><span>Records</span><span className="num">{db.todos.length + db.notes.length + db.marks.length + db.focusSessions.length}</span></div>
              <div className="flex justify-between"><span>Fonts loaded</span><span className="num">{FONTS.length + s.typography.customFonts.length}</span></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="accent">No accounts</Badge>
              <Badge tone="success">No telemetry</Badge>
              <Badge>Offline first</Badge>
            </div>
          </Panel>
          <Panel className="p-4">
            <SectionHead title="Credits" subtitle="Built with" />
            <div className="flex flex-wrap gap-1.5 text-[11.5px]">
              {['Electron', 'React 18', 'TypeScript', 'Vite', 'Tailwind CSS', 'Headless UI', 'Zustand', 'Zod', 'Lucide', 'Framer Motion', 'dnd-kit', 'Recharts', 'date-fns', 'rrule', 'Web Audio API', 'Vitest'].map((x) => (
                <span key={x} className="chip">{x}</span>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-faint">Design notes: no borders anywhere, focus shown with tint and glow, motion between 150 and 250ms, and a single continuous surface from titlebar to content.</div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function readToken(key: string) {
  const map: Record<string, string> = {
    surface: '--surface', s1: '--surface-1', s2: '--surface-2', s3: '--surface-3',
    text: '--text', muted: '--text-muted', accent: '--accent', success: '--success', warning: '--warning', danger: '--danger',
  };
  if (typeof window === 'undefined') return '#000000';
  const v = getComputedStyle(document.documentElement).getPropertyValue(map[key] ?? '--surface').trim();
  return v.startsWith('#') ? v : '#7c8cff';
}

function TypographyPanel() {
  const s = useFlow((st) => st.db.settings);
  const updateSettings = useFlow((st) => st.updateSettings);
  const toast = useUI((st) => st.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = s.typography;

  const patch = (p: Partial<typeof t>) => updateSettings((x) => ({ ...x, typography: { ...x.typography, ...p } }));

  const importFont = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      const name = file.name.replace(/\.(ttf|otf|woff2?|)$/i, '');
      try {
        const face = new FontFace(name, `url(${dataUrl})`);
        await face.load();
        document.fonts.add(face);
        patch({ customFonts: [...t.customFonts, { name, dataUrl }], ui: name });
        toast({ title: 'Font imported', body: name, tone: 'success' });
      } catch {
        toast({ title: 'That font could not be loaded', tone: 'danger' });
      }
    };
    reader.readAsDataURL(file);
  };

  const presetJSON = JSON.stringify(t, null, 2);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel className="p-4">
        <SectionHead title="Fonts" subtitle="Separate slots for UI, content, timer and code" />
        <div className="grid gap-2">
          {([['ui', 'UI font'], ['content', 'Content font'], ['timer', 'Timer and numerals'], ['mono', 'Monospace']] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <Select value={t[key]} onChange={(v) => patch({ [key]: v } as never)}
                options={[...FONTS.map((f) => ({ value: f.id, label: f.id })), ...t.customFonts.map((f) => ({ value: f.name, label: `${f.name} (imported)` }))]} />
            </Field>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Btn size="sm" variant="soft" icon="Upload" onClick={() => fileRef.current?.click()}>Import .ttf / .woff2</Btn>
          <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFont(f); }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SliderField label="Base size" value={t.baseSize} min={11} max={20} step={0.5} format={(v) => `${v}px`}
            onChange={(v) => patch({ baseSize: v })} />
          <SliderField label="Line height" value={t.lineHeight} min={1.2} max={2} step={0.05} format={(v) => v.toFixed(2)}
            onChange={(v) => patch({ lineHeight: v })} />
          <SliderField label="Letter spacing" value={t.letterSpacing} min={-0.03} max={0.08} step={0.005}
            format={(v) => `${v.toFixed(3)}em`} onChange={(v) => patch({ letterSpacing: v })} />
          <SliderField label="Weight" value={t.weight} min={300} max={700} step={10} format={(v) => String(v)}
            onChange={(v) => patch({ weight: v })} />
          <SliderField label="Heading scale" value={t.headingScale} min={0.85} max={1.4} step={0.01}
            format={(v) => `${v.toFixed(2)}x`} onChange={(v) => patch({ headingScale: v })} />
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHead title="Live preview" subtitle="Everything updates as you move a slider" />
        <div className="rounded-[12px] bg-s1 p-3">
          <div className="h2">Heading two</div>
          <div className="mt-1 text-[13px]" style={{ fontFamily: 'var(--font-content)' }}>
            The quick brown fox jumps over the lazy dog. Typography is a feature, not decoration — this is content type, used in notes and journals.
          </div>
          <div className="num mt-2 text-[30px] font-semibold leading-none">25:00</div>
          <div className="mt-1 text-[11.5px] text-faint" style={{ fontFamily: 'var(--font-mono)' }}>const flow = local-first();</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn size="sm" variant="soft" icon="Download" onClick={() => download('flow-typography.json', presetJSON, 'application/json')}>Export preset</Btn>
          <label className="focusable inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[12px] bg-s2 px-3 text-[12.5px] hover:bg-s3">
            <Icon name="Upload" size={13} /> Import preset
            <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const parsed = JSON.parse(await file.text());
                updateSettings((x) => ({ ...x, typography: { ...x.typography, ...parsed } }));
                toast({ title: 'Typography preset applied', tone: 'success' });
              } catch { toast({ title: 'Invalid preset file', tone: 'danger' }); }
            }} />
          </label>
          <Btn size="sm" variant="ghost" icon="RotateCcw" onClick={() => patch({ ui: 'Inter', content: 'Inter', timer: 'Inter', mono: 'JetBrains Mono', baseSize: 14.5, lineHeight: 1.55, letterSpacing: 0, weight: 450, headingScale: 1 })}>Reset</Btn>
        </div>
        {t.customFonts.length > 0 && (
          <div className="mt-3">
            <div className="label mb-1">Imported fonts</div>
            {t.customFonts.map((f) => (
              <div key={f.name} className="flex items-center gap-2 rounded-[8px] bg-s1 px-2 py-1 text-[11.5px]">
                <span className="flex-1" style={{ fontFamily: `'${f.name}'` }}>{f.name}</span>
                <IconBtn icon="Trash2" label="Remove font" className="h-5 w-5" onClick={() => patch({ customFonts: t.customFonts.filter((x) => x.name !== f.name) })} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function SidebarPanel() {
  const s = useFlow((st) => st.db.settings);
  const updateSettings = useFlow((st) => st.updateSettings);
  const items = s.sidebar.items.length ? s.sidebar.items : DEFAULT_SIDEBAR;

  const patch = (p: Partial<typeof s.sidebar>) => updateSettings((x) => ({ ...x, sidebar: { ...x.sidebar, ...p, items: x.sidebar.items.length ? x.sidebar.items : DEFAULT_SIDEBAR } }));
  const move = (id: string, dir: -1 | 1) => {
    const list = [...items];
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    patch({ items: list });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel className="p-4">
        <SectionHead title="Behaviour" subtitle="Auto-hide, width and layout" />
        <RadioCards value={s.sidebar.mode} onChange={(v) => patch({ mode: v })}
          options={[
            { value: 'auto', label: 'Auto-hide', description: 'Collapses after inactivity, returns on hover at the left edge.', icon: 'PanelLeft' },
            { value: 'always', label: 'Always visible', description: 'Pinned open at all times.', icon: 'Pin' },
          ]} />
        <div className="mt-3 space-y-2">
          <SliderField label="Hide delay" value={s.sidebar.hideDelay} min={300} max={4000} step={100}
            format={(v) => `${(v / 1000).toFixed(1)}s`} onChange={(v) => patch({ hideDelay: v })} />
          <SliderField label="Width" value={s.sidebar.width} min={190} max={320} step={2}
            format={(v) => `${v}px`} onChange={(v) => patch({ width: v })} />
          <Toggle label="Icons only" checked={s.sidebar.iconsOnly} onChange={(v) => patch({ iconsOnly: v })} />
          <Toggle label="Overlay content" description="Sidebar floats over the page instead of pushing it" checked={s.sidebar.overlay} onChange={(v) => patch({ overlay: v })} />
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHead title="Items" subtitle="Reorder, hide, or regroup" right={<Btn size="sm" variant="ghost" icon="RotateCcw" onClick={() => patch({ items: DEFAULT_SIDEBAR })}>Reset</Btn>} />
        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {items.map((item, i) => (
            <div key={item.id} className={cn('flex items-center gap-1.5 rounded-[10px] bg-s1 px-2 py-1.5', item.hidden && 'opacity-50')}>
              <Icon name={item.icon} size={13} className="text-muted" />
              <span className="flex-1 truncate text-[12px]">{item.label}</span>
              <Select value={item.group} onChange={(v) => patch({ items: items.map((x) => (x.id === item.id ? { ...x, group: v } : x)) })}
                className="w-24" options={[{ value: 'Main', label: 'Main' }, { value: 'Time', label: 'Time' }, { value: 'Study', label: 'Study' }, { value: 'Atmosphere', label: 'Atmos' }, { value: 'System', label: 'System' }]} />
              <IconBtn icon="ChevronUp" label="Move up" className="h-6 w-6" onClick={() => move(item.id, -1)} disabled={i === 0} />
              <IconBtn icon="ChevronDown" label="Move down" className="h-6 w-6" onClick={() => move(item.id, 1)} disabled={i === items.length - 1} />
              <IconBtn icon={item.hidden ? 'Eye' : 'Eye'} label={item.hidden ? 'Show' : 'Hide'} active={!item.hidden} className="h-6 w-6" onClick={() => patch({ items: items.map((x) => (x.id === item.id ? { ...x, hidden: !x.hidden } : x)) })} />
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-faint">{NAV.length} destinations · hidden items stay reachable from the palette.</div>
      </Panel>
    </div>
  );
}

function TimersPanel() {
  const s = useFlow((st) => st.db.settings);
  const updateSettings = useFlow((st) => st.updateSettings);
  const [name, setName] = useState('');
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel className="p-4">
        <SectionHead title="Pomodoro profiles" subtitle="Focus, break and long-break lengths" />
        <div className="space-y-2">
          {s.timerProfiles.map((p) => (
            <div key={p.id} className={cn('rounded-[12px] p-2.5', s.activeProfileId === p.id ? 'bg-accentsoft' : 'bg-s1')}>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[12.5px] font-medium">{p.name}</span>
                {s.activeProfileId === p.id && <Badge tone="accent">active</Badge>}
                <Btn size="sm" variant="ghost" onClick={() => updateSettings((x) => ({ ...x, activeProfileId: p.id }))}>Use</Btn>
                {s.timerProfiles.length > 1 && <IconBtn icon="Trash2" label="Delete profile" className="h-6 w-6" onClick={() => updateSettings((x) => ({ ...x, timerProfiles: x.timerProfiles.filter((y) => y.id !== p.id) }))} />}
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {([['focus', 'Focus'], ['shortBreak', 'Break'], ['longBreak', 'Long'], ['sessionsBeforeLong', 'Cycle']] as const).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <TextInput type="number" min={1} value={p[key]} onChange={(e) => updateSettings((x) => ({ ...x, timerProfiles: x.timerProfiles.map((y) => (y.id === p.id ? { ...y, [key]: Number(e.target.value) } : y)) }))} className="py-1 text-center text-[12px]" />
                  </Field>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button onClick={() => updateSettings((x) => ({ ...x, timerProfiles: x.timerProfiles.map((y) => (y.id === p.id ? { ...y, autoStartBreaks: !y.autoStartBreaks } : y)) }))}
                  className={cn('focusable chip text-[10px]', p.autoStartBreaks && 'text-accent')} style={p.autoStartBreaks ? { background: 'var(--accent-soft)' } : undefined}>
                  <Icon name={p.autoStartBreaks ? 'Check' : 'Circle'} size={9} />auto breaks
                </button>
                <button onClick={() => updateSettings((x) => ({ ...x, timerProfiles: x.timerProfiles.map((y) => (y.id === p.id ? { ...y, autoStartFocus: !y.autoStartFocus } : y)) }))}
                  className={cn('focusable chip text-[10px]', p.autoStartFocus && 'text-accent')} style={p.autoStartFocus ? { background: 'var(--accent-soft)' } : undefined}>
                  <Icon name={p.autoStartFocus ? 'Check' : 'Circle'} size={9} />auto focus
                </button>
                <button onClick={() => updateSettings((x) => ({ ...x, timerProfiles: x.timerProfiles.map((y) => (y.id === p.id ? { ...y, strict: !y.strict } : y)) }))}
                  className={cn('focusable chip text-[10px]', p.strict && 'text-warning')} style={p.strict ? { background: 'color-mix(in srgb, var(--warning) 16%, transparent)' } : undefined}>
                  <Icon name={p.strict ? 'Check' : 'Circle'} size={9} />strict
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="New profile name" />
          <Btn size="sm" variant="soft" icon="Plus" onClick={() => {
            if (!name.trim()) return;
            updateSettings((x) => ({ ...x, timerProfiles: [...x.timerProfiles, { id: uuid(), name, focus: 30, shortBreak: 5, longBreak: 20, sessionsBeforeLong: 4, autoStartBreaks: false, autoStartFocus: false, strict: false }] }));
            setName('');
          }}>Add</Btn>
        </div>
      </Panel>
      <Panel className="p-4">
        <SectionHead title="Defaults" subtitle="Applied to new sessions" />
        <Field label="Default sound mix">
          <Select value={s.timerProfiles.find((p) => p.id === s.activeProfileId)?.mixId ?? ''}
            onChange={(v) => updateSettings((x) => ({ ...x, timerProfiles: x.timerProfiles.map((p) => (p.id === x.activeProfileId ? { ...p, mixId: v || undefined } : p)) }))}
            options={[{ value: '', label: 'None' }, ...useFlow.getState().db.mixes.map((m) => ({ value: m.id, label: m.name }))]} />
        </Field>
        <div className="mt-3 space-y-1.5 text-[11.5px] text-muted">
          <div className="flex items-center gap-2"><Icon name="Info" size={12} />Timers are derived from <span className="num">startedAt</span> and <span className="num">endsAt</span>, so sleep, reloads and throttling cannot make them drift.</div>
          <div className="flex items-center gap-2"><Icon name="Database" size={12} />Every completed block writes a focus session and feeds the heatmap.</div>
        </div>
      </Panel>
    </div>
  );
}

function DataPanel() {
  const flow = useFlow.getState();
  const db = useFlow((s) => s.db);
  const loadDemoData = useFlow((s) => s.loadDemoData);
  const clearDemoData = useFlow((s) => s.clearDemoData);
  const toast = useUI((s) => s.toast);
  const [confirmReset, setConfirmReset] = useState(false);
  const demoItems = countDemoItems(db);
  const demoLoaded = demoItems > 0;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel className="p-4">
        <SectionHead title="Export and import" subtitle="Your data, your file" />
        <div className="flex flex-wrap gap-2">
          <Btn variant="primary" icon="Download" onClick={() => download(`flow-${new Date().toISOString().slice(0, 10)}.json`, flow.exportJSON(), 'application/json')}>Export JSON</Btn>
          <label className="focusable inline-flex h-9 cursor-pointer items-center gap-2 rounded-[12px] bg-s2 px-3.5 text-[13px] hover:bg-s3">
            <Icon name="Upload" size={15} /> Import JSON
            <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const ok = flow.importJSON(await f.text());
              toast({ title: ok ? 'Data imported' : 'Import failed', tone: ok ? 'success' : 'danger' });
            }} />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[['Todos', db.todos.length], ['Notes', db.notes.length], ['Sessions', db.focusSessions.length], ['Marks', db.marks.length], ['Habits', db.habits.length], ['Reminders', db.reminders.length]].map(([l, v]) => (
            <div key={String(l)} className="rounded-[10px] bg-s1 p-2">
              <div className="num text-[16px] font-semibold">{v}</div>
              <div className="text-[10px] text-faint">{l}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHead title="Demo data" subtitle="Example records you can add and remove at any time"
          right={<span className="chip" style={demoLoaded ? { color: 'var(--accent)' } : undefined}>{demoLoaded ? `${demoItems} items` : 'not loaded'}</span>} />
        <div className="space-y-2">
          <Btn variant={demoLoaded ? 'soft' : 'primary'} icon="Sparkles" full
            onClick={() => {
              const added = loadDemoData();
              toast({ title: added ? `Added ${added} demo records` : 'Demo data is already loaded', tone: 'success' });
            }}>{demoLoaded ? 'Add demo data again' : 'Load demo data'}</Btn>
          <Btn variant="soft" icon="Eraser" full
            onClick={() => {
              const removed = clearDemoData();
              toast({ title: removed ? `Removed ${removed} demo records` : 'No demo records to remove', tone: 'success' });
            }}>Remove demo data</Btn>
        </div>
        <div className="mt-3 rounded-[12px] bg-s1 p-3 text-[11.5px] leading-relaxed text-muted">
          Demo records are tagged and additive. Loading or removing them never touches your theme, sidebar,
          enabled tools, keyboard shortcuts, notification settings, the running timer or the tutorial state.
          Your own records are never removed.
          {db.demo?.loadedAt && (
            <span className="mt-1 block text-faint">Added {format(new Date(db.demo.loadedAt), 'd MMM yyyy, h:mm a')}.</span>
          )}
        </div>
      </Panel>

      <Panel className="p-4 lg:col-span-2">
        <SectionHead title="Danger zone" subtitle="These cannot be undone" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Btn variant="soft" icon="RotateCcw" onClick={() => { flow.loadSeed(); toast({ title: 'Example database restored', tone: 'success' }); }}>Replace everything with the example set</Btn>
          <Btn variant="danger" icon="Trash2" onClick={() => setConfirmReset(true)}>Delete all records</Btn>
        </div>
        <div className="mt-3 rounded-[12px] bg-s1 p-3 text-[11.5px] text-muted">
          Autosave is debounced at 350ms. In Electron every save also writes a rolling backup with retention in the user data directory.
        </div>
      </Panel>

      <ConfirmDialog open={confirmReset} onClose={() => setConfirmReset(false)} danger confirmLabel="Delete everything"
        title="Delete every record?" body="Todos, notes, marks, habits, sessions and the demo set are removed and the database is reseeded with the example records."
        onConfirm={async () => { await flow.resetAll(); toast({ title: 'Database reset', tone: 'success' }); }} />
    </div>
  );
}
