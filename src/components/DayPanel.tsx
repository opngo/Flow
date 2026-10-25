import { format, isSameDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Badge, Chip, Icon, IconBtn, ProgressRing } from './ui';
import { RichTip } from './Tooltip';
import { fmtTime, minsToHM, cn } from '../lib/utils';
import { describeRRule } from '../lib/habits';
import type { CalendarEvent, Habit, Mark, Subject, Todo } from '../lib/types';

/**
 * The day panel: everything that lands on one date, in one place.
 *
 * It is a sidebar rather than a modal because the calendar stays visible while
 * you read it, and every row carries a summary card on hover so the panel does
 * not have to spell everything out at rest.
 */

export type DayItems = {
  events: CalendarEvent[];
  assessments: Mark[];
  todos: Todo[];
  habits: Habit[];
  sessions: number;
};

export function DayPanel({ day, items, subjects, onClose, onEditEvent, onNewEvent }: {
  day: Date;
  items: DayItems;
  subjects: Subject[];
  onClose: () => void;
  onEditEvent: (event: CalendarEvent) => void;
  onNewEvent: () => void;
}) {
  const navigate = useNavigate();
  const total = items.events.length + items.assessments.length + items.todos.length + items.habits.length;
  const subjectOf = (id?: string) => subjects.find((s) => s.id === id);

  return (
    <aside
      className="panel flex h-full min-h-0 w-full flex-col overflow-hidden lg:w-[340px] lg:shrink-0"
      aria-label={`Events on ${format(day, 'EEEE d MMMM')}`}
    >
      <div className="flex items-start justify-between gap-2 p-3 pb-2">
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[0.09em] text-faint">{format(day, 'EEEE')}</div>
          <div className="flex items-baseline gap-2">
            <span className="num text-[22px] font-semibold leading-tight">{format(day, 'd')}</span>
            <span className="text-[12.5px] text-muted">{format(day, 'MMMM yyyy')}</span>
            {isSameDay(day, new Date()) && <Badge tone="accent">today</Badge>}
          </div>
          <div className="mt-0.5 text-[11px] text-faint">
            {total ? `${total} ${total === 1 ? 'item' : 'items'}` : 'nothing scheduled'}
            {items.sessions ? ` · ${items.sessions} ${items.sessions === 1 ? 'session' : 'sessions'}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn icon="Plus" label="Add event" onClick={onNewEvent} className="h-7 w-7" />
          <IconBtn icon="X" label="Close day" onClick={onClose} className="h-7 w-7" />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {items.events.length > 0 && (
          <Group label="Events">
            {items.events.map((e) => (
              <RichTip
                key={e.id}
                content={
                  <div className="px-0.5">
                    <div className="text-[12.5px] font-medium text-ink">{e.title}</div>
                    <div className="mt-1.5 space-y-px text-[11px]">
                      <Row label="When" value={e.allDay ? 'All day' : `${fmtTime(e.start)} – ${fmtTime(e.end)}`} />
                      {e.location && <Row label="Where" value={e.location} />}
                      {subjectOf(e.subjectId) && <Row label="Subject" value={subjectOf(e.subjectId)!.name} color={subjectOf(e.subjectId)!.color} />}
                      {e.notes && <Row label="Notes" value={e.notes} />}
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-faint">Click to edit</div>
                  </div>
                }
              >
                <button onClick={() => onEditEvent(e)}
                  className="focusable flex w-full items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2 text-left hover:bg-s2">
                  <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: e.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px]">{e.title}</span>
                    <span className="num block text-[10.5px] text-faint">{e.allDay ? 'all day' : `${fmtTime(e.start)} – ${fmtTime(e.end)}`}</span>
                  </span>
                  {e.location && <span className="truncate text-[10.5px] text-faint">{e.location}</span>}
                </button>
              </RichTip>
            ))}
          </Group>
        )}

        {items.todos.length > 0 && (
          <Group label="Tasks">
            {items.todos.map((t) => {
              const done = t.checklist.filter((c) => c.done).length;
              return (
                <RichTip
                  key={t.id}
                  content={
                    <div className="px-0.5">
                      <div className="text-[12.5px] font-medium text-ink">{t.title}</div>
                      <div className="mt-1.5 space-y-px text-[11px]">
                        <Row label="Due" value={t.dueAt ? `${format(new Date(t.dueAt), 'EEE d MMM')} ${fmtTime(t.dueAt)}` : 'no time'} />
                        {t.startAt && <Row label="Starts" value={`${format(new Date(t.startAt), 'EEE d MMM')} ${fmtTime(t.startAt)}`} />}
                        {subjectOf(t.subjectId) && <Row label="Subject" value={subjectOf(t.subjectId)!.name} color={subjectOf(t.subjectId)!.color} />}
                        {t.estimateMin ? <Row label="Estimate" value={`${t.estimateMin} min`} /> : null}
                        {t.loggedMin ? <Row label="Logged" value={minsToHM(t.loggedMin)} /> : null}
                        {t.rrule && <Row label="Repeats" value={describeRRule(t.rrule)} />}
                        {t.checklist.length ? <Row label="Checklist" value={`${done} of ${t.checklist.length}`} /> : null}
                      </div>
                      {t.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.tags.map((tag) => (
                            <span key={tag} className="rounded-[6px] px-1.5 py-0.5 text-[10.5px] text-faint"
                              style={{ background: 'color-mix(in srgb, var(--surface-3) 70%, transparent)' }}>#{tag}</span>
                          ))}
                        </div>
                      )}
                      {t.notes && <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted">{t.notes}</p>}
                      <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-faint">Click to open in Todos</div>
                    </div>
                  }
                >
                  <button onClick={() => navigate(`/todos?task=${t.id}`)}
                    className="focusable flex w-full items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2 text-left hover:bg-s2">
                    <Icon name={t.status === 'done' ? 'CheckCircle2' : t.status === 'doing' ? 'Play' : 'CheckSquare'}
                      size={13} className={t.status === 'done' ? 'text-success' : 'text-muted'} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-[12.5px]', t.status === 'done' && 'text-faint line-through')}>{t.title}</span>
                      <span className="num block text-[10.5px] text-faint">{t.dueAt ? fmtTime(t.dueAt) : 'no time'}</span>
                    </span>
                    {t.rrule && <Icon name="Repeat" size={11} className="text-faint" />}
                    {t.priority >= 2 && <Icon name="Flag" size={11} className="text-warning" />}
                  </button>
                </RichTip>
              );
            })}
          </Group>
        )}

        {items.assessments.length > 0 && (
          <Group label="Assessments">
            {items.assessments.map((m) => (
              <RichTip
                key={m.id}
                content={
                  <div className="px-0.5">
                    <div className="text-[12.5px] font-medium text-ink">{m.title}</div>
                    <div className="mt-1.5 space-y-px text-[11px]">
                      <Row label="Date" value={format(new Date(m.date), 'EEEE d MMM yyyy')} />
                      {subjectOf(m.subjectId) && <Row label="Subject" value={subjectOf(m.subjectId)!.name} color={subjectOf(m.subjectId)!.color} />}
                      <Row label="Kind" value={m.kind} />
                      <Row label="Out of" value={String(m.max)} />
                      {m.weightOverride ? <Row label="Weight" value={`${m.weightOverride}%`} /> : null}
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-faint">Click to open Grades</div>
                  </div>
                }
              >
                <button onClick={() => navigate('/grades')}
                  className="focusable flex w-full items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2 text-left hover:bg-s2">
                  <Icon name="GraduationCap" size={13} className="text-warning" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{m.title}</span>
                  <Chip>{subjectOf(m.subjectId)?.name ?? 'assessment'}</Chip>
                </button>
              </RichTip>
            ))}
          </Group>
        )}

        {items.habits.length > 0 && (
          <Group label="Habits">
            {items.habits.map((h) => (
              <RichTip
                key={h.id}
                content={
                  <div className="px-0.5">
                    <div className="text-[12.5px] font-medium text-ink">{h.name}</div>
                    <div className="mt-1.5 space-y-px text-[11px]">
                      <Row label="Target" value={h.target.type === 'boolean' ? 'once a day' : `${h.target.value} ${h.target.type === 'duration' ? 'min' : 'times'}`} />
                      <Row label="Schedule" value={describeSchedule(h)} />
                      {h.description && <Row label="Notes" value={h.description} />}
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-faint">Click to open Habits</div>
                  </div>
                }
              >
                <button onClick={() => navigate('/habits')}
                  className="focusable flex w-full items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2 text-left hover:bg-s2">
                  <Icon name={h.icon} size={13} style={{ color: h.color }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{h.name}</span>
                  <ProgressRing value={100} size={18} stroke={2.5} color={h.color} />
                </button>
              </RichTip>
            ))}
          </Group>
        )}

        {total === 0 && (
          <div className="flex flex-col items-center gap-1 py-8 text-center">
            <Icon name="CalendarDays" size={18} className="text-faint" />
            <div className="text-[12px] text-muted">Nothing on this day</div>
            <button onClick={onNewEvent} className="focusable text-[11.5px] text-accent hover:underline">Add an event</button>
          </div>
        )}
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1 px-0.5">{label}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="shrink-0 text-[10.5px] uppercase tracking-[0.06em] text-faint">{label}</span>
      <span className="min-w-0 truncate text-right" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function describeSchedule(habit: Habit) {
  const s = habit.schedule;
  if (s.type === 'daily') return 'every day';
  if (s.type === 'weekdays') return 'weekdays';
  if (s.type === 'everyOtherDay') return 'every other day';
  if (s.type === 'timesPerWeek') return `${s.times} times a week`;
  if (s.type === 'rrule') return describeRRule(s.rrule);
  return s.type;
}
