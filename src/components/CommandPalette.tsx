import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Combobox, ComboboxInput, ComboboxOptions, ComboboxOption, Dialog, DialogPanel, Transition,
} from '@headlessui/react';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { NAV, TOOLS } from '../lib/nav';
import { Icon } from './ui';
import { parseQuickMark } from '../lib/nlp';
import { isHabitScheduled } from '../lib/habits';
import { download } from '../lib/platform';

type Item = {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: string;
  /** Words that should find this row even when the label does not. */
  keys?: string;
  run: () => void;
};

/**
 * The command bar.
 *
 * One plain text field. Nothing to memorise, no prefix syntax: what you type
 * narrows the list, and the list grows upward out of the field. The first rows
 * are always the things you can *make* — picking one opens that thing's own
 * creation dialog, so you never land in a text box full of command braces.
 */
export function CommandPalette() {
  const { paletteOpen, paletteQuery, closePalette } = useUI();
  const [query, setQuery] = useState(paletteQuery);
  const db = useFlow((s) => s.db);
  const flow = useFlow.getState();
  const navigate = useNavigate();
  const toast = useUI((s) => s.toast);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (paletteOpen) setQuery(paletteQuery); }, [paletteOpen, paletteQuery]);

  /** Close first, then walk to the page whose own dialog this is. */
  const open = (route: string) => () => { closePalette(); navigate(route); };

  const items = useMemo<Item[]>(() => {
    const today = () => new Date().toISOString().slice(0, 10);
    const running = db.timers.filter((t) => t.running);
    const firstSubject = db.subjects[0];
    const markRoute = firstSubject ? `/grades/${firstSubject.id}?newMark=1` : '/grades';

    /** Create: every row opens that thing's real creation dialog. */
    const create: Item[] = [
      { id: 'new-task', label: 'New task', hint: 'title, due, priority', icon: 'CheckSquare', group: 'Create', keys: 'todo add task reminder', run: open('/todos?new=1') },
      { id: 'new-habit', label: 'New habit', hint: 'what to repeat', icon: 'Flame', group: 'Create', keys: 'routine repeat streak', run: open('/habits?new=1') },
      { id: 'new-note', label: 'New note', hint: 'write it down', icon: 'NotebookPen', group: 'Create', keys: 'writing journal page', run: open('/notes?new=1') },
      { id: 'new-event', label: 'New event', hint: 'date and time', icon: 'CalendarDays', group: 'Create', keys: 'calendar schedule class lesson', run: open('/calendar?new=1') },
      { id: 'new-mark', label: 'New mark', hint: firstSubject ? firstSubject.name : 'needs a subject', icon: 'Percent', group: 'Create', keys: 'grade score result exam quiz', run: open(markRoute) },
      { id: 'new-goal', label: 'New goal', hint: 'target or streak', icon: 'Target', group: 'Create', keys: 'objective aim milestone', run: open('/goals?new=1') },
      { id: 'new-timer', label: 'New timer', hint: 'countdown or stopwatch', icon: 'Hourglass', group: 'Create', keys: 'kitchen countdown tea break', run: open('/timers?new=1') },
      { id: 'new-card', label: 'New flashcard', hint: deckHint(db.decks), icon: 'Layers', group: 'Create', keys: 'deck study revision recall', run: open('/flashcards?new=1') },
    ];

    /** Focus: the whole session lifecycle, not just start and pause. */
    const focusItems: Item[] = [
      { id: 'focus-start', label: flow.db.focus?.running ? 'Focus is already running' : 'Start a focus block', hint: 'pomodoro', icon: 'Play', group: 'Focus', run: () => { flow.startFocus(); closePalette(); navigate('/focus'); } },
      { id: 'focus-pause', label: 'Pause the focus block', icon: 'Pause', group: 'Focus', run: () => { flow.pauseFocus(); closePalette(); toast({ title: 'Focus paused' }); } },
      { id: 'focus-resume', label: 'Resume the focus block', icon: 'Play', group: 'Focus', run: () => { flow.resumeFocus(); closePalette(); toast({ title: 'Focus resumed' }); } },
      { id: 'focus-skip', label: 'Skip to the next phase', icon: 'SkipForward', group: 'Focus', run: () => { flow.skipPhase(); closePalette(); } },
      { id: 'focus-extend', label: 'Add five minutes to this phase', icon: 'Plus', group: 'Focus', run: () => { flow.extendFocus(5); closePalette(); toast({ title: 'Five more minutes' }); } },
      { id: 'focus-end', label: 'End this focus block', icon: 'Square', group: 'Focus', run: () => { flow.finishPhase(); closePalette(); toast({ title: 'Block logged' }); } },
      { id: 'focus-reset', label: 'Reset the focus clock', icon: 'RotateCcw', group: 'Focus', run: () => { flow.resetFocus(); closePalette(); } },
      { id: 'focus-distraction', label: 'Log a distraction', icon: 'BellOff', group: 'Focus', run: () => { flow.bumpDistraction(); closePalette(); toast({ title: 'Distraction logged' }); } },
      { id: 'focus-mode', label: 'Enter focus mode', icon: 'Crosshair', group: 'Focus', run: () => { useUI.getState().setFocusMode(true); closePalette(); navigate('/focus'); } },
      { id: 'focus-open', label: 'Open focus', icon: 'Timer', group: 'Focus', run: open('/focus') },
    ];

    /** Timers: one row per running timer so stopping is a single keystroke. */
    const timerItems: Item[] = [
      { id: 'timer-stopwatch', label: 'Start a stopwatch', icon: 'Timer', group: 'Timers', run: () => { flow.startTimer({ label: 'Stopwatch', plannedMin: 0, kind: 'stopwatch' }); closePalette(); } },
      { id: 'timer-tea', label: 'Start a five minute tea timer', icon: 'CupSoda', group: 'Timers', run: () => { flow.startTimer({ label: 'Tea', plannedMin: 5, kind: 'countdown' }); closePalette(); toast({ title: 'Tea timer started' }); } },
      ...running.flatMap((t): Item[] => [
        { id: `timer-stop-${t.id}`, label: `Stop ${t.label}`, hint: 'running', icon: 'Square', group: 'Timers', run: () => { flow.finishTimer(t.id); closePalette(); toast({ title: `${t.label} stopped`, tone: 'success' }); } },
        { id: `timer-pause-${t.id}`, label: `Pause ${t.label}`, hint: 'running', icon: 'Pause', group: 'Timers', run: () => { flow.pauseTimer(t.id); closePalette(); } },
      ]),
      { id: 'timer-stop-all', label: 'Stop all running timers', icon: 'StopCircle', group: 'Timers', run: () => { running.forEach((t) => flow.finishTimer(t.id)); closePalette(); toast({ title: running.length ? `Stopped ${running.length} timer${running.length > 1 ? 's' : ''}` : 'Nothing was running' }); } },
      { id: 'timer-open', label: 'Open the timers page', icon: 'Hourglass', group: 'Timers', run: open('/timers') },
      { id: 'timer-immersive', label: 'Open the full-screen clock', icon: 'Maximize', group: 'Timers', run: () => { useUI.getState().setImmersive(true); closePalette(); } },
    ];

    /** Habits and marks: the two things you log rather than edit. */
    const habitItems: Item[] = [
      { id: 'habit-all', label: 'Check in every habit due today', hint: `${db.habits.length} habits`, icon: 'CheckCheck', group: 'Habits', run: () => {
        const date = today();
        db.habits.filter((h) => isHabitScheduled(h, new Date())).forEach((h) => flow.checkIn(h.id, date, h.target.type === 'boolean' ? 1 : h.target.value));
        closePalette();
        toast({ title: 'Day checked in', tone: 'success' });
      } },
      { id: 'habit-open', label: 'Open habits', icon: 'Flame', group: 'Habits', run: open('/habits') },
      ...db.habits.slice(0, 12).map((h): Item => ({
        id: `habit-check-${h.id}`, label: `Check in ${h.name}`, hint: 'today', icon: h.icon, group: 'Habits',
        run: () => { flow.checkIn(h.id, today(), h.target.type === 'boolean' ? 1 : h.target.value); closePalette(); toast({ title: `${h.name} checked in`, tone: 'success' }); },
      })),
    ];

    /** App-level switches. These change how the app looks, not what is in it. */
    const appItems: Item[] = [
      { id: 'app-notext', label: flow.db.settings.ui.labels === 'none' ? 'Show text again' : 'Hide all interface text', icon: 'Type', group: 'App', run: () => { closePalette(); flow.updateSettings((st) => ({ ...st, ui: { ...st.ui, labels: st.ui.labels === 'none' ? 'full' : 'none' } })); } },
      { id: 'app-heatmap', label: 'Toggle filled vertical heatmaps', hint: flow.db.settings.ui.heatmap, icon: 'ChartNoAxesColumn', group: 'App', run: () => { closePalette(); flow.updateSettings((st) => ({ ...st, ui: { ...st.ui, heatmap: st.ui.heatmap === 'filled' ? 'stepped' : 'filled' } })); } },
      { id: 'app-theme', label: 'Toggle light and dark', icon: 'Contrast', group: 'App', run: () => { flow.updateSettings((s) => ({ ...s, theme: { ...s.theme, mode: s.theme.mode === 'dark' ? 'light' : 'dark' } })); closePalette(); } },
      { id: 'app-lock', label: 'Lock the app', icon: 'Lock', group: 'App', run: () => { closePalette(); useUI.getState().setLocked(true); } },
      { id: 'app-notifications-clear', label: 'Mark every notification read', icon: 'BellOff', group: 'App', run: () => { flow.markAllNotificationsRead(); closePalette(); } },
      { id: 'app-undo', label: 'Undo the last change', icon: 'Undo2', group: 'App', run: () => { flow.undo(); closePalette(); } },
      { id: 'app-redo', label: 'Redo', icon: 'Redo2', group: 'App', run: () => { flow.redo(); closePalette(); } },
      { id: 'app-export', label: 'Export everything as JSON', icon: 'Download', group: 'App', run: () => { download(`flow-backup-${new Date().toISOString().slice(0, 10)}.json`, flow.exportJSON(), 'application/json'); closePalette(); } },
      { id: 'app-demo-load', label: 'Load demo data', icon: 'Sparkles', group: 'App', run: () => { flow.loadDemoData(); closePalette(); } },
      { id: 'app-demo-clear', label: 'Remove demo data', icon: 'Eraser', group: 'App', run: () => { flow.clearDemoData(); closePalette(); } },
      { id: 'app-sound', label: 'Open Sound Studio', icon: 'AudioLines', group: 'App', run: open('/sound') },
      { id: 'app-settings', label: 'Open settings', icon: 'Settings', group: 'App', run: open('/settings') },
    ];

    const pages: Item[] = NAV.map((n) => ({ id: `page-${n.id}`, label: n.label, icon: n.icon, group: 'Go to', run: open(n.route) }));
    const tools: Item[] = TOOLS.map((t) => ({ id: `tool-${t.id}`, label: t.name, hint: t.group, icon: t.icon, group: 'Go to', run: open(t.route) }));

    const todos: Item[] = db.todos
      .filter((t) => t.status !== 'done' && t.status !== 'archived')
      .map((t) => ({
        id: `todo-${t.id}`, label: t.title, hint: 'task', icon: 'CheckSquare', group: 'Tasks',
        run: () => { closePalette(); navigate('/todos'); setTimeout(() => flow.toggleTodo(t.id), 80); },
      }));

    const notes: Item[] = db.notes.map((n) => ({
      id: `note-${n.id}`, label: n.title, hint: n.folder, icon: 'NotebookPen', group: 'Notes',
      run: open(`/notes?open=${n.id}`),
    }));

    const subjects: Item[] = db.subjects.map((s) => ({
      id: `subject-${s.id}`, label: s.name, hint: s.teacher, icon: s.icon, group: 'Subjects',
      run: open(`/grades/${s.id}`),
    }));

    return [...create, ...focusItems, ...timerItems, ...habitItems, ...appItems, ...pages, ...tools, ...todos, ...notes, ...subjects];
  }, [db, closePalette, navigate, flow, toast]);

  const tagItems: Item[] = useMemo(() => {
    const needle = query.trim().replace(/^#/, '').toLowerCase();
    if (!needle) return [];
    return Array.from(new Set([...db.todos.flatMap((t) => t.tags), ...db.notes.flatMap((n) => n.tags)]))
      .filter((tag) => tag.includes(needle))
      .slice(0, 4)
      .map((tag) => ({ id: `tag-${tag}`, label: `Everything tagged #${tag}`, hint: 'tag', icon: 'Tag', group: 'Tags', run: open(`/todos?tag=${tag}`) }));
  }, [query, db.todos, db.notes]);

  /** `Chem quiz 18/20` typed straight into the bar is a mark you already took. */
  const quickMark = useMemo(() => parseQuickMark(query, db.subjects), [query, db.subjects]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all: Item[] = [
      ...(quickMark ? [{
        id: 'quick-mark',
        label: `Record a mark: ${quickMark.title} ${quickMark.score}/${quickMark.max}`,
        hint: db.subjects.find((s) => s.id === quickMark.subjectId)?.name,
        icon: 'Percent',
        group: 'Create',
        run: () => {
          flow.addMark({
            subjectId: quickMark.subjectId, categoryId: quickMark.categoryId, title: quickMark.title,
            kind: quickMark.kind as never, score: quickMark.score, max: quickMark.max, status: 'graded', date: new Date().toISOString(),
          });
          toast({ title: 'Mark added', body: `${quickMark.title} ${quickMark.score}/${quickMark.max}`, tone: 'success' });
          closePalette();
        },
      } as Item] : []),
      ...tagItems,
      ...items,
    ];
    if (!needle) return all.filter((i) => i.group === 'Create' || i.group === 'Focus').slice(0, 10);
    const words = needle.split(/\s+/);
    return all
      .filter((i) => {
        const hay = `${i.label} ${i.hint ?? ''} ${i.keys ?? ''} ${i.group}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 40);
  }, [items, tagItems, quickMark, query, db.subjects, flow, toast, closePalette]);

  const groups = Array.from(new Set(results.map((i) => i.group)));

  return (
    <Transition show={paletteOpen} as={React.Fragment}>
    <Dialog
      onClose={() => { closePalette(); setQuery(''); }}
      className="relative z-[90]"
      initialFocus={inputRef}
    >
      <Transition.Child
        enter="duration-200 ease-out" enterFrom="opacity-0" enterTo="opacity-100"
        leave="duration-150 ease-in" leaveFrom="opacity-100" leaveTo="opacity-0"
      >
        <div className="fixed inset-0 bg-black/35 backdrop-blur-[2px]" />
      </Transition.Child>
      {/* Anchored low on the glass so the panel has room to grow upward. */}
      <div className="fixed inset-x-0 bottom-[14vh] mx-auto flex w-full max-w-xl flex-col justify-end px-4">
        {/* It rises out of the bottom edge: the bar arrives from the direction
            the panel grows in, so the movement matches the layout. */}
        <Transition.Child
          enter="duration-200 ease-out" enterFrom="opacity-0 translate-y-4 scale-[0.985]" enterTo="opacity-100 translate-y-0 scale-100"
          leave="duration-150 ease-in" leaveFrom="opacity-100 translate-y-0 scale-100" leaveTo="opacity-0 translate-y-2 scale-[0.99]"
        >
        <DialogPanel className="panel-raised overflow-hidden">
          <Combobox
            value={null}
            onChange={(item: Item | null) => { item?.run(); setQuery(''); }}
            immediate
          >
            {/* The list is above the field: typing pushes the panel up, never down. */}
            {results.length > 0 && (
              <ComboboxOptions static className="command-list max-h-[46vh] overflow-y-auto p-1.5">
                {groups.map((group) => (
                  <div key={group} className="mb-0.5">
                    <div className="label command-group px-2.5 pb-1 pt-2">{group}</div>
                    {results.filter((i) => i.group === group).map((item) => (
                      <ComboboxOption
                        key={item.id}
                        value={item}
                        className="group flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] data-[focus]:bg-s3"
                      >
                        <Icon name={item.icon} size={15} className="text-muted group-data-[focus]:text-ink" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && <span className="command-hint truncate text-[11px] text-faint">{item.hint}</span>}
                        <Icon name="CornerDownLeft" size={12} className="text-faint opacity-0 group-data-[focus]:opacity-100" />
                      </ComboboxOption>
                    ))}
                  </div>
                ))}
              </ComboboxOptions>
            )}
            <div className="flex items-center gap-2.5 px-4 py-3">
              <Icon name="Search" size={16} className="text-faint" />
              <ComboboxInput
                ref={inputRef}
                autoFocus
                className="flex-1 bg-transparent text-[14px] placeholder:text-faint"
                placeholder={results.length && !query.trim() ? 'Type to narrow, or pick what to make' : 'New task, habit, note… or anything in Flow'}
                displayValue={() => query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button
                  onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                  className="focusable rounded-[7px] px-1.5 py-0.5 text-[10px] text-faint hover:bg-s2 hover:text-ink"
                  aria-label="Clear the query"
                >
                  Clear
                </button>
              ) : (
                <kbd className="num rounded bg-s2 px-1.5 py-0.5 text-[10px] text-faint">ESC</kbd>
              )}
            </div>
          </Combobox>
        </DialogPanel>
        </Transition.Child>
      </div>
    </Dialog>
    </Transition>
  );
}

function deckHint(decks: Array<{ name: string }>) {
  if (!decks.length) return 'needs a deck';
  return decks[0].name;
}
