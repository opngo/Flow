import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Combobox, ComboboxInput, ComboboxOptions, ComboboxOption, Dialog, DialogPanel } from '@headlessui/react';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { NAV, TOOLS } from '../lib/nav';
import { Icon } from './ui';
import { parseQuickMark } from '../lib/nlp';
import { isHabitScheduled } from '../lib/habits';
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
  const setQuickAdd = useUI((s) => s.setQuickAdd);
  const toast = useUI((s) => s.toast);

  const withNav = (route: string) => () => { closePalette(); navigate(route); };

  const items = useMemo<Item[]>(() => {
    const today = () => new Date().toISOString().slice(0, 10);
    const running = db.timers.filter((t) => t.running);

    /** Capture: every shape of thing you can type into one box, with the
     *  command already opened so you only fill the braces. */
    const capture: Item[] = [
      { id: 'capture-any', label: 'Capture anything', hint: 'one line, any type', icon: 'Command', group: 'Capture', run: () => { closePalette(); setQuickAdd(true); } },
      { id: 'capture-task', label: 'Capture a task', hint: '{type:task}', icon: 'CheckSquare', group: 'Capture', run: () => { closePalette(); setQuickAdd(true, '{type:task} '); } },
      { id: 'capture-habit', label: 'Capture a habit', hint: '{type:habit}', icon: 'Flame', group: 'Capture', run: () => { closePalette(); setQuickAdd(true, '{type:habit} '); } },
      { id: 'capture-note', label: 'Capture a note', hint: '{type:note}', icon: 'NotebookPen', group: 'Capture', run: () => { closePalette(); setQuickAdd(true, '{type:note} '); } },
      { id: 'capture-event', label: 'Capture an event', hint: '{type:event}', icon: 'CalendarDays', group: 'Capture', run: () => { closePalette(); setQuickAdd(true, '{type:event} '); } },
      { id: 'capture-mark', label: 'Capture a mark', hint: '{type:mark}', icon: 'Percent', group: 'Capture', run: () => { closePalette(); setQuickAdd(true, '{type:mark} '); } },
      { id: 'capture-focus', label: 'Start a focus block from a command', hint: '{type:focus}', icon: 'Timer', group: 'Capture', run: () => { closePalette(); setQuickAdd(true, '{type:focus} '); } },
      { id: 'capture-timer', label: 'Start a timer from a command', hint: '{type:timer}', icon: 'Hourglass', group: 'Capture', run: () => { closePalette(); setQuickAdd(true, '{type:timer} '); } },
    ];

    /** Focus: the whole session lifecycle, not just start and pause. */
    const focusItems: Item[] = [
      { id: 'focus-start', label: flow.db.focus?.running ? 'Focus is already running' : 'Start a focus session', hint: 'pomodoro', icon: 'Play', group: 'Focus', run: () => { flow.startFocus(); closePalette(); navigate('/focus'); } },
      { id: 'focus-pause', label: 'Pause the focus session', icon: 'Pause', group: 'Focus', run: () => { flow.pauseFocus(); closePalette(); toast({ title: 'Focus paused' }); } },
      { id: 'focus-resume', label: 'Resume the focus session', icon: 'Play', group: 'Focus', run: () => { flow.resumeFocus(); closePalette(); toast({ title: 'Focus resumed' }); } },
      { id: 'focus-skip', label: 'Skip to the next phase', icon: 'SkipForward', group: 'Focus', run: () => { flow.skipPhase(); closePalette(); } },
      { id: 'focus-extend', label: 'Add five minutes to this phase', icon: 'Plus', group: 'Focus', run: () => { flow.extendFocus(5); closePalette(); toast({ title: 'Five more minutes' }); } },
      { id: 'focus-end', label: 'End this focus block', icon: 'Square', group: 'Focus', run: () => { flow.finishPhase(); closePalette(); toast({ title: 'Block logged' }); } },
      { id: 'focus-reset', label: 'Reset the focus clock', icon: 'RotateCcw', group: 'Focus', run: () => { flow.resetFocus(); closePalette(); } },
      { id: 'focus-distraction', label: 'Log a distraction', icon: 'BellOff', group: 'Focus', run: () => { flow.bumpDistraction(); closePalette(); toast({ title: 'Distraction logged' }); } },
      { id: 'focus-mode', label: 'Enter focus mode', icon: 'Crosshair', group: 'Focus', run: () => { useUI.getState().setFocusMode(true); closePalette(); navigate('/focus'); } },
      { id: 'focus-link', label: 'Pick what to focus on', hint: 'subjects and tasks', icon: 'GraduationCap', group: 'Focus', run: withNav('/focus?pick=1') },
    ];

    /** Timers: one row per running timer so stopping is a single keystroke. */
    const timerItems: Item[] = [
      { id: 'timer-new', label: 'New countdown timer', hint: '5 minutes', icon: 'Hourglass', group: 'Timers', run: () => { flow.startTimer({ label: 'Timer', plannedMin: 5, kind: 'countdown' }); closePalette(); toast({ title: '5 minute timer started' }); } },
      { id: 'timer-stopwatch', label: 'Start a stopwatch', icon: 'Timer', group: 'Timers', run: () => { flow.startTimer({ label: 'Stopwatch', plannedMin: 0, kind: 'stopwatch' }); closePalette(); } },
      { id: 'timer-tea', label: 'Start a 5 minute tea timer', icon: 'CupSoda', group: 'Timers', run: () => { flow.startTimer({ label: 'Tea', plannedMin: 5, kind: 'countdown' }); closePalette(); toast({ title: 'Tea timer started' }); } },
      ...running.flatMap((t): Item[] => [
        { id: `timer-stop-${t.id}`, label: `Stop ${t.label}`, hint: 'running', icon: 'Square', group: 'Timers', run: () => { flow.finishTimer(t.id); closePalette(); toast({ title: `${t.label} stopped`, tone: 'success' }); } },
        { id: `timer-pause-${t.id}`, label: `Pause ${t.label}`, hint: 'running', icon: 'Pause', group: 'Timers', run: () => { flow.pauseTimer(t.id); closePalette(); } },
      ]),
      { id: 'timer-stop-all', label: 'Stop all running timers', icon: 'StopCircle', group: 'Timers', run: () => { running.forEach((t) => flow.finishTimer(t.id)); closePalette(); toast({ title: running.length ? `Stopped ${running.length} timer${running.length > 1 ? 's' : ''}` : 'Nothing was running' }); } },
      { id: 'timer-open', label: 'Open the timers page', icon: 'Hourglass', group: 'Timers', run: withNav('/timers') },
      { id: 'timer-immersive', label: 'Open the full-screen clock', icon: 'Maximize', group: 'Timers', run: () => { useUI.getState().setImmersive(true); closePalette(); } },
    ];

    /** Habits and marks: the two things you log rather than edit. */
    const habitItems: Item[] = [
      { id: 'habit-new', label: 'New habit', hint: 'create', icon: 'Flame', group: 'Habits', run: () => { closePalette(); navigate('/habits?new=1'); } },
      { id: 'habit-all', label: "Check in today's habits", hint: `${db.habits.length} habits`, icon: 'CheckCheck', group: 'Habits', run: () => {
        const date = today();
        db.habits.filter((h) => isHabitScheduled(h, new Date())).forEach((h) => flow.checkIn(h.id, date, h.target.type === 'boolean' ? 1 : h.target.value));
        closePalette();
        toast({ title: 'Day checked in', tone: 'success' });
      } },
      { id: 'habit-open', label: 'Open habits', icon: 'Flame', group: 'Habits', run: withNav('/habits') },
      ...db.habits.slice(0, 12).map((h): Item => ({
        id: `habit-check-${h.id}`, label: `Check in ${h.name}`, hint: 'today', icon: h.icon, group: 'Habits',
        run: () => { flow.checkIn(h.id, today(), h.target.type === 'boolean' ? 1 : h.target.value); closePalette(); toast({ title: `${h.name} checked in`, tone: 'success' }); },
      })),
      { id: 'mark-new', label: 'Add a mark', hint: 'grades', icon: 'Percent', group: 'Marks', run: () => { closePalette(); navigate('/grades?new=1'); } },
      { id: 'mark-open', label: 'Open the gradebook', icon: 'GraduationCap', group: 'Marks', run: withNav('/grades') },
      { id: 'note-new', label: 'New note', hint: 'create', icon: 'NotebookPen', group: 'Notes', run: () => { closePalette(); navigate('/notes?new=1'); } },
      { id: 'note-journal', label: 'Write today\u2019s journal entry', icon: 'Sun', group: 'Notes', run: withNav('/tools/journal') },
      { id: 'note-search', label: 'Search notes', icon: 'Search', group: 'Notes', run: withNav('/notes') },
    ];

    /** App-level switches. These change how the app looks, not what is in it. */
    const appItems: Item[] = [
      { id: 'app-notext', label: flow.db.settings.ui.labels === 'none' ? 'Show text again' : 'Hide all interface text', icon: 'Type', group: 'App', run: () => { closePalette(); flow.updateSettings((st) => ({ ...st, ui: { ...st.ui, labels: st.ui.labels === 'none' ? 'full' : 'none' } })); } },
      { id: 'app-heatmap', label: 'Toggle filled vertical heatmaps', hint: flow.db.settings.ui.heatmap, icon: 'ChartNoAxesColumn', group: 'App', run: () => { closePalette(); flow.updateSettings((st) => ({ ...st, ui: { ...st.ui, heatmap: st.ui.heatmap === 'filled' ? 'stepped' : 'filled' } })); } },
      { id: 'app-lock', label: 'Lock the app', icon: 'Lock', group: 'App', run: () => { closePalette(); useUI.getState().setLocked(true); } },
      { id: 'app-notifications-clear', label: 'Mark every notification read', icon: 'BellOff', group: 'App', run: () => { flow.markAllNotificationsRead(); closePalette(); } },
      { id: 'app-undo', label: 'Undo last change', icon: 'Undo2', group: 'App', run: () => { flow.undo(); closePalette(); } },
      { id: 'app-redo', label: 'Redo', icon: 'Redo2', group: 'App', run: () => { flow.redo(); closePalette(); } },
      { id: 'app-export', label: 'Export everything as JSON', icon: 'Download', group: 'App', run: () => { download(`flow-backup-${new Date().toISOString().slice(0, 10)}.json`, flow.exportJSON(), 'application/json'); closePalette(); } },
      { id: 'app-settings', label: 'Open settings', icon: 'Settings', group: 'App', run: withNav('/settings') },
    ];

    const commands: Item[] = [
      { id: 'cmd-new-event', label: 'New calendar event', hint: 'schedule', icon: 'CalendarDays', group: 'Commands', run: () => { closePalette(); navigate('/calendar?new=1'); } },
      { id: 'cmd-demo-load', label: 'Load demo data', icon: 'Sparkles', group: 'Commands', run: () => { flow.loadDemoData(); closePalette(); } },
      { id: 'cmd-demo-clear', label: 'Remove demo data', icon: 'Eraser', group: 'Commands', run: () => { flow.clearDemoData(); closePalette(); } },
      { id: 'cmd-theme', label: 'Toggle light / dark', icon: 'Contrast', group: 'Commands', run: () => { flow.updateSettings((s) => ({ ...s, theme: { ...s.theme, mode: s.theme.mode === 'dark' ? 'light' : 'dark' } })); closePalette(); } },
      { id: 'cmd-sound', label: 'Open Sound Studio', icon: 'AudioLines', group: 'Commands', run: () => { closePalette(); navigate('/sound'); } },
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

    return [
      ...capture, ...focusItems, ...timerItems, ...habitItems, ...commands, ...appItems,
      ...pages, ...tools, ...todos, ...notes, ...habits, ...subjects, ...marks,
    ];
  }, [db, closePalette, navigate, flow, toast]);

  const q = query.trim();
  const prefix = q[0];
  const body = q.slice(1).trim().toLowerCase();

  const filtered = useMemo(() => {
    let pool = items;
    let needle = q.toLowerCase();
    if (prefix === '>') {
      // Everything that acts rather than navigates, including capture.
      pool = items.filter((i) => ['Capture', 'Focus', 'Timers', 'Habits', 'Marks', 'Notes', 'Commands', 'App'].includes(i.group));
      needle = body;
    }
    else if (prefix === '+') { pool = items.filter((i) => i.group === 'Capture'); needle = body; }
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
                placeholder="Search everything, or type + capture  >  commands  /  pages  !  tools  @  subjects  #  tags"
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
              <span className="flex items-center gap-1"><Icon name="Plus" size={11} /> capture</span>
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
