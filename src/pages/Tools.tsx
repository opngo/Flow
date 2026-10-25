import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { Btn, Chip, Icon, Panel, SectionHead, TextInput, Toggle } from '../components/ui';
import { TOOLS, TOOL_GROUPS } from '../lib/nav';

/** A glyph per filter so the row survives no-text mode. */
const GROUP_ICON: Record<string, string> = {
  All: 'Grid2x2', Enabled: 'CheckCheck', Pinned: 'Pin',
};
import { cn } from '../lib/utils';

export default function Tools() {
  const navigate = useNavigate();
  const db = useFlow((s) => s.db);
  const updateSettings = useFlow((s) => s.updateSettings);
  const openPalette = useUI((s) => s.openPalette);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');

  const enabled = db.settings.enabledTools;
  const filtered = useMemo(() => TOOLS.filter((t) => {
    if (group === 'Enabled' && !enabled.includes(t.id)) return false;
    if (group === 'Pinned' && !db.settings.sidebar.items.some((i) => i.route === t.route)) return false;
    if (group !== 'All' && group !== 'Enabled' && group !== 'Pinned' && t.group !== group) return false;
    const q = query.toLowerCase();
    return !q || `${t.name} ${t.desc} ${t.group} ${t.keywords ?? ''}`.toLowerCase().includes(q);
  }), [query, group, enabled, db.settings.sidebar.items]);

  const toggleEnabled = (id: string) => {
    updateSettings((s) => ({
      ...s,
      enabledTools: s.enabledTools.includes(id) ? s.enabledTools.filter((x) => x !== id) : [...s.enabledTools, id],
    }));
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Tools</h1>
          <div className="mt-0.5 text-[12px] text-muted">{TOOLS.length} tools · every one reachable from the sidebar, palette and widget gallery</div>
        </div>
        <div className="flex gap-2">
          <Btn variant="soft" icon="Command" onClick={() => openPalette('!')}>Search tools in palette</Btn>
          <Btn variant="soft" icon="LayoutGrid" onClick={() => navigate('/tools/widgets')}>Widget gallery</Btn>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-[12px] bg-s1 px-3">
          <Icon name="Search" size={14} className="text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search 140 tools" className="h-10 flex-1 bg-transparent text-[13px] placeholder:text-faint" />
          {query && <button onClick={() => setQuery('')} className="focusable text-faint hover:text-ink"><Icon name="X" size={13} /></button>}
        </div>
        <div className="flex flex-wrap gap-1">
          {['All', 'Enabled', 'Pinned', ...TOOL_GROUPS].map((g) => (
            <button key={g} onClick={() => setGroup(g)} data-tip={`${g} tools`}
              className={cn('focusable chip', group === g && 'text-accent')}
              style={group === g ? { background: 'var(--accent-soft)' } : undefined}>
              <Icon name={GROUP_ICON[g] ?? 'Boxes'} size={11} />
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {TOOL_GROUPS.filter((g) => filtered.some((t) => t.group === g)).map((g) => (
          <div key={g}>
            <SectionHead title={g} subtitle={`${filtered.filter((t) => t.group === g).length} tools`} />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.filter((t) => t.group === g).map((t) => {
                const on = enabled.includes(t.id);
                return (
                  <Panel key={t.id} className="group flex items-start gap-2.5 p-3">
                    <button onClick={() => navigate(t.route)} className="focusable flex min-w-0 flex-1 items-start gap-2.5 text-left">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-s2 text-muted group-hover:text-accent">
                        <Icon name={t.icon} size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium">{t.name}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">{t.desc}</span>
                      </span>
                    </button>
                    <button onClick={() => toggleEnabled(t.id)} title={on ? 'Enabled' : 'Disabled'}
                      className="focusable mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]"
                      style={{ background: on ? 'var(--accent-soft)' : 'var(--surface-2)', color: on ? 'var(--accent)' : 'var(--text-faint)' }}>
                      <Icon name={on ? 'Check' : 'Plus'} size={11} />
                    </button>
                  </Panel>
                );
              })}
            </div>
          </div>
        ))}
        {!filtered.length && <div className="py-12 text-center text-[12.5px] text-faint">No tool matches "{query}".</div>}
      </div>
    </div>
  );
}
