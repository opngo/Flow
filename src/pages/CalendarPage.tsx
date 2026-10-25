import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  addDays, addMonths, addWeeks, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns';
import { motion } from 'framer-motion';
import { useFlow } from '../store';
import {
  Badge, Btn, Chip, ColorPicker, DateTimeField, Field, Icon, IconBtn, Modal, Panel, PlusBtn, SectionHead,
  Select, TextArea, TextInput, Toggle,
} from '../components/ui';
import { openContextMenu } from '../components/ContextMenu';
import { isHabitScheduled } from '../lib/habits';
import { cn, fmtTime } from '../lib/utils';
import type { CalendarEvent } from '../lib/types';

type View = 'month' | 'week' | 'day';

/** Grid geometry. One hour is one fixed slice, so an event's height is its
 *  duration and its top is its start minute — no fudging. */
const HOUR_H = 54;
const DAY_MIN = 24 * 60;
const VIEW_LABEL: Record<View, string> = { month: 'Month', week: 'Week', day: 'Day' };

const minutesInto = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
const fmtRange = (a: Date, b: Date) =>
  `${format(a, 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`;

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const db = useFlow((s) => s.db);
  const addEvent = useFlow((s) => s.addEvent);
  const updateEvent = useFlow((s) => s.updateEvent);
  const deleteEvent = useFlow((s) => s.deleteEvent);
  const addTodo = useFlow((s) => s.addTodo);

  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [panelDay, setPanelDay] = useState<Date | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<CalendarEvent>>({});
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const weekStart = db.settings.behavior.weekStart as 0 | 1;

  useEffect(() => {
    if (params.get('new')) {
      setForm({ title: '', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString(), color: '#7c8cff' });
      setEditing(null);
      setOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const matches = (e: CalendarEvent) => !query.trim()
    || `${e.title} ${e.location ?? ''} ${e.notes ?? ''} ${db.subjects.find((s) => s.id === e.subjectId)?.name ?? ''}`
      .toLowerCase().includes(query.trim().toLowerCase());

  const eventsOn = (day: Date) => db.events
    .filter((e) => isSameDay(new Date(e.start), day) && matches(e))
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));

  /** Everything that shares a date with the day: events, due tasks, pending
   *  assessments, habits and logged sessions. The panel and the agenda read
   *  from here so the numbers always agree. */
  const dayItems = (day: Date) => ({
    events: eventsOn(day),
    assessments: db.marks.filter((m) => m.status === 'pending' && isSameDay(new Date(m.date), day) && (!query.trim() || m.title.toLowerCase().includes(query.trim().toLowerCase()))),
    todos: db.todos.filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), day) && (!query.trim() || t.title.toLowerCase().includes(query.trim().toLowerCase()))),
    habits: db.habits.filter((h) => isHabitScheduled(h, day)),
    sessions: db.focusSessions.filter((f) => isSameDay(new Date(f.startedAt), day)).length,
  });

  const openNew = (start: Date, minutes = 60) => {
    setEditing(null);
    setForm({
      title: '',
      start: start.toISOString(),
      end: new Date(start.getTime() + minutes * 60000).toISOString(),
      color: db.subjects[0]?.color ?? '#7c8cff',
      allDay: false,
    });
    setOpen(true);
  };

  const openEvent = (e: CalendarEvent) => {
    setEditing(e);
    setForm(e);
    setSelectedEvent(e.id);
    setOpen(true);
  };

  const saveEvent = () => {
    if (!form.title?.trim()) return;
    if (editing) updateEvent(editing.id, form);
    else {
      const created = addEvent(form);
      if (created?.id) setSelectedEvent(created.id);
    }
    setOpen(false);
  };

  const step = (dir: -1 | 1) => {
    setCursor((c) => (view === 'month' ? addMonths(c, dir) : view === 'week' ? addWeeks(c, dir) : addDays(c, dir)));
  };

  /* ------------------------------------------------------------ headers */
  const range = view === 'month'
    ? fmtRange(startOfMonth(cursor), addDays(startOfMonth(addMonths(cursor, 1)), -1))
    : view === 'week'
      ? fmtRange(startOfWeek(cursor, { weekStartsOn: weekStart }), addDays(startOfWeek(cursor, { weekStartsOn: weekStart }), 6))
      : format(cursor, 'EEEE');

  const weekNumber = format(cursor, 'w');

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header: a date badge, the span it covers, then the controls. */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <div className="flex items-center gap-3">
          <div className="flex h-[58px] w-[58px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-s1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">{format(cursor, 'MMM')}</span>
            <span className="num text-[20px] font-semibold leading-none">{format(cursor, 'd')}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[19px] font-semibold tracking-tight">{format(cursor, view === 'day' ? 'MMMM yyyy' : 'MMMM yyyy')}</h1>
              <span className="chip" data-label="meta">Week {weekNumber}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-muted" data-label="minor">{range}</div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {searching ? (
            <div className="flex h-9 items-center gap-1.5 rounded-[12px] bg-s2 px-2.5">
              <Icon name="Search" size={13} className="text-faint" />
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setSearching(false); } }}
                placeholder="Filter events"
                className="h-9 w-36 bg-transparent text-[12.5px] placeholder:text-faint"
              />
              <button onClick={() => { setQuery(''); setSearching(false); }} aria-label="Close search" data-tip="Close search" className="focusable flex h-5 w-5 items-center justify-center rounded-full text-faint hover:bg-s3">
                <Icon name="X" size={11} />
              </button>
            </div>
          ) : (
            <IconBtn icon="Search" label="Search events" onClick={() => { setSearching(true); requestAnimationFrame(() => searchRef.current?.focus()); }} className="bg-s1" />
          )}

          <div className="flex items-center rounded-[12px] bg-s1 p-0.5">
            <button onClick={() => step(-1)} aria-label="Previous" data-tip="Previous" className="focusable flex h-8 w-8 items-center justify-center rounded-[10px] text-muted hover:bg-s2 hover:text-ink">
              <Icon name="ChevronLeft" size={15} />
            </button>
            <button onClick={() => setCursor(new Date())} className="focusable h-8 rounded-[10px] px-2.5 text-[12.5px] text-ink hover:bg-s2">Today</button>
            <button onClick={() => step(1)} aria-label="Next" data-tip="Next" className="focusable flex h-8 w-8 items-center justify-center rounded-[10px] text-muted hover:bg-s2 hover:text-ink">
              <Icon name="ChevronRight" size={15} />
            </button>
          </div>

          <Select value={view} onChange={(v) => setView(v as View)} className="w-[132px]"
            options={[{ value: 'month', label: 'Month view' }, { value: 'week', label: 'Week view' }, { value: 'day', label: 'Day view' }]} />

          <PlusBtn label="Add event" onClick={() => {
            const start = new Date(cursor);
            if (view === 'day' || (view === 'month' && isSameMonth(cursor, new Date()))) start.setHours(new Date().getHours() + 1, 0, 0, 0);
            else start.setHours(9, 0, 0, 0);
            openNew(start);
          }} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === 'month' && (
            <MonthGrid
              cursor={cursor}
              weekStart={weekStart}
              eventsOn={eventsOn}
              dayItems={dayItems}
              onPickDay={(d) => { setCursor(d); setPanelDay(d); }}
              onMore={(d) => { setCursor(d); setView('day'); setSelectedEvent(eventsOn(d)[0]?.id ?? null); }}
              onOpenEvent={openEvent}
              panelDay={panelDay}
            />
          )}
          {view === 'week' && (
            <WeekGrid
              cursor={cursor}
              weekStart={weekStart}
              eventsOn={eventsOn}
              selectedId={selectedEvent}
              onPickEvent={(e) => { setCursor(new Date(e.start)); setView('day'); setSelectedEvent(e.id); }}
              onOpenEvent={openEvent}
              onCreate={openNew}
            />
          )}
          {view === 'day' && (
            <DayGrid
              day={cursor}
              events={eventsOn(cursor)}
              selectedId={selectedEvent}
              onSelect={setSelectedEvent}
              onOpenEvent={openEvent}
              onCreate={openNew}
            />
          )}
        </div>

        {view === 'month' && panelDay && (
          <MonthDayRail
            day={panelDay}
            items={dayItems(panelDay)}
            subjects={db.subjects}
            onClose={() => setPanelDay(null)}
            onEditEvent={openEvent}
            onNewEvent={() => { const start = new Date(panelDay); start.setHours(9, 0, 0, 0); openNew(start); }}
            onOpenDay={() => { setCursor(panelDay); setView('day'); }}
          />
        )}

        {view === 'day' && (
          <DayRail
            cursor={cursor}
            onCursor={setCursor}
            weekStart={weekStart}
            events={eventsOn(cursor)}
            selectedId={selectedEvent}
            onSelect={setSelectedEvent}
            onOpenEvent={openEvent}
            onCreate={() => { const start = new Date(cursor); start.setHours(9, 0, 0, 0); openNew(start); }}
            subjects={db.subjects}
            onDelete={(id) => { deleteEvent(id); setSelectedEvent(null); }}
            onDuplicate={(e) => {
              const created = addEvent({ ...e, title: `${e.title} copy` });
              if (created?.id) setSelectedEvent(created.id);
            }}
            onPrep={(e) => addTodo({ title: `Prepare: ${e.title}`, dueAt: new Date(new Date(e.start).getTime() - 86400000).toISOString(), subjectId: e.subjectId })}
          />
        )}
      </div>

      <EventDialog
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        form={form}
        setForm={setForm}
        subjects={db.subjects}
        onSave={saveEvent}
        onDelete={editing ? () => { deleteEvent(editing.id); setOpen(false); } : undefined}
        onPrep={editing ? () => {
          addTodo({ title: `Prepare: ${editing.title}`, dueAt: new Date(new Date(editing.start).getTime() - 86400000).toISOString(), subjectId: editing.subjectId });
          setOpen(false);
        } : undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ month */

function MonthGrid({ cursor, weekStart, eventsOn, dayItems, onPickDay, onMore, onOpenEvent, panelDay }: {
  cursor: Date; weekStart: 0 | 1;
  eventsOn: (d: Date) => CalendarEvent[];
  dayItems: (d: Date) => { events: CalendarEvent[]; assessments: unknown[]; todos: unknown[]; habits: unknown[] };
  onPickDay: (d: Date) => void;
  onMore: (d: Date) => void;
  onOpenEvent: (e: CalendarEvent) => void;
  panelDay: Date | null;
}) {
  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: weekStart });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  return (
    <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="grid shrink-0 grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="label px-2 py-2" data-label="meta">{format(addDays(gridStart, i), 'EEE')}</div>
        ))}
      </div>
      {/* The grid separates by tone, not by drawn rules: a one pixel gap over
          the surface colour reads as a divided calendar without a single border. */}
      <div className="grid min-h-0 flex-1 auto-rows-[minmax(84px,1fr)] grid-cols-7 gap-px overflow-y-auto"
        style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)' }}>
        {cells.map((day) => {
          const items = dayItems(day);
          const events = eventsOn(day);
          const inMonth = isSameMonth(day, cursor);
          const todayHere = isSameDay(day, today);
          const selected = panelDay && isSameDay(day, panelDay);
          const overflow = events.length - 2;
          return (
            <div key={day.toISOString()}
              className={cn('group relative flex min-h-0 flex-col gap-1 p-1.5 transition-colors',
                inMonth ? 'bg-s1/40' : 'bg-s1/10 opacity-60',
                selected && 'bg-s2/70')}
              style={{
                boxShadow: 'inset -1px -1px 0 0 color-mix(in srgb, var(--text-faint) 7%, transparent)',
                ...(selected ? { background: 'color-mix(in srgb, var(--accent) 10%, var(--surface-1))' } : null),
              }}
            >
              <button onClick={() => onPickDay(day)} aria-pressed={!!selected}
                aria-label={`Open ${format(day, 'EEEE d MMMM')}`}
                className="focusable flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] transition-colors hover:bg-s2 num"
                style={todayHere ? { background: 'var(--accent)', color: '#fff', fontWeight: 600 } : undefined}>
                {format(day, 'd')}
              </button>

              <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                {events.slice(0, 2).map((e) => (
                  <button key={e.id}
                    onClick={() => { onPickDay(day); onOpenEvent(e); }}
                    onContextMenu={(ev) => openContextMenu(ev, [
                      { label: 'Open event', icon: 'PenLine', onClick: () => onOpenEvent(e) },
                      { label: 'Show this day', icon: 'CalendarDays', onClick: () => onMore(day) },
                    ], e.title)}
                    className="focusable flex w-full items-center gap-1 rounded-[6px] px-1.5 py-[3px] text-left transition-transform hover:brightness-110"
                    style={{ background: `color-mix(in srgb, ${e.color} 20%, transparent)` }}>
                    {!e.allDay && <span className="num shrink-0 text-[9.5px]" style={{ color: e.color }}>{fmtTime(e.start)}</span>}
                    <span className="truncate text-[10.5px]" style={{ color: e.color }}>{e.title}</span>
                  </button>
                ))}
                {overflow > 0 && (
                  <button onClick={() => onMore(day)} className="focusable self-start rounded-[6px] px-1.5 text-[10px] text-faint hover:bg-s2 hover:text-ink">
                    {overflow} more
                  </button>
                )}
                {items.habits.length > 0 && (
                  <div className="mt-0.5 flex gap-0.5" aria-label={`${items.habits.length} habits due`}>
                    {items.habits.slice(0, 5).map((h) => {
                      const habit = h as { id: string; color: string };
                      return <span key={habit.id} className="h-1 w-1 rounded-full" style={{ background: habit.color }} />;
                    })}
                  </div>
                )}
              </div>

              <button onClick={() => onMore(day)} aria-label={`Add to ${format(day, 'd MMMM')}`} data-tip="Open day"
                className="focusable absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-[6px] text-faint opacity-0 transition-opacity hover:bg-s2 hover:text-ink group-hover:opacity-100">
                <Icon name="ArrowUpRight" size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ week / day */

function TimeGrid({ days, eventsFor, onCreate, onOpen, selectedId, onSelect, compact }: {
  days: Date[];
  eventsFor: (d: Date) => CalendarEvent[];
  onCreate: (start: Date) => void;
  onOpen: (e: CalendarEvent) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const allDay = days.flatMap((d) => eventsFor(d).filter((e) => e.allDay).map((e) => ({ e, d })));

  // Open with the working day in view instead of midnight.
  useEffect(() => {
    // After the grid has been laid out, so the scroll height exists.
    const frame = requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) el.scrollTop = 7 * HOUR_H;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {allDay.length > 0 && (
        <div className="mb-1 flex gap-1 pl-[52px]">
          <span className="label w-10 shrink-0 pt-1 text-right" data-label="meta">all day</span>
          <div className="flex flex-wrap gap-1">
            {allDay.map(({ e }) => (
              <button key={e.id} onClick={() => onOpen(e)}
                className="focusable rounded-[6px] px-2 py-1 text-[10.5px]"
                style={{ background: `color-mix(in srgb, ${e.color} 22%, transparent)`, color: e.color }}>
                {e.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <div className="relative flex" style={{ height: (DAY_MIN / 60) * HOUR_H }}>
          {/* hour labels */}
          <div className="sticky left-0 w-[52px] shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="num text-right text-[10px] text-faint" style={{ height: HOUR_H, paddingRight: 6, paddingTop: 2 }}>
                {h === 0 ? '' : format(new Date(2020, 0, 1, h), 'h a')}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const list = eventsFor(day).filter((e) => !e.allDay);
            return (
              <div key={day.toISOString()} className="relative min-w-0 flex-1"
                style={{ borderLeft: '1px solid color-mix(in srgb, var(--text-faint) 8%, transparent)' }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <button key={h}
                    aria-label={`Add event at ${h}:00 on ${format(day, 'd MMMM')}`}
                    onClick={() => { const start = new Date(day); start.setHours(h, 0, 0, 0); onCreate(start); }}
                    className="block w-full transition-colors hover:bg-s1/60"
                    style={{ height: HOUR_H, borderTop: h === 0 ? 'none' : '1px solid color-mix(in srgb, var(--text-faint) 8%, transparent)' }} />
                ))}

                {isToday(day) && <NowLine />}

                {list.map((e) => {
                  const startMin = minutesInto(e.start);
                  const endMin = Math.max(startMin + 20, minutesInto(e.end));
                  const height = ((endMin - startMin) / 60) * HOUR_H - 2;
                  const active = selectedId === e.id;
                  return (
                    <motion.button
                      key={e.id}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
                      onClick={(ev) => { ev.stopPropagation(); onSelect(e.id); if (compact) onOpen(e); }}
                      onDoubleClick={() => onOpen(e)}
                      onContextMenu={(ev) => openContextMenu(ev, [
                        { label: 'Edit event', icon: 'PenLine', onClick: () => onOpen(e) },
                        { label: 'Copy time', icon: 'Copy', onClick: () => navigator.clipboard?.writeText(`${format(new Date(e.start), 'EEE d MMM HH:mm')}–${format(new Date(e.end), 'HH:mm')} ${e.title}`) },
                      ], e.title)}
                      className={cn('focusable absolute left-1 right-1 overflow-hidden rounded-[7px] px-1.5 py-1 text-left transition-[filter,box-shadow]',
                        active ? 'z-10 brightness-110' : 'hover:brightness-105')}
                      style={{
                        top: (startMin / 60) * HOUR_H + 1,
                        height: Math.max(22, height),
                        background: `color-mix(in srgb, ${e.color} ${active ? 34 : 22}%, transparent)`,
                        color: e.color,
                        boxShadow: active ? `0 0 0 1px color-mix(in srgb, ${e.color} 55%, transparent), 0 6px 18px -10px ${e.color}` : undefined,
                      }}
                    >
                      <div className="truncate text-[10.5px] font-medium leading-tight">{e.title}</div>
                      <div className="num truncate text-[9.5px] opacity-80">{fmtTime(e.start)}</div>
                    </motion.button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top }}>
      <div className="flex items-center">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--danger)' }} />
        <span className="h-px flex-1" style={{ background: 'color-mix(in srgb, var(--danger) 65%, transparent)' }} />
      </div>
    </div>
  );
}

function WeekGrid({ cursor, weekStart, eventsOn, selectedId, onPickEvent, onOpenEvent, onCreate }: {
  cursor: Date; weekStart: 0 | 1;
  eventsOn: (d: Date) => CalendarEvent[];
  selectedId: string | null;
  onPickEvent: (e: CalendarEvent) => void;
  onOpenEvent: (e: CalendarEvent) => void;
  onCreate: (start: Date) => void;
}) {
  const start = startOfWeek(cursor, { weekStartsOn: weekStart });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="grid shrink-0 grid-cols-7 pl-[52px]">
        {days.map((d) => (
          <div key={d.toISOString()} className="flex flex-col items-center gap-1 py-2">
            <span className="label" data-label="meta">{format(d, 'EEE')}</span>
            <span className={cn('num flex h-6 w-6 items-center justify-center rounded-full text-[11.5px]',
              isToday(d) ? 'font-semibold text-white' : 'text-muted')}
              style={isToday(d) ? { background: 'var(--accent)' } : undefined}>
              {format(d, 'd')}
            </span>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 px-1 pb-1">
        <TimeGrid days={days} eventsFor={eventsOn} onCreate={onCreate} onOpen={onOpenEvent}
          selectedId={selectedId} onSelect={(id) => { const e = eventsOn(new Date()).find((x) => x.id === id); if (e) onPickEvent(e); }} compact />
      </div>
    </Panel>
  );
}

function DayGrid({ day, events, selectedId, onSelect, onOpenEvent, onCreate }: {
  day: Date; events: CalendarEvent[]; selectedId: string | null;
  onSelect: (id: string) => void; onOpenEvent: (e: CalendarEvent) => void; onCreate: (start: Date) => void;
}) {
  return (
    <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <span className="label" data-label="meta">{format(day, 'EEEE')}</span>
        <span className={cn('num flex h-6 w-6 items-center justify-center rounded-full text-[11.5px]', isToday(day) ? 'font-semibold text-white' : 'text-muted')}
          style={isToday(day) ? { background: 'var(--accent)' } : undefined}>{format(day, 'd')}</span>
        <span className="ml-auto text-[11px] text-faint" data-label="minor">{events.filter((e) => !e.allDay).length} events</span>
      </div>
      <div className="min-h-0 flex-1 px-1 pb-1">
        <TimeGrid days={[day]} eventsFor={() => events} onCreate={onCreate} onOpen={onOpenEvent}
          selectedId={selectedId} onSelect={onSelect} />
      </div>
    </Panel>
  );
}

/* ----------------------------------------------------------------- rails */

function MiniMonth({ cursor, onCursor, weekStart }: { cursor: Date; onCursor: (d: Date) => void; weekStart: 0 | 1 }) {
  const db = useFlow((s) => s.db);
  const [shown, setShown] = useState(startOfMonth(cursor));
  useEffect(() => { setShown(startOfMonth(cursor)); }, [cursor]);

  const gridStart = startOfWeek(shown, { weekStartsOn: weekStart });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const hasEvents = (d: Date) => db.events.some((e) => isSameDay(new Date(e.start), d));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => setShown(addMonths(shown, -1))} aria-label="Previous month" data-tip="Previous month" className="focusable flex h-6 w-6 items-center justify-center rounded-[7px] text-faint hover:bg-s2 hover:text-ink">
          <Icon name="ChevronLeft" size={13} />
        </button>
        <span className="text-[12px] font-medium" data-label="minor">{format(shown, 'MMMM yyyy')}</span>
        <button onClick={() => setShown(addMonths(shown, 1))} aria-label="Next month" data-tip="Next month" className="focusable flex h-6 w-6 items-center justify-center rounded-[7px] text-faint hover:bg-s2 hover:text-ink">
          <Icon name="ChevronRight" size={13} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="text-center text-[9.5px] text-faint" data-label="meta">{format(addDays(gridStart, i), 'EEEEE')}</span>
        ))}
        {cells.map((d) => {
          const inMonth = isSameMonth(d, shown);
          const active = isSameDay(d, cursor);
          return (
            <button key={d.toISOString()} onClick={() => onCursor(d)}
              aria-label={format(d, 'd MMMM yyyy')} aria-current={active ? 'date' : undefined}
              className={cn('focusable relative mx-auto flex h-6 w-6 flex-col items-center justify-center rounded-full text-[10.5px] transition-colors',
                inMonth ? 'text-ink' : 'text-faint',
                !active && 'hover:bg-s2')}
              style={active ? { background: 'var(--accent)', color: '#fff', fontWeight: 600 } : isToday(d) ? { boxShadow: 'inset 0 0 0 1px var(--accent)' } : undefined}>
              {format(d, 'd')}
              {hasEvents(d) && !active && <span className="absolute bottom-[1.5px] h-[3px] w-[3px] rounded-full" style={{ background: 'var(--accent)' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The day rail: a mini month, then the details of the selected event. Every
 *  event brings its own card — time, span, place, subject, notes and actions. */
function DayRail({ cursor, onCursor, weekStart, events, selectedId, onSelect, onOpenEvent, onCreate, subjects, onDelete, onDuplicate, onPrep }: {
  cursor: Date; onCursor: (d: Date) => void; weekStart: 0 | 1;
  events: CalendarEvent[]; selectedId: string | null;
  onSelect: (id: string) => void; onOpenEvent: (e: CalendarEvent) => void; onCreate: () => void;
  subjects: Array<{ id: string; name: string; color: string; icon: string }>;
  onDelete: (id: string) => void; onDuplicate: (e: CalendarEvent) => void; onPrep: (e: CalendarEvent) => void;
}) {
  const selected = events.find((e) => e.id === selectedId) ?? events[0];
  const subject = subjects.find((s) => s.id === selected?.subjectId);
  const minutes = selected ? Math.max(0, Math.round((+new Date(selected.end) - +new Date(selected.start)) / 60000)) : 0;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[300px]" aria-label="Day details">
      <Panel className="p-3">
        <MiniMonth cursor={cursor} onCursor={onCursor} weekStart={weekStart} />
      </Panel>

      {selected ? (
        <motion.div key={selected.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }} className="min-h-0 flex-1">
          <Panel className="flex h-full min-h-0 flex-col p-3.5">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selected.color }} />
              <h2 className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug">{selected.title}</h2>
              <IconBtn icon="PenLine" label="Edit event" className="h-7 w-7" onClick={() => onOpenEvent(selected)} />
            </div>

            <div className="mt-2.5 space-y-1.5 text-[12px]">
              <div className="flex items-center gap-2 text-muted">
                <Icon name="CalendarDays" size={13} className="text-faint" />
                <span>{format(new Date(selected.start), 'EEEE, d MMMM yyyy')}</span>
              </div>
              <div className="flex items-center gap-2 text-muted">
                <Icon name="Clock" size={13} className="text-faint" />
                <span className="num">
                  {selected.allDay ? 'All day' : `${fmtTime(selected.start)} – ${fmtTime(selected.end)}`}
                  {!selected.allDay && minutes > 0 && <span className="text-faint"> · {minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`}</span>}
                </span>
              </div>
              {selected.location && (
                <div className="flex items-center gap-2 text-muted">
                  <Icon name="MapPin" size={13} className="text-faint" />
                  <span className="truncate">{selected.location}</span>
                </div>
              )}
              {subject && (
                <div className="flex items-center gap-2 text-muted">
                  <Icon name={subject.icon} size={13} style={{ color: subject.color }} />
                  <span className="truncate">{subject.name}</span>
                </div>
              )}
            </div>

            {selected.notes && (
              <div className="mt-3 rounded-[10px] bg-s1 p-2.5 text-[11.5px] leading-relaxed text-muted">
                {selected.notes}
              </div>
            )}

            <div className="mt-auto grid grid-cols-2 gap-1.5 pt-3">
              <Btn size="sm" variant="soft" icon="Copy" onClick={() => onDuplicate(selected)}>Duplicate</Btn>
              <Btn size="sm" variant="soft" icon="CheckSquare" onClick={() => onPrep(selected)}>Prep task</Btn>
              <Btn size="sm" variant="danger" icon="Trash2" className="col-span-2" onClick={() => onDelete(selected.id)}>Delete event</Btn>
            </div>

            <div className="mt-3 space-y-1" >
              <div className="label" data-label="meta">That day</div>
              {events.map((e) => (
                <button key={e.id} onClick={() => onSelect(e.id)}
                  className={cn('focusable flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[11.5px] transition-colors',
                    e.id === selected.id ? 'bg-s2 text-ink' : 'text-muted hover:bg-s1')}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.color }} />
                  <span className="num shrink-0 text-[10px] text-faint">{e.allDay ? 'all day' : fmtTime(e.start)}</span>
                  <span className="truncate">{e.title}</span>
                </button>
              ))}
            </div>
          </Panel>
        </motion.div>
      ) : (
        <Panel className="flex flex-col items-center gap-2 p-5 text-center">
          <Icon name="CalendarDays" size={20} className="text-faint" />
          <div className="text-[12.5px] text-muted">Nothing on this day yet.</div>
          <Btn size="sm" variant="soft" icon="Plus" onClick={onCreate}>Add an event</Btn>
        </Panel>
      )}
    </aside>
  );
}

/** The month rail: everything that shares the date, with a summary on hover. */
function MonthDayRail({ day, items, subjects, onClose, onEditEvent, onNewEvent, onOpenDay }: {
  day: Date;
  items: {
    events: CalendarEvent[];
    assessments: Array<{ id: string; title: string; subjectId?: string; kind: string; outOf?: number }>;
    todos: Array<{ id: string; title: string; done?: boolean; status?: string }>;
    habits: Array<{ id: string; name: string; color: string }>;
    sessions: number;
  };
  subjects: Array<{ id: string; name: string; color: string }>;
  onClose: () => void; onEditEvent: (e: CalendarEvent) => void; onNewEvent: () => void; onOpenDay: () => void;
}) {
  const total = items.events.length + items.assessments.length + items.todos.length;
  return (
    <motion.aside
      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
      className="flex w-full shrink-0 flex-col gap-2 lg:w-[296px]" aria-label="Selected day">
      <Panel className="flex min-h-0 flex-1 flex-col p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="label" data-label="meta">{format(day, 'EEEE')}</div>
            <div className="flex items-baseline gap-2">
              <span className="num text-[26px] font-semibold leading-none">{format(day, 'd')}</span>
              <span className="text-[12px] text-muted">{format(day, 'MMMM yyyy')}</span>
              {isToday(day) && <Badge tone="accent">today</Badge>}
            </div>
            <div className="mt-0.5 text-[11px] text-faint" data-label="minor">
              {total} items{items.sessions ? ` · ${items.sessions} ${items.sessions === 1 ? 'session' : 'sessions'}` : ''}
            </div>
          </div>
          <IconBtn icon="Plus" label="Add event" className="h-7 w-7" onClick={onNewEvent} />
          <IconBtn icon="X" label="Close" className="h-7 w-7" onClick={onClose} />
        </div>

        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          {items.events.length > 0 && (
            <Group title="Events">
              {items.events.map((e) => (
                <button key={e.id} onClick={() => onEditEvent(e)}
                  className="focusable flex w-full items-center gap-2 rounded-[9px] px-2 py-1.5 text-left text-[11.5px] hover:bg-s1"
                  data-tip={`${e.title} · ${e.allDay ? 'all day' : fmtTime(e.start)}`}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.color }} />
                  <span className="num shrink-0 text-[10px] text-faint">{e.allDay ? 'all day' : fmtTime(e.start)}</span>
                  <span className="truncate">{e.title}</span>
                </button>
              ))}
            </Group>
          )}

          {items.assessments.length > 0 && (
            <Group title="Assessments">
              {items.assessments.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-[11.5px]" data-tip={`${m.title} · ${m.kind}`}>
                  <Icon name="GraduationCap" size={12} className="text-warning" />
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span className="chip" data-label="meta">{subjects.find((s) => s.id === m.subjectId)?.name ?? '—'}</span>
                </div>
              ))}
            </Group>
          )}

          {items.todos.length > 0 && (
            <Group title="Tasks">
              {items.todos.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-[11.5px]" data-tip={t.title}>
                  <Icon name="CheckSquare" size={12} className="text-muted" />
                  <span className="truncate">{t.title}</span>
                </div>
              ))}
            </Group>
          )}

          {items.habits.length > 0 && (
            <Group title="Habits">
              {items.habits.map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-[11.5px]" data-tip={`${h.name} · due today`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: h.color }} />
                  <span className="truncate">{h.name}</span>
                </div>
              ))}
            </Group>
          )}

          {total === 0 && items.habits.length === 0 && (
            <div className="py-6 text-center text-[11.5px] text-faint">Nothing scheduled.</div>
          )}
        </div>

        <Btn size="sm" variant="soft" icon="Maximize2" full className="mt-2" onClick={onOpenDay}>Open this day</Btn>
      </Panel>
    </motion.aside>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1" data-label="meta">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- modal */

function EventDialog({ open, onClose, editing, form, setForm, subjects, onSave, onDelete, onPrep }: {
  open: boolean; onClose: () => void; editing: CalendarEvent | null;
  form: Partial<CalendarEvent>; setForm: (f: Partial<CalendarEvent>) => void;
  subjects: Array<{ id: string; name: string; icon: string }>;
  onSave: () => void; onDelete?: () => void; onPrep?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit event' : 'New event'}
      subtitle={editing ? 'Changes save straight away' : 'It appears in the month, week and day views'}
      footer={<>
        {onDelete && <Btn variant="danger" icon="Trash2" className="mr-auto" onClick={onDelete}>Delete</Btn>}
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="Check" onClick={onSave}>Save</Btn>
      </>}>
      <div className="space-y-3">
        <TextInput autoFocus value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Event title" className="text-[15px] font-medium" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts"><DateTimeField label="Start" value={form.start} onChange={(v) => setForm({ ...form, start: v })} compact /></Field>
          <Field label="Ends"><DateTimeField label="End" value={form.end} onChange={(v) => setForm({ ...form, end: v })} compact /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Subject">
            <Select value={form.subjectId ?? ''} onChange={(v) => setForm({ ...form, subjectId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...subjects.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))]} />
          </Field>
          <Field label="Location"><TextInput value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Room, link or address" /></Field>
        </div>
        <Field label="Colour">
          <ColorPicker value={form.color ?? '#7c8cff'} onChange={(c) => setForm({ ...form, color: c })} label="Event colour" />
        </Field>
        <Field label="Notes"><TextArea rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What this is, and what to bring" /></Field>
        <Toggle label="All day" checked={!!form.allDay} onChange={(v) => setForm({ ...form, allDay: v })} />
        {onPrep && <Btn size="sm" variant="soft" icon="CheckSquare" onClick={onPrep}>Create prep task for the day before</Btn>}
      </div>
    </Modal>
  );
}

export { SectionHead };
