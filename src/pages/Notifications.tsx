import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import {
  Badge, Btn, Chip, EmptyState, Field, Icon, IconBtn, Panel, SectionHead, Segmented, Select, Stat, TextInput, TimeField, Toggle,
} from '../components/ui';
import { notifyHealth, requestNotificationPermission, systemNotify, isElectron } from '../lib/platform';
import { quietHoursActive } from '../lib/scheduler';
import { cn } from '../lib/utils';

const TYPES = ['all', 'todo', 'habit', 'timer', 'mark', 'wellness', 'system'] as const;

export default function Notifications() {
  const db = useFlow((s) => s.db);
  const flow = useFlow.getState();
  const navigate = useNavigate();
  const toast = useUI((s) => s.toast);
  const [filter, setFilter] = useState<typeof TYPES[number]>('all');
  const [health, setHealth] = useState(() => notifyHealth());
  const [devNote, setDevNote] = useState(false);

  const items = db.notifications.filter((n) => filter === 'all' || n.kind === filter);
  const unread = db.notifications.filter((n) => !n.read).length;
  const upcoming = useMemo(() => [...db.reminders].filter((r) => !r.delivered).sort((a, b) => +new Date(a.fireAt) - +new Date(b.fireAt)), [db.reminders]);
  const quiet = quietHoursActive(db.settings);

  const test = () => {
    systemNotify({ title: 'Flow test notification', body: 'If you can see this toast, delivery works.', route: '/notifications' });
    flow.notify({ kind: 'system', title: 'Test notification sent', body: `Platform: ${health.platform}` });
    toast({ title: 'Test sent', body: health.supported ? 'Check your system notification centre' : 'Web notifications unavailable here', tone: health.supported ? 'success' : 'warning' });
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Notifications</h1>
          <div className="mt-0.5 text-[12px] text-muted">{unread} unread · {upcoming.length} scheduled reminders</div>
        </div>
        <div className="flex gap-2">
          <Btn variant="soft" icon="Bell" onClick={test}>Send test</Btn>
          <Btn variant="ghost" icon="CheckCircle2" onClick={() => flow.markAllNotificationsRead()}>Mark all read</Btn>
          <Btn variant="ghost" icon="Trash2" onClick={() => flow.clearNotifications()}>Clear</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Permission" value={health.permission} sub={health.platform === 'electron' ? 'main process' : 'browser API'} icon="Shield" tone={health.permission === 'granted' ? 'success' : 'warning'} />
        <Stat label="AppUserModelID" value={health.appUserModelId ?? 'n/a'} sub={isElectron() ? 'matches appId' : 'Electron only'} icon="AppWindow" />
        <Stat label="Quiet hours" value={quiet ? 'holding' : 'off'} sub={db.settings.notifications.quietHours.enabled ? `${db.settings.notifications.quietHours.from}–${db.settings.notifications.quietHours.to}` : 'disabled'} icon="Moon" tone={quiet ? 'warning' : 'success'} />
        <Stat label="Scheduled" value={upcoming.length} sub="next 7 days" icon="AlarmClock" />
      </div>

      {!isElectron() && !db.settings.notifications.devNoteDismissed && (
        <div className="flex items-start gap-2 rounded-[12px] px-3 py-2.5 text-[12px]" style={{ background: 'color-mix(in srgb, var(--warning) 13%, transparent)', color: 'var(--warning)' }}>
          <Icon name="Info" size={14} className="mt-0.5" />
          <div className="flex-1">
            You are running the browser preview. In the packaged Electron build, Flow sets <span className="num">app.setAppUserModelId(&apos;com.flow.app&apos;)</span> before the first notification and the NSIS installer creates a Start Menu shortcut carrying the same id, which is what Windows requires to display toasts.
          </div>
          <IconBtn icon="X" label="Dismiss" onClick={() => flow.updateSettings((s) => ({ ...s, notifications: { ...s.notifications, devNoteDismissed: true } }))} />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <Panel className="p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {TYPES.map((t) => (
              <button key={t} onClick={() => setFilter(t)} className={cn('focusable chip capitalize', filter === t && 'text-accent')}
                style={filter === t ? { background: 'var(--accent-soft)' } : undefined}>
                {t}
                {t !== 'all' && <span className="num text-[10px] text-faint">{db.notifications.filter((n) => n.kind === t).length}</span>}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {items.map((n) => (
              <div key={n.id} className={cn('flex items-start gap-2 rounded-[11px] px-2.5 py-2', n.read ? 'bg-s1/40' : 'bg-s1')}>
                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-[8px]" style={{ background: n.missed ? 'color-mix(in srgb, var(--warning) 16%, transparent)' : 'var(--surface-2)', color: n.missed ? 'var(--warning)' : 'var(--text-muted)' }}>
                  <Icon name={n.kind === 'todo' ? 'CheckSquare' : n.kind === 'habit' ? 'Flame' : n.kind === 'timer' ? 'Timer' : n.kind === 'mark' ? 'GraduationCap' : n.kind === 'wellness' ? 'HeartPulse' : 'Bell'} size={12} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('truncate text-[12.5px]', n.read && 'text-muted')}>{n.title}</span>
                    {n.missed && <Badge tone="warning">missed</Badge>}
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />}
                  </div>
                  {n.body && <div className="mt-0.5 text-[11.5px] text-muted">{n.body}</div>}
                  <div className="mt-0.5 text-[10.5px] text-faint">{format(new Date(n.at), 'MMM d, h:mm a')}</div>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  {n.route && <IconBtn icon="ArrowUpRight" label="Open" className="h-6 w-6" onClick={() => { flow.markNotificationRead(n.id); navigate(n.route!); }} />}
                  {!n.read && <IconBtn icon="Check" label="Mark read" className="h-6 w-6" onClick={() => flow.markNotificationRead(n.id)} />}
                  {n.actions.length > 0 && <IconBtn icon="RefreshCw" label="Replay" className="h-6 w-6" onClick={() => systemNotify({ title: n.title, body: n.body, route: n.route })} />}
                </div>
              </div>
            ))}
            {!items.length && <EmptyState icon="Bell" title="Nothing here" body="Notifications you receive will be kept here with their actions." />}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel className="p-3">
            <SectionHead title="Scheduled reminders" subtitle="Persisted in the database, fired by the scheduler" />
            <div className="space-y-1">
              {upcoming.map((r) => (
                <div key={r.id} className="rounded-[10px] bg-s1 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <Icon name="AlarmClock" size={12} className="text-muted" />
                    <span className="flex-1 truncate text-[12px]">{r.title}</span>
                    <span className="num text-[10.5px] text-faint">{format(new Date(r.snoozedUntil ?? r.fireAt), 'MMM d, h:mm')}</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <button className="focusable chip text-[10px] hover:bg-s3" onClick={() => flow.snoozeReminder(r.id, 10)}>Snooze 10</button>
                    <button className="focusable chip text-[10px] hover:bg-s3" onClick={() => flow.deliverReminder(r.id)}>Fire now</button>
                    <button className="focusable chip text-[10px] hover:bg-s3" onClick={() => flow.deleteReminder(r.id)}>Cancel</button>
                  </div>
                </div>
              ))}
              {!upcoming.length && <div className="py-4 text-center text-[11.5px] text-faint">Nothing scheduled.</div>}
            </div>
            <Btn size="sm" variant="soft" icon="Plus" className="mt-2" onClick={() => {
              flow.addReminder({ targetKind: 'system', title: 'Stand up and stretch', body: 'You have been sitting for an hour.', fireAt: new Date(Date.now() + 5 * 60000).toISOString(), actions: ['snooze10', 'open'], route: '/notifications' });
              toast({ title: 'Reminder scheduled in 5 minutes', tone: 'success' });
            }}>Schedule in 5 minutes</Btn>
          </Panel>

          <Panel className="p-3">
            <SectionHead title="Delivery health" subtitle="What would stop a toast from appearing" />
            <div className="space-y-1.5 text-[11.5px]">
              <Row ok={health.supported} label="Notification API available" detail={health.supported ? 'yes' : 'not in this environment'} />
              <Row ok={health.permission === 'granted'} label="Permission granted" detail={health.permission} action={health.permission !== 'granted' ? { label: 'Request', run: async () => { const r = await requestNotificationPermission(); setHealth(notifyHealth()); toast({ title: `Permission: ${r}` }); } } : undefined} />
              <Row ok={!quiet} label="Not in quiet hours" detail={quiet ? 'held until quiet hours end' : 'clear'} />
              <Row ok={isElectron()} label="Main-process scheduler" detail={isElectron() ? 'active' : 'browser fallback'} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Btn size="sm" variant="ghost" icon="Settings" onClick={() => {
                if (isElectron()) window.open('ms-settings:notifications');
                else toast({ title: 'Open your OS notification settings', body: 'Windows: ms-settings:notifications', tone: 'default' });
              }}>Open system settings</Btn>
              <Btn size="sm" variant="ghost" icon="Info" onClick={() => setDevNote(!devNote)}>Why toasts fail</Btn>
            </div>
            {devNote && (
              <ul className="mt-2 space-y-1 text-[11px] text-muted">
                <li>· Missing AppUserModelID (must match the installer appId)</li>
                <li>· No Start Menu shortcut in development builds</li>
                <li>· Focus Assist / Do Not Disturb turned on</li>
                <li>· App notifications disabled in Windows Settings</li>
                <li>· Quiet hours inside Flow holding the reminder</li>
              </ul>
            )}
          </Panel>

          <Panel className="p-3">
            <SectionHead title="Rules" />
            <Toggle label="Master switch" checked={db.settings.notifications.enabled} onChange={(v) => flow.updateSettings((s) => ({ ...s, notifications: { ...s.notifications, enabled: v } }))} />
            <Toggle label="Sounds" checked={db.settings.notifications.sound} onChange={(v) => flow.updateSettings((s) => ({ ...s, notifications: { ...s.notifications, sound: v } }))} />
            <Toggle label="Quiet hours" description="Reminders are held, never dropped" checked={db.settings.notifications.quietHours.enabled}
              onChange={(v) => flow.updateSettings((s) => ({ ...s, notifications: { ...s.notifications, quietHours: { ...s.notifications.quietHours, enabled: v } } }))} />
            {db.settings.notifications.quietHours.enabled && (
              <div className="mt-1 flex gap-1.5">
                <TimeField label="Quiet hours start" value={db.settings.notifications.quietHours.from} onChange={(v) => flow.updateSettings((s) => ({ ...s, notifications: { ...s.notifications, quietHours: { ...s.notifications.quietHours, from: v } } }))} />
                <TimeField label="Quiet hours end" value={db.settings.notifications.quietHours.to} onChange={(v) => flow.updateSettings((s) => ({ ...s, notifications: { ...s.notifications, quietHours: { ...s.notifications.quietHours, to: v } } }))} />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ ok, label, detail, action }: { ok: boolean; label: string; detail: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={ok ? 'CircleCheck' : 'CircleAlert'} size={12} style={{ color: ok ? 'var(--success)' : 'var(--warning)' }} />
      <span className="flex-1">{label}</span>
      <span className="text-[10.5px] text-faint">{detail}</span>
      {action && <button onClick={action.run} className="focusable chip text-[10px] hover:bg-s3">{action.label}</button>}
    </div>
  );
}
