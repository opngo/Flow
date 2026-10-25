import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { useFlow } from '../store';
import {
  Badge, Btn, Chip, ColorPicker, EmptyState, Field, Icon, IconBtn, Modal, Panel, SectionHead, Segmented, Select,
  TextArea, TextInput, Toggle,
} from '../components/ui';
import { isHabitScheduled } from '../lib/habits';
import { cn, fmtTime, toLocalInput, parseLocalInput } from '../lib/utils';
import { DayPanel } from '../components/DayPanel';
import type { CalendarEvent } from '../lib/types';

type View = 'month' | 'week' | 'agenda';

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const db = useFlow((s) => s.db);
  const addEvent = useFlow((s) => s.addEvent);
  const updateEvent = useFlow((s) => s.updateEvent);
  const deleteEvent = useFlow((s) => s.deleteEvent);
  const addTodo = useFlow((s) => s.addTodo);
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<CalendarEvent>>({});

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

  /** Everything that lands on one date. The month grid, the week grid, the
   *  agenda and the day panel all read from this one function. */
  const dayItems = (day: Date) => {
    const events = db.events
      .filter((e) => isSameDay(new Date(e.start), day))
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));
    const assessments = db.marks.filter((m) => m.status === 'pending' && isSameDay(new Date(m.date), day));
    const todos = db.todos
      .filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), day))
      .sort((a, b) => +new Date(a.dueAt!) - +new Date(b.dueAt!));
    const habits = db.habits.filter((h) => isHabitScheduled(h, day));
    const sessions = db.focusSessions.filter((f) => isSameDay(new Date(f.startedAt), day)).length;
    return { events, assessments, todos, habits, sessions };
  };

  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: weekStart });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weekStartDate = startOfWeek(cursor, { weekStartsOn: weekStart });
  const weekCells = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  const agendaCells = Array.from({ length: 21 }, (_, i) => addDays(new Date(), i));

  const upcoming = useMemo(() => db.events.filter((e) => new Date(e.end) >= new Date()).sort((a, b) => +new Date(a.start) - +new Date(b.start)), [db.events]);

  const saveEvent = () => {
    if (!form.title?.trim()) return;
    if (editing) updateEvent(editing.id, form);
    else addEvent(form);
    setOpen(false);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Calendar</h1>
          <div className="mt-0.5 text-[12px] text-muted">{upcoming.length} upcoming events · assessments and habits layered in</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <IconBtn icon="ChevronLeft" label="Previous" onClick={() => setCursor(view === 'week' ? addDays(cursor, -7) : addMonths(cursor, -1))} />
            <Btn size="sm" variant="ghost" onClick={() => setCursor(new Date())}>Today</Btn>
            <IconBtn icon="ChevronRight" label="Next" onClick={() => setCursor(view === 'week' ? addDays(cursor, 7) : addMonths(cursor, 1))} />
          </div>
          <span className="text-[13px] font-medium">{format(cursor, view === 'week' ? "'Week of' MMM d" : 'MMMM yyyy')}</span>
          <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'agenda', label: 'Agenda' }]} />
          <Btn variant="primary" icon="Plus" onClick={() => { setEditing(null); setForm({ title: '', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString(), color: '#7c8cff' }); setOpen(true); }}>Event</Btn>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-3">
      {view === 'month' && (
        <Panel className="p-3">
          <div className="grid grid-cols-7 gap-1 pb-1">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="label text-center">{format(addDays(gridStart, i), 'EEE')}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day) => {
              const items = dayItems(day);
              const total = items.events.length + items.assessments.length + items.todos.length;
              return (
                <button key={day.toISOString()} onClick={() => { setCursor(day); setSelectedDay(day); }}
                  aria-pressed={!!selectedDay && isSameDay(day, selectedDay)}
                  className={cn('min-h-[104px] rounded-[12px] p-1.5 text-left transition-colors',
                    isSameMonth(day, cursor) ? 'bg-s1/60 hover:bg-s2/60' : 'bg-s1/20',
                    selectedDay && isSameDay(day, selectedDay) && 'ring-0')}
                  style={
                    isSameDay(day, new Date()) ? { background: 'var(--accent-soft)' }
                      : selectedDay && isSameDay(day, selectedDay) ? { background: 'color-mix(in srgb, var(--surface-3) 70%, transparent)' }
                        : undefined
                  }>
                  <div className="mb-1 flex items-center gap-1">
                    <span className={cn('num text-[10.5px]', isSameMonth(day, cursor) ? 'text-muted' : 'text-faint')}>{format(day, 'd')}</span>
                    {total > 0 && <span className="num text-[9px] text-faint">{total}</span>}
                  </div>
                  <div className="space-y-0.5">
                    {items.events.slice(0, 2).map((e) => (
                      <div key={e.id} className="truncate rounded-[6px] px-1.5 py-0.5 text-[10px]" style={{ background: `color-mix(in srgb, ${e.color} 22%, transparent)`, color: e.color }}>
                        {!e.allDay && <span className="num mr-1">{fmtTime(e.start)}</span>}{e.title}
                      </div>
                    ))}
                    {items.assessments.slice(0, 2).map((m) => (
                      <div key={m.id} className="truncate rounded-[6px] px-1.5 py-0.5 text-[10px]" style={{ background: 'color-mix(in srgb, var(--warning) 18%, transparent)', color: 'var(--warning)' }}>
                        {m.title}
                      </div>
                    ))}
                    {items.todos.slice(0, 1).map((t) => (
                      <div key={t.id} className="truncate rounded-[6px] bg-s2 px-1.5 py-0.5 text-[10px] text-muted">{t.title}</div>
                    ))}
                    {items.habits.length > 0 && (
                      <div className="flex gap-0.5 pt-0.5">
                        {items.habits.slice(0, 5).map((h) => <span key={h.id} className="h-1 w-1 rounded-full" style={{ background: h.color }} />)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      {view === 'week' && (
        <Panel className="overflow-x-auto p-3">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[52px_repeat(7,1fr)] gap-1">
              <div />
              {weekCells.map((d) => (
                <div key={d.toISOString()} className="text-center">
                  <div className="label">{format(d, 'EEE')}</div>
                  <div className={cn('num text-[13px]', isSameDay(d, new Date()) ? 'text-accent' : 'text-muted')}>{format(d, 'd')}</div>
                </div>
              ))}
              {Array.from({ length: 14 }, (_, i) => i + 7).map((hour) => (
                <div key={hour} className="contents">
                  <div className="num py-1 text-right text-[10px] text-faint">{String(hour).padStart(2, '0')}:00</div>
                  {weekCells.map((d) => {
                    const items = dayItems(d);
                    const here = items.events.filter((e) => !e.allDay && new Date(e.start).getHours() === hour);
                    return (
                      <div key={`${d.toISOString()}-${hour}`} className="min-h-[38px] rounded-[8px] bg-s1/40 p-0.5">
                        {here.map((e) => (
                          <button key={e.id} onClick={() => { setEditing(e); setForm(e); setOpen(true); }}
                            className="focusable mb-0.5 block w-full truncate rounded-[6px] px-1.5 py-1 text-left text-[10.5px]"
                            style={{ background: `color-mix(in srgb, ${e.color} 24%, transparent)`, color: e.color }}>
                            {e.title}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {view === 'agenda' && (
        <Panel className="p-3">
          <SectionHead title="Next three weeks" subtitle="Everything with a date, in order" />
          <div className="space-y-3">
            {agendaCells.map((d) => {
              const items = dayItems(d);
              const total = items.events.length + items.assessments.length + items.todos.length;
              if (!total) return null;
              return (
                <div key={d.toISOString()}>
                  <div className="mb-1 flex items-center gap-2">
                    <button onClick={() => setSelectedDay(d)} className="focusable rounded-[6px] px-1 text-[12px] font-medium hover:bg-s2">
                      {format(d, 'EEEE, MMM d')}
                    </button>
                    {isSameDay(d, new Date()) && <Badge tone="accent">today</Badge>}
                    <span className="num text-[10.5px] text-faint">{total} items</span>
                  </div>
                  <div className="space-y-1">
                    {items.events.map((e) => (
                      <button key={e.id} onClick={() => { setEditing(e); setForm(e); setOpen(true); }}
                        className="focusable flex w-full items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-left text-[12px]">
                        <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                        <span className="num w-16 text-[10.5px] text-faint">{e.allDay ? 'all day' : fmtTime(e.start)}</span>
                        <span className="flex-1 truncate">{e.title}</span>
                        {e.location && <span className="text-[10.5px] text-faint">{e.location}</span>}
                      </button>
                    ))}
                    {items.assessments.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
                        <Icon name="GraduationCap" size={12} className="text-warning" />
                        <span className="flex-1 truncate">{m.title}</span>
                        <Chip>{db.subjects.find((s) => s.id === m.subjectId)?.name}</Chip>
                      </div>
                    ))}
                    {items.todos.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
                        <Icon name="CheckSquare" size={12} className="text-muted" />
                        <span className="num w-16 text-[10.5px] text-faint">{fmtTime(t.dueAt)}</span>
                        <span className="flex-1 truncate">{t.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      </div>

      {selectedDay && (
        <DayPanel
          day={selectedDay}
          items={dayItems(selectedDay)}
          subjects={db.subjects}
          onClose={() => setSelectedDay(null)}
          onEditEvent={(e) => { setEditing(e); setForm(e); setOpen(true); }}
          onNewEvent={() => {
            const start = new Date(selectedDay);
            start.setHours(9, 0, 0, 0);
            setEditing(null);
            setForm({ title: '', start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), color: '#7c8cff' });
            setOpen(true);
          }}
        />
      )}
      </div>

      <Panel className="p-3">
        <SectionHead title="Upcoming" subtitle="Next events with quick actions" />
        <div className="space-y-1">
          {upcoming.slice(0, 6).map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
              <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
              <span className="flex-1 truncate">{e.title}</span>
              <span className="num text-[10.5px] text-faint">{format(new Date(e.start), 'MMM d, h:mm a')}</span>
              <IconBtn icon="Edit3" label="Edit event" className="h-6 w-6" onClick={() => { setEditing(e); setForm(e); setOpen(true); }} />
            </div>
          ))}
          {!upcoming.length && <EmptyState icon="CalendarDays" title="No events yet" body="Add one and it appears on the month, week and agenda views." />}
        </div>
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit event' : 'New event'} subtitle="Events can be linked to a subject"
        footer={<>
          {editing && <Btn variant="danger" icon="Trash2" className="mr-auto" onClick={() => { deleteEvent(editing.id); setOpen(false); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          <Btn variant="primary" icon="Check" onClick={saveEvent}>Save</Btn>
        </>}>
        <div className="space-y-3">
          <TextInput autoFocus value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" className="text-[15px] font-medium" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start"><TextInput type="datetime-local" value={toLocalInput(form.start)} onChange={(e) => setForm({ ...form, start: parseLocalInput(e.target.value) ?? form.start })} /></Field>
            <Field label="End"><TextInput type="datetime-local" value={toLocalInput(form.end)} onChange={(e) => setForm({ ...form, end: parseLocalInput(e.target.value) ?? form.end })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Subject">
              <Select value={form.subjectId ?? ''} onChange={(v) => setForm({ ...form, subjectId: v || undefined })}
                options={[{ value: '', label: 'None' }, ...db.subjects.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))]} />
            </Field>
            <Field label="Location"><TextInput value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          </div>
          <Field label="Colour"><ColorPicker value={form.color ?? '#7c8cff'} onChange={(c) => setForm({ ...form, color: c })} label="Event colour" /></Field>
          <Field label="Notes"><TextArea rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Toggle label="All day" checked={!!form.allDay} onChange={(v) => setForm({ ...form, allDay: v })} />
          {editing && (
            <Btn size="sm" variant="soft" icon="CheckSquare" onClick={() => {
              addTodo({ title: `Prepare: ${editing.title}`, dueAt: new Date(new Date(editing.start).getTime() - 86400000).toISOString(), subjectId: editing.subjectId });
              setOpen(false);
            }}>Create prep task for the day before</Btn>
          )}
        </div>
      </Modal>
    </div>
  );
}
