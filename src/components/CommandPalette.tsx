import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Combobox, ComboboxInput, ComboboxOptions, ComboboxOption, Dialog, DialogPanel } from '@headlessui/react';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { NAV, TOOLS } from '../lib/nav';
import { Icon } from './ui';
import { parseQuickMark } from '../lib/nlp';
import { download } from '../lib/platform';
import { cn } from '../lib/utils';

type Item = { id: string; label: string; hint?: string; icon: string; group: string; run: () => void };

export function CommandPalette() {
  const { paletteOpen, paletteQuery, closePalette } = useUI();
  const [query, setQuery] = useState(paletteQuery);
  const db = useFlow((s) => s.db);
  const flow = useFlow.getState();
  const navigate = useNavigate();
  const openPalette = useUI((s) => s.openPalette);
  const toast = useUI((s) => s.toast);

  const withNav = (route: string) => () => { closePalette(); navigate(route); };

  const items = useMemo<Item[]>(() => {
    const commands: Item[] = [
      { id: 'cmd-new-todo', label: 'New todo', hint: 'create', icon: 'Plus', group: 'Commands', run: () => { closePalette(); navigate('/todos?new=1'); } },
      { id: 'cmd-new-note', label: 'New note', hint: 'create', icon: 'NotebookPen', group: 'Commands', run: () => { closePalette(); navigate('/notes?new=1'); } },
      { id: 'cmd-new-habit', label: 'New habit', hint: 'create', icon: 'Flame', group: 'Commands', run: () => { closePalette(); navigate('/habits?new=1'); } },
      { id: 'cmd-new-mark', label: 'Add mark', hint: 'grades', icon: 'GraduationCap', group: 'Commands', run: () => { closePalette(); navigate('/grades?new=1'); } },
      { id: 'cmd-new-event', label: 'New calendar event', hint: 'schedule', icon: 'CalendarDays', group: 'Commands', run: () => { closePalette(); navigate('/calendar?new=1'); } },
      { id: 'cmd-start-focus', label: 'Start focus session', hint: 'pomodoro', icon: 'Timer', group: 'Commands', run: () => { flow.startFocus(); closePalette(); navigate('/focus'); toast({ title: 'Focus started', body: 'Your timer is running', tone: 'success' }); } },
      { id: 'cmd-pause-focus', label: 'Pause focus session', icon: 'Pause', group: 'Commands', run: () => { flow.pauseFocus(); closePalette(); } },
      { id: 'cmd-skip', label: 'Skip to next phase', icon: 'SkipForward', group: 'Commands', run: () => { flow.skipPhase(); closePalette(); } },
      { id: 'cmd-timer-tea', label: 'Start a 5 minute tea timer', icon: 'CupSoda', group: 'Commands', run: () => { flow.startTimer({ label: 'Tea', plannedMin: 5, kind: 'countdown' }); closePalette(); toast({ title: 'Tea timer started' }); } },
      { id: 'cmd-stop-all', label: 'Stop all running timers', icon: 'StopCircle', group: 'Commands', run: () => { flow.db.timers.filter((t) => t.running).forEach((t) => flow.finishTimer(t.id)); closePalette(); } },
      { id: 'cmd-theme', label: 'Toggle light / dark', icon: 'Contrast', group: 'Commands', run: () => { flow.updateSettings((s) => ({ ...s, theme: { ...s.theme, mode: s.theme.mode === 'dark' ? 'light' : 'dark' } })); closePalette(); } },
      { id: 'cmd-sound', label: 'Open Sound Studio', icon: 'AudioLines', group: 'Commands', run: () => { closePalette(); navigate('/sound'); } },
      { id: 'cmd-focusmode', label: 'Enter focus mode', icon: 'Crosshair', group: 'Commands', run: () => { useUI.getState().setFocusMode(true); closePalette(); navigate('/focus'); } },
      { id: 'cmd-export', label: 'Export everything as JSON', icon: 'Download', group: 'Commands', run: () => { download(`flow-backup-${new Date().toISOString().slice(0, 10)}.json`, flow.exportJSON(), 'application/json'); closePalette(); } },
      { id: 'cmd-undo', label: 'Undo last change', icon: 'Undo2', group: 'Commands', run: () => { flow.undo(); closePalette(); } },
      { id: 'cmd-settings', label: 'Open settings', icon: 'Settings', group: 'Commands', run: withNav('/settings') },
    ];

    const pages: Item[] = NAV.map((n) => ({ id: `page-${n.id}`, label: n.label, hint: n.route, icon: n.icon, group: 'Pages', run: withNav(n.route) }));

    const tools: Item[] = TOOLS.map((t) => ({
      id: `tool-${t.id}`, label: t.name, hint: t.group, icon: t.icon, group: 'Tools', run: withNav(t.route),
    }));

    const tags = Array.from(new Set([...db.todos.flatMap((t) => t.tags), ...db.notes.flatMap((n) => n.tags)]));

    const todos: Item[] = db.todos
      .filter((t) => t.status !== 'done' && t.status !== 'archived')
      .map((t) => ({
        id: `todo-${t.id}`, label: t.title, hint: t.categoryId ?? 'todo', icon: 'CheckSquare', group: 'Todos',
        run: () => { closePalette(); navigate('/todos'); setTimeout(() => flow.toggleTodo(t.id), 80); },
      }));

    const notes: Item[] = db.notes.map((n) => ({
      id: `note-${n.id}`, label: n.title, hint: n.folder, icon: 'NotebookPen', group: 'Notes',
      run: () => { closePalette(); navigate(`/notes?open=${n.id}`); },
    }));

    const habits: Item[] = db.habits.map((h) => ({
      id: `habit-${h.id}`, label: h.name, hint: 'habit', icon: h.icon, group: 'Habits',
      run: () => { closePalette(); navigate('/habits'); },
    }));

    const subjects: Item[] = db.subjects.map((s) => ({
      id: `subject-${s.id}`, label: s.name, hint: s.teacher, icon: s.icon, group: 'Subjects',
      run: () => { closePalette(); navigate(`/grades/${s.id}`); },
    }));

    const marks: Item[] = db.subjects.flatMap((s) =>
      s.categories.map((c) => ({ id: `${s.id}-${c.id}`, label: c.name, hint: `${s.name} category`, icon: 'Percent', group: 'Categories' })),
    ).map((m) => ({ ...m, run: withNav('/grades') }));

    return [...commands, ...pages, ...tools, ...todos, ...notes, ...habits, ...subjects, ...marks];
  }, [db, closePalette, navigate, flow, toast]);

  const q = query.trim();
  const prefix = q[0];
  const body = q.slice(1).trim().toLowerCase();

  const filtered = useMemo(() => {
    let pool = items;
    let needle = q.toLowerCase();
    if (prefix === '>') { pool = items.filter((i) => i.group === 'Commands'); needle = body; }
    else if (prefix === '/') { pool = items.filter((i) => i.group === 'Pages'); needle = body; }
    else if (prefix === '!') { pool = items.filter((i) => i.group === 'Tools'); needle = body; }
    else if (prefix === '@') { pool = items.filter((i) => i.group === 'Subjects'); needle = body; }
    else if (prefix === '?') { pool = items.filter((i) => i.group === 'Pages' && i.id === 'page-settings'); needle = ''; }
    const hits = needle
      ? pool.filter((i) => `${i.label} ${i.hint ?? ''} ${i.group}`.toLowerCase().includes(needle))
      : pool;
    return hits.slice(0, 60);
  }, [items, q, prefix, body]);

  const tagItems: Item[] = prefix === '#'
    ? Array.from(new Set([...db.todos.flatMap((t) => t.tags), ...db.notes.flatMap((n) => n.tags)]))
      .filter((t) => t.includes(body))
      .map((tag) => ({ id: `tag-${tag}`, label: `#${tag}`, icon: 'Tag', group: 'Tags', run: withNav(`/todos?tag=${tag}`) }))
    : [];

  const quickMark = useMemo(() => {
    const parsed = parseQuickMark(q, db.subjects);
    if (!parsed) return null;
    return parsed;
  }, [q, db.subjects]);

  const all = [...(quickMark ? [{
    id: 'quick-mark',
    label: `Add mark: ${quickMark.title} ${quickMark.score}/${quickMark.max}`,
    hint: db.subjects.find((s) => s.id === quickMark.subjectId)?.name,
    icon: 'Percent',
    group: 'Quick actions',
    run: () => {
      flow.addMark({
        subjectId: quickMark.subjectId, categoryId: quickMark.categoryId, title: quickMark.title,
        kind: quickMark.kind as never, score: quickMark.score, max: quickMark.max, status: 'graded', date: new Date().toISOString(),
      });
      toast({ title: 'Mark added', body: `${quickMark.title} ${quickMark.score}/${quickMark.max}`, tone: 'success' });
      closePalette();
    },
  } as Item] : []), ...tagItems, ...filtered];

  const groups = Array.from(new Set(all.map((i) => i.group)));

  return (
    <Dialog
      open={paletteOpen}
      onClose={() => { closePalette(); setQuery(''); }}
      className="relative z-[90]"
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="fixed inset-x-0 top-[10vh] mx-auto w-full max-w-2xl px-4">
        <DialogPanel className="panel-raised overflow-hidden">
          <Combobox
            value={null}
            onChange={(item: Item | null) => { item?.run(); setQuery(''); }}
            immediate
          >
            <div className="flex items-center gap-2.5 px-4 py-3">
              <Icon name="Search" size={16} className="text-faint" />
              <ComboboxInput
                autoFocus
                className="flex-1 bg-transparent text-[14px] placeholder:text-faint"
                placeholder="Search everything, or type > commands  /  pages  !  tools  @  subjects  #  tags"
                displayValue={() => query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd className="num rounded bg-s2 px-1.5 py-0.5 text-[10px] text-faint">ESC</kbd>
            </div>
            <div className="h-px w-full" style={{ background: 'color-mix(in srgb, var(--text-faint) 12%, transparent)' }} />
            <ComboboxOptions static className="max-h-[56vh] overflow-y-auto p-1.5">
              {groups.map((group) => (
                <div key={group} className="mb-1">
                  <div className="label px-2.5 py-1.5">{group}</div>
                  {all.filter((i) => i.group === group).map((item) => (
                    <ComboboxOption
                      key={item.id}
                      value={item}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] data-[focus]:bg-s3"
                    >
                      <Icon name={item.icon} size={15} className="text-muted" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="truncate text-[11px] text-faint">{item.hint}</span>}
                    </ComboboxOption>
                  ))}
                </div>
              ))}
              {!all.length && (
                <div className="px-3 py-8 text-center text-[12.5px] text-faint">
                  Nothing matches "{q}". Try `&gt;` for commands, `/` for pages, `!` for tools.
                </div>
              )}
            </ComboboxOptions>
            <div className="flex items-center gap-3 border-0 px-4 py-2 text-[11px] text-faint">
              <span className={cn('flex items-center gap-1')}><Icon name="Command" size={11} /> commands</span>
              <span className="flex items-center gap-1"><Icon name="Slash" size={11} /> pages</span>
              <span className="flex items-center gap-1"><Icon name="Zap" size={11} /> tools</span>
              <span className="ml-auto">Enter to run</span>
            </div>
          </Combobox>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
