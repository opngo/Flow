import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { addDays, format, isSameDay, startOfDay, startOfWeek } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { TaskRow } from '../components/TaskRow';
import { TodoDialog, PriorityFlag } from '../components/TodoDialog';
import {
  Badge, Btn, Chip, EmptyState, Field, Icon, IconBtn, MenuBtn, Modal, Panel, ScrollArea, SectionHead,
  Segmented, Select, TextInput,
} from '../components/ui';
import type { Todo } from '../lib/types';
import { cn, dayKey, fmtDate, fmtDateTime, fmtTime, relDay, minsToHM, dueState, isSame as sameDay } from '../lib/utils';

type ViewId = 'list' | 'board' | 'calendar' | 'timeline' | 'planner' | 'matrix' | 'focus' | 'radar' | 'overdue' | 'done' | 'projects';

const VIEWS: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: 'list', label: 'List', icon: 'ListTodo' },
  { id: 'board', label: 'Board', icon: 'Rows' },
  { id: 'calendar', label: 'Calendar', icon: 'CalendarDays' },
  { id: 'timeline', label: 'Timeline', icon: 'GanttChartSquare' },
  { id: 'planner', label: 'Planner', icon: 'CalendarRange' },
  { id: 'matrix', label: 'Matrix', icon: 'Grid2x2' },
  { id: 'focus', label: 'Focus', icon: 'Crosshair' },
  { id: 'radar', label: 'Radar', icon: 'Radar' },
  { id: 'overdue', label: 'Overdue', icon: 'LifeBuoy' },
  { id: 'done', label: 'Completed', icon: 'History' },
  { id: 'projects', label: 'Projects', icon: 'FolderKanban' },
];

const SMART = [
  { id: 'today', label: 'Today', icon: 'Sun' },
  { id: 'tomorrow', label: 'Tomorrow', icon: 'Sunrise' },
  { id: 'week', label: 'This week', icon: 'CalendarDays' },
  { id: 'overdue', label: 'Overdue', icon: 'CircleAlert' },
  { id: 'nodate', label: 'No date', icon: 'Calendar' },
  { id: 'high', label: 'High priority', icon: 'Flag' },
  { id: 'waiting', label: 'Waiting', icon: 'Hourglass' },
  { id: 'someday', label: 'Someday', icon: 'Archive' },
  { id: 'recent', label: 'Recently completed', icon: 'CheckCircle2' },
];

export default function Todos() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const db = useFlow((s) => s.db);
  // Individual selectors: action references are stable, so the page never
  // re-renders just because an unrelated part of the database changed.
  const addTodo = useFlow((s) => s.addTodo);
  const bulkPatch = useFlow((s) => s.bulkPatch);
  const quickAdd = useFlow((s) => s.quickAdd);
  const completeTodo = useFlow((s) => s.completeTodo);
  const updateTodo = useFlow((s) => s.updateTodo);
  const reorderTodos = useFlow((s) => s.reorderTodos);
  const toast = useUI((s) => s.toast);

  const view = (params.get('view') as ViewId) ?? 'list';
  const setView = (v: ViewId) => { params.set('view', v); setParams(params, { replace: true }); };

  const [smart, setSmart] = useState<string>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState<Todo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [rescueOpen, setRescueOpen] = useState(false);
  const [rescueDays, setRescueDays] = useState(1);

  const tagFilter = params.get('tag');

  useEffect(() => {
    if (params.get('new')) {
      setEditing(null);
      setDialogOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const all = db.todos;
  const open = all.filter((t) => t.status !== 'done' && t.status !== 'archived');

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    let list = open;
    if (smart === 'today') list = list.filter((t) => t.dueAt && sameDay(t.dueAt, today.toISOString()) || (t.startAt && sameDay(t.startAt, today.toISOString())));
    if (smart === 'tomorrow') list = list.filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), addDays(today, 1)));
    if (smart === 'week') list = list.filter((t) => t.dueAt && new Date(t.dueAt) <= addDays(today, 7));
    if (smart === 'overdue') list = list.filter((t) => t.dueAt && new Date(t.dueAt) < new Date() && t.status !== 'done');
    if (smart === 'nodate') list = list.filter((t) => !t.dueAt);
    if (smart === 'high') list = list.filter((t) => t.priority >= 3);
    if (smart === 'waiting') list = list.filter((t) => t.status === 'blocked');
    if (smart === 'someday') list = list.filter((t) => t.status === 'inbox');
    if (categoryId !== 'all') list = list.filter((t) => t.categoryId === categoryId);
    if (tagFilter) list = list.filter((t) => t.tags.includes(tagFilter));
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((t) => `${t.title} ${t.notes} ${t.tags.join(' ')}`.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (a.dueAt && b.dueAt) return +new Date(a.dueAt) - +new Date(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return b.priority - a.priority || a.order - b.order;
    });
  }, [open, smart, categoryId, query, tagFilter]);

  /* keyboard-first list (spec §6.4) */
  useEffect(() => {
    if (view !== 'list') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable) return;
      if (!filtered.length) return;
      const item = filtered[Math.min(cursor, filtered.length - 1)];
      if (e.key === 'j') { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)); }
      if (e.key === 'k') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      if (e.key === ' ') { e.preventDefault(); if (item) completeTodo(item.id); }
      if (e.key === 'e') { e.preventDefault(); if (item) { setEditing(item); setDialogOpen(true); } }
      if (e.key === 'd') { e.preventDefault(); if (item) updateTodo(item.id, { dueAt: addDays(new Date(), 1).toISOString() }); }
      if (e.key === 't') { e.preventDefault(); if (item) updateTodo(item.id, { dueAt: new Date().toISOString() }); }
      if (e.key === 'p') { e.preventDefault(); if (item) updateTodo(item.id, { priority: (item.priority + 1) % 4 }); }
      if (e.key === '/') { e.preventDefault(); document.getElementById('todo-search')?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, filtered, cursor, completeTodo, updateTodo]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const status = String(over.id).replace('col-', '') as Todo['status'];
    if (['inbox', 'todo', 'doing', 'blocked', 'done'].includes(status)) {
      if (status === 'done') completeTodo(String(active.id));
      else updateTodo(String(active.id), { status });
      return;
    }
    const overId = String(over.id);
    if (overId.startsWith('day-')) {
      const date = overId.replace('day-', '');
      updateTodo(String(active.id), { dueAt: new Date(`${date}T17:00:00`).toISOString() });
      toast({ title: 'Rescheduled', body: fmtDate(new Date(`${date}T12:00:00`), 'EEEE, MMM d'), tone: 'success' });
      return;
    }
    if (active.id !== over.id) {
      const ids = filtered.map((t) => t.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(overId);
      if (from >= 0 && to >= 0) {
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        reorderTodos(ids);
      }
    }
  };

  const submitQuick = () => {
    if (!quick.trim()) return;
    quickAdd(quick, { categoryId: categoryId !== 'all' ? categoryId : undefined });
    setQuick('');
  };

  const openNew = (defaults?: Partial<Todo>) => { setEditing(defaults ? ({ ...defaults } as Todo) : null); setDialogOpen(true); };

  const counts = {
    today: open.filter((t) => t.dueAt && sameDay(t.dueAt, new Date().toISOString())).length,
    overdue: open.filter((t) => t.dueAt && new Date(t.dueAt) < new Date()).length,
  };

  const renderView = () => {
    switch (view) {
      case 'board': return <BoardView todos={filtered} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} />;
      case 'calendar': return <CalendarView todos={filtered} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} />;
      case 'timeline': return <TimelineView todos={filtered} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} />;
      case 'planner': return <PlannerView todos={filtered} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} />;
      case 'matrix': return <MatrixView todos={filtered} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} />;
      case 'focus': return <FocusView todos={filtered} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} />;
      case 'radar': return <RadarView todos={filtered} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} />;
      case 'done': return <DoneView todos={all} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} />;
      case 'projects': return <ProjectsView onEdit={(t) => { setEditing(t); setDialogOpen(true); }} />;
      case 'overdue': return <OverdueView todos={filtered} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} onRescue={() => setRescueOpen(true)} />;
      default: return <ListView todos={filtered} cursor={cursor} onEdit={(t) => { setEditing(t); setDialogOpen(true); }} selected={selected} onSelect={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />;
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* filter rail */}
      <aside className="hidden w-52 shrink-0 flex-col gap-3 lg:flex">
        <div>
          <div className="px-2.5 pb-2 pt-1">
            <h1 className="h1">Todos</h1>
            <div className="mt-0.5 text-[12px] text-muted">{open.length} open · {counts.overdue} overdue</div>
          </div>
          <button onClick={() => openNew()} className="focusable mb-2 flex w-full items-center gap-2 rounded-[11px] px-2.5 py-2 text-[13px] text-accent" style={{ background: 'var(--accent-soft)' }}>
            <Icon name="Plus" size={15} /> New task
          </button>
          <button onClick={() => setSmart('all')} className={cn('focusable flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px]', smart === 'all' ? 'bg-s2 text-ink' : 'text-muted hover:bg-s1')}>
            <Icon name="ListTodo" size={14} /> All tasks <span className="num ml-auto text-[11px] text-faint">{open.length}</span>
          </button>
          {SMART.map((s) => (
            <button key={s.id} onClick={() => setSmart(s.id)}
              className={cn('focusable flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px]', smart === s.id ? 'bg-s2 text-ink' : 'text-muted hover:bg-s1')}>
              <Icon name={s.icon} size={14} />
              {s.label}
              {s.id === 'today' && counts.today > 0 && <span className="num ml-auto text-[11px] text-accent">{counts.today}</span>}
              {s.id === 'overdue' && counts.overdue > 0 && <span className="num ml-auto text-[11px] text-danger">{counts.overdue}</span>}
            </button>
          ))}
        </div>

        <div className="divider" />
        <div>
          <div className="label px-2.5 pb-1">Categories</div>
          <button onClick={() => setCategoryId('all')} className={cn('focusable flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px]', categoryId === 'all' ? 'bg-s2 text-ink' : 'text-muted hover:bg-s1')}>
            <Icon name="Layers" size={14} /> Every category
          </button>
          {db.categories.map((c) => {
            const n = open.filter((t) => t.categoryId === c.id).length;
            return (
              <div key={c.id} className="flex items-center">
                <button onClick={() => setCategoryId(c.id)} className={cn('focusable flex flex-1 items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px]', categoryId === c.id ? 'bg-s2 text-ink' : 'text-muted hover:bg-s1')}>
                  <Icon name={c.icon} size={14} style={{ color: c.color }} />
                  <span className="truncate">{c.name}</span>
                  {n > 0 && <span className="num ml-auto text-[11px] text-faint">{n}</span>}
                </button>
                <IconBtn icon="ArrowUpRight" label={`Open ${c.name}`} onClick={() => navigate(`/categories/${c.id}`)} className="h-7 w-7 opacity-0 hover:opacity-100 [div:hover>&]:opacity-60" />
              </div>
            );
          })}
        </div>

        <div className="divider" />
        <div className="px-2.5 text-[11px] leading-relaxed text-faint">
          <div className="label mb-1">Keyboard</div>
          <div><span className="num">j / k</span> move</div>
          <div><span className="num">space</span> complete</div>
          <div><span className="num">e</span> edit · <span className="num">d</span> defer</div>
          <div><span className="num">p</span> priority · <span className="num">t</span> today</div>
        </div>
      </aside>

      {/* main */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] bg-s1 px-3">
            <Icon name="Zap" size={15} className="shrink-0 text-accent" />
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitQuick()}
              placeholder="Add a task — try “read chapter 8 tomorrow 4pm #reading ~45m”"
              className="h-10 min-w-0 flex-1 bg-transparent text-[13px] placeholder:text-faint"
            />
            {quick && <Btn size="sm" variant="tonal" onClick={submitQuick}>Add</Btn>}
          </div>
          <div className="relative flex items-center gap-2 rounded-[12px] bg-s1 px-3">
            <Icon name="Search" size={14} className="text-faint" />
            <input id="todo-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" className="h-10 w-28 bg-transparent text-[13px] placeholder:text-faint" />
          </div>
          <IconBtn icon="Plus" label="New task with details" onClick={() => openNew()} className="bg-s1" />
        </div>

        <div className="mb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <ScrollArea className="no-scrollbar flex-1">
            <div className="flex gap-1">
              {VIEWS.map((v) => (
                <button key={v.id} onClick={() => setView(v.id)}
                  className={cn('focusable flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] transition-colors',
                    view === v.id ? 'bg-s3 text-ink' : 'text-muted hover:bg-s1 hover:text-ink')}>
                  <Icon name={v.icon} size={13} /> {v.label}
                </button>
              ))}
            </div>
          </ScrollArea>
          {selected.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-accentsoft px-2 py-1 text-[11.5px] text-accent">
              <Icon name="CheckSquare" size={12} /> {selected.length} selected
              <MenuBtn
                trigger={<IconBtn icon="MoreHorizontal" label="Bulk actions" />}
                items={[
                  { label: 'Complete all', icon: 'Check', onClick: () => { bulkPatch(selected, { status: 'done', completedAt: new Date().toISOString() }); setSelected([]); } },
                  { label: 'Set priority high', icon: 'Flag', onClick: () => { bulkPatch(selected, { priority: 3 }); setSelected([]); } },
                  { label: 'Due tomorrow', icon: 'CalendarDays', onClick: () => { bulkPatch(selected, { dueAt: addDays(new Date(), 1).toISOString() }); setSelected([]); } },
                  { label: 'Archive', icon: 'Archive', onClick: () => { bulkPatch(selected, { status: 'archived' }); setSelected([]); } },
                  { label: 'Clear selection', icon: 'X', onClick: () => setSelected([]), separator: true },
                ]}
              />
            </div>
          )}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{renderView()}</div>
        </DndContext>
      </section>

      <TodoDialog open={dialogOpen} onClose={() => setDialogOpen(false)} todo={editing?.id ? editing : null} defaults={editing && !editing.id ? editing : undefined} />

      <Modal
        open={rescueOpen} onClose={() => setRescueOpen(false)} title="Overdue rescue"
        subtitle="Re-plan every overdue task in one move"
        footer={<>
          <Btn variant="ghost" onClick={() => setRescueOpen(false)}>Cancel</Btn>
          <Btn variant="primary" icon="LifeBuoy" onClick={() => {
            filtered.forEach((t) => updateTodo(t.id, { dueAt: addDays(new Date(), rescueDays).toISOString() }));
            setRescueOpen(false);
            toast({ title: 'Rescued', body: `${filtered.length} tasks moved ${rescueDays} day(s) forward`, tone: 'success' });
          }}>Reschedule {filtered.length} tasks</Btn>
        </>}>
        <Field label="Move all overdue tasks forward by (days)">
          <TextInput type="number" min={1} max={30} value={rescueDays} onChange={(e) => setRescueDays(Number(e.target.value))} />
        </Field>
        <div className="mt-3 space-y-1">
          {filtered.slice(0, 6).map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
              <PriorityFlag priority={t.priority} />
              <span className="flex-1 truncate">{t.title}</span>
              <span className="num text-[11px] text-danger">{relDay(t.dueAt)}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------------- views */

function ListView({ todos, cursor, onEdit, selected, onSelect }: {
  todos: Todo[]; cursor: number; onEdit: (t: Todo) => void; selected: string[]; onSelect: (id: string) => void;
}) {
  if (!todos.length) return <EmptyState icon="CheckCircle2" title="Nothing here" body="Add a task above, or clear the filters." />;
  const groups: Array<{ label: string; items: Todo[] }> = [];
  const buckets: Record<string, Todo[]> = { Overdue: [], Today: [], Tomorrow: [], 'This week': [], Later: [], 'No date': [] };
  const today = startOfDay(new Date());
  for (const t of todos) {
    if (!t.dueAt) { buckets['No date'].push(t); continue; }
    const due = new Date(t.dueAt);
    if (due < new Date() && !isSameDay(due, today)) buckets.Overdue.push(t);
    else if (isSameDay(due, today)) buckets.Today.push(t);
    else if (isSameDay(due, addDays(today, 1))) buckets.Tomorrow.push(t);
    else if (due <= addDays(today, 7)) buckets['This week'].push(t);
    else buckets.Later.push(t);
  }
  for (const [label, items] of Object.entries(buckets)) if (items.length) groups.push({ label, items });

  return (
    <div className="space-y-4 pb-6">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1 flex items-center gap-2 px-1">
            <span className="label">{g.label}</span>
            <span className="num text-[11px] text-faint">{g.items.length}</span>
          </div>
          <div className="panel-flat p-1">
            <SortableContext items={g.items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {g.items.map((t) => {
                const idx = todos.findIndex((x) => x.id === t.id);
                return (
                  <div key={t.id} className={cn('rounded-[12px]', idx === cursor && 'bg-accentsoft/40')}>
                    <TaskRow todo={t} onEdit={onEdit} draggable selected={selected.includes(t.id)} onSelect={() => onSelect(t.id)} />
                  </div>
                );
              })}
            </SortableContext>
          </div>
        </div>
      ))}
    </div>
  );
}

const COLUMNS: Array<{ id: Todo['status']; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];

function BoardView({ todos, onEdit }: { todos: Todo[]; onEdit: (t: Todo) => void }) {
  const updateTodo = useFlow((s) => s.updateTodo);
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const items = todos.filter((t) => t.status === col.id || (col.id === 'done' && t.status === 'archived'));
        return (
          <DroppableColumn key={col.id} id={`col-${col.id}`}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="label">{col.label}</span>
              <span className="num text-[11px] text-faint">{items.length}</span>
            </div>
            <div className="space-y-1.5">
              <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {items.map((t) => (
                  <div key={t.id} className="rounded-[12px] bg-s2/70 p-2">
                    <TaskRow todo={t} onEdit={onEdit} showMeta draggable />
                    <div className="mt-1 flex gap-1 px-1">
                      {COLUMNS.filter((c) => c.id !== t.status).slice(0, 3).map((c) => (
                        <button key={c.id} onClick={() => updateTodo(t.id, { status: c.id })} className="focusable chip text-[10px] hover:bg-s3">{c.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </SortableContext>
              {!items.length && <div className="rounded-[12px] bg-s1/50 px-3 py-6 text-center text-[11.5px] text-faint">Drop tasks here</div>}
            </div>
          </DroppableColumn>
        );
      })}
    </div>
  );
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn('w-[290px] shrink-0 rounded-[var(--radius)] p-2 transition-colors', isOver ? 'bg-accentsoft' : 'bg-s1/40')}>
      {children}
    </div>
  );
}

function CalendarView({ todos, onEdit }: { todos: Todo[]; onEdit: (t: Todo) => void }) {
  const [month, setMonth] = useState(new Date());
  const start = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1), { weekStartsOn: 1 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <Panel className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-[13px] font-medium">{format(month, 'MMMM yyyy')}</div>
        <div className="ml-auto flex gap-1">
          <IconBtn icon="ChevronLeft" label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
          <Btn size="sm" variant="ghost" onClick={() => setMonth(new Date())}>Today</Btn>
          <IconBtn icon="ChevronRight" label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10.5px] text-faint">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="px-1 py-1 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const items = todos.filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), c));
          const inMonth = c.getMonth() === month.getMonth();
          return (
            <DayCell key={c.toISOString()} id={`day-${dayKey(c)}`}>
              <div className={cn('min-h-[84px] rounded-[12px] p-1.5 transition-colors', inMonth ? 'bg-s1/60' : 'bg-s1/20')}>
                <div className={cn('num mb-1 text-[10.5px]', isSameDay(c, new Date()) ? 'text-accent' : 'text-faint')}>{format(c, 'd')}</div>
                <div className="space-y-0.5">
                  {items.slice(0, 3).map((t) => (
                    <button key={t.id} onClick={() => onEdit(t)} title={t.title}
                      className="focusable block w-full truncate rounded-[6px] px-1.5 py-0.5 text-left text-[10.5px]"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      {fmtTime(t.dueAt)} {t.title}
                    </button>
                  ))}
                  {items.length > 3 && <div className="px-1 text-[10px] text-faint">+{items.length - 3} more</div>}
                </div>
              </div>
            </DayCell>
          );
        })}
      </div>
    </Panel>
  );
}

function DayCell({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={cn('rounded-[12px] transition-colors', isOver && 'bg-accentsoft')}>{children}</div>;
}

function TimelineView({ todos, onEdit }: { todos: Todo[]; onEdit: (t: Todo) => void }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(new Date()), i));
  const withDates = todos.filter((t) => t.dueAt).slice(0, 14);
  return (
    <Panel className="overflow-x-auto p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-[13px] font-medium">Next 14 days</div>
        <span className="text-[11.5px] text-faint">bars are start → due</span>
      </div>
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[180px_repeat(14,1fr)] gap-x-0.5 text-[10px] text-faint">
          <div />
          {days.map((d) => <div key={d.toISOString()} className="py-1 text-center">{format(d, 'd')}<div className="text-[9px]">{format(d, 'EEEEE')}</div></div>)}
        </div>
        {withDates.map((t) => {
          const due = new Date(t.dueAt!);
          const start = t.startAt ? new Date(t.startAt) : addDays(due, -1);
          const from = Math.max(0, Math.round((startOfDay(start).getTime() - days[0].getTime()) / 86400000));
          const to = Math.max(from, Math.round((startOfDay(due).getTime() - days[0].getTime()) / 86400000));
          if (to < 0 || from > 13) return null;
          return (
            <div key={t.id} className="grid grid-cols-[180px_repeat(14,1fr)] items-center gap-x-0.5 py-1">
              <button onClick={() => onEdit(t)} className="focusable truncate pr-2 text-left text-[11.5px] text-muted hover:text-ink">{t.title}</button>
              {days.map((d, i) => (
                <div key={d.toISOString()} className="h-5">
                  {i >= from && i <= to && (
                    <div className={cn('h-full rounded-[5px]', i === from && 'rounded-l-[5px]', i === to && 'rounded-r-[5px]')}
                      style={{ background: t.priority >= 3 ? 'color-mix(in srgb, var(--danger) 55%, transparent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)' }} />
                  )}
                </div>
              ))}
            </div>
          );
        })}
        {!withDates.length && <EmptyState icon="GanttChartSquare" title="No dated tasks" body="Give tasks a start or due date to see them on the timeline." />}
      </div>
    </Panel>
  );
}

function PlannerView({ todos, onEdit }: { todos: Todo[]; onEdit: (t: Todo) => void }) {
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);
  const today = new Date();
  const todays = todos.filter((t) => (t.dueAt && isSameDay(new Date(t.dueAt), today)) || (t.startAt && isSameDay(new Date(t.startAt), today)));
  const unscheduled = todos.filter((t) => !todays.includes(t)).slice(0, 12);
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <Panel className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="CalendarRange" size={14} className="text-accent" />
          <span className="text-[13px] font-medium">{format(today, 'EEEE, MMMM d')}</span>
          <span className="ml-auto text-[11.5px] text-faint">time-blocked day</span>
        </div>
        <div className="space-y-0.5">
          {hours.map((h) => {
            const block = todays.filter((t) => (t.startAt && new Date(t.startAt).getHours() === h) || (!t.startAt && t.dueAt && new Date(t.dueAt).getHours() === h));
            return (
              <div key={h} className="flex min-h-[34px] items-start gap-2 rounded-[8px] px-1 hover:bg-s1/60">
                <span className="num w-12 shrink-0 pt-1.5 text-[10.5px] text-faint">{String(h).padStart(2, '0')}:00</span>
                <div className="flex flex-1 flex-wrap gap-1 py-1">
                  {block.map((t) => (
                    <button key={t.id} onClick={() => onEdit(t)} className="focusable rounded-[7px] px-2 py-1 text-left text-[11.5px]"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      {t.title} {t.estimateMin ? <span className="text-[10px] opacity-70">{t.estimateMin}m</span> : null}
                    </button>
                  ))}
                  {h === new Date().getHours() && <span className="h-[2px] flex-1 self-center rounded-full" style={{ background: 'var(--accent)' }} />}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel className="p-3">
        <div className="label mb-2">Unscheduled · drag onto a day in Calendar</div>
        <div className="space-y-1">
          {unscheduled.map((t) => <div key={t.id} className="rounded-[10px] bg-s1 p-2"><TaskRow todo={t} onEdit={onEdit} compact /></div>)}
          {!unscheduled.length && <div className="text-[12px] text-faint">Everything is scheduled.</div>}
        </div>
      </Panel>
    </div>
  );
}

function MatrixView({ todos, onEdit }: { todos: Todo[]; onEdit: (t: Todo) => void }) {
  const quadrants = [
    { id: 'do', label: 'Do now', sub: 'Urgent + important', filter: (t: Todo) => t.priority >= 2 && t.dueAt && new Date(t.dueAt) <= addDays(new Date(), 1), color: 'var(--danger)' },
    { id: 'schedule', label: 'Schedule', sub: 'Important, not urgent', filter: (t: Todo) => t.priority >= 2 && (!t.dueAt || new Date(t.dueAt) > addDays(new Date(), 1)), color: 'var(--accent)' },
    { id: 'delegate', label: 'Delegate or batch', sub: 'Urgent, not important', filter: (t: Todo) => t.priority < 2 && !!t.dueAt && new Date(t.dueAt) <= addDays(new Date(), 1), color: 'var(--warning)' },
    { id: 'drop', label: 'Later', sub: 'Neither', filter: (t: Todo) => t.priority < 2 && (!t.dueAt || new Date(t.dueAt) > addDays(new Date(), 1)), color: 'var(--text-faint)' },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {quadrants.map((q) => {
        const items = todos.filter(q.filter);
        return (
          <Panel key={q.id} className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: q.color }} />
              <span className="text-[13px] font-medium">{q.label}</span>
              <span className="text-[11px] text-faint">{q.sub}</span>
              <span className="num ml-auto text-[11px] text-faint">{items.length}</span>
            </div>
            <div className="space-y-1">
              {items.slice(0, 8).map((t) => <div key={t.id} className="rounded-[10px] bg-s1/60 px-1"><TaskRow todo={t} onEdit={onEdit} compact /></div>)}
              {!items.length && <div className="py-4 text-center text-[11.5px] text-faint">Clear</div>}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function FocusView({ todos, onEdit }: { todos: Todo[]; onEdit: (t: Todo) => void }) {
  const startFocus = useFlow((s) => s.startFocus);
  const navigate = useNavigate();
  const top = [...todos].sort((a, b) => b.priority - a.priority).slice(0, 3);
  return (
    <div className="space-y-3">
      <SectionHead title="The next three" subtitle="Everything else can wait — pick one and start the clock" />
      <div className="grid gap-3 md:grid-cols-3">
        {top.map((t, i) => (
          <Panel key={t.id} className="flex flex-col p-4">
            <div className="flex items-center gap-2">
              <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-accentsoft text-[11px] text-accent">{i + 1}</span>
              <PriorityFlag priority={t.priority} />
              <span className="ml-auto text-[11px] text-faint">{t.dueAt ? relDay(t.dueAt) : 'no date'}</span>
            </div>
            <button onClick={() => onEdit(t)} className="focusable mt-2 text-left text-[14px] font-medium">{t.title}</button>
            <div className="mt-2 flex-1 text-[12px] text-muted">{t.notes.slice(0, 120) || 'No notes yet.'}</div>
            <Btn variant="primary" size="sm" icon="Play" className="mt-3" onClick={() => { startFocus({ todoId: t.id, subjectId: t.subjectId, categoryId: t.categoryId }); navigate('/focus'); }}>
              Start focus
            </Btn>
          </Panel>
        ))}
      </div>
      {!top.length && <EmptyState icon="Crosshair" title="Nothing queued" body="Add tasks and they will surface here by priority." />}
    </div>
  );
}

function RadarView({ todos, onEdit }: { todos: Todo[]; onEdit: (t: Todo) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((d) => {
        const items = todos.filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), d));
        return (
          <Panel key={d.toISOString()} className="p-2">
            <div className="mb-1.5 flex items-center gap-1">
              <span className="text-[11px] font-semibold">{format(d, 'EEE')}</span>
              <span className="num text-[10.5px] text-faint">{format(d, 'd')}</span>
              {isSameDay(d, new Date()) && <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />}
            </div>
            <div className="space-y-1">
              {items.map((t) => (
                <button key={t.id} onClick={() => onEdit(t)} className="focusable w-full rounded-[8px] bg-s1 p-1.5 text-left text-[11px] hover:bg-s2">
                  <div className="truncate">{t.title}</div>
                  <div className="num mt-0.5 text-[10px] text-faint">{fmtTime(t.dueAt)}</div>
                </button>
              ))}
              {!items.length && <div className="py-4 text-center text-[10.5px] text-faint">—</div>}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function DoneView({ todos, onEdit }: { todos: Todo[]; onEdit: (t: Todo) => void }) {
  const done = todos.filter((t) => t.status === 'done').sort((a, b) => +new Date(b.completedAt ?? 0) - +new Date(a.completedAt ?? 0));
  const groups = done.reduce<Record<string, Todo[]>>((acc, t) => {
    const k = format(new Date(t.completedAt ?? t.updatedAt), 'yyyy-MM-dd');
    (acc[k] ||= []).push(t);
    return acc;
  }, {});
  if (!done.length) return <EmptyState icon="History" title="No completed tasks yet" body="Finish something and it lands here with a timestamp." />;
  return (
    <div className="space-y-4 pb-6">
      {Object.entries(groups).map(([day, items]) => (
        <div key={day}>
          <div className="mb-1 flex items-center gap-2 px-1">
            <span className="label">{format(new Date(`${day}T12:00:00`), 'EEEE, MMM d')}</span>
            <span className="num text-[11px] text-faint">{items.length}</span>
          </div>
          <div className="panel-flat p-1">
            {items.map((t) => <TaskRow key={t.id} todo={t} onEdit={onEdit} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function OverdueView({ todos, onEdit, onRescue }: { todos: Todo[]; onEdit: (t: Todo) => void; onRescue: () => void }) {
  const snoozeTodo = useFlow((s) => s.snoozeTodo);
  if (!todos.length) return <EmptyState icon="CircleCheck" title="Nothing overdue" body="Every dated task is still in the future. Rare and good." />;
  return (
    <div className="space-y-3">
      <Panel className="flex items-center gap-3 p-3">
        <Icon name="LifeBuoy" size={18} className="text-warning" />
        <div className="flex-1">
          <div className="text-[13px] font-medium">{todos.length} overdue</div>
          <div className="text-[11.5px] text-muted">Batch re-plan them instead of feeling bad about them.</div>
        </div>
        <Btn variant="tonal" size="sm" icon="RefreshCw" onClick={onRescue}>Rescue all</Btn>
      </Panel>
      <div className="panel-flat p-1">
        {todos.map((t) => (
          <div key={t.id} className="group flex items-center gap-2">
            <div className="flex-1"><TaskRow todo={t} onEdit={onEdit} /></div>
            <button onClick={() => snoozeTodo(t.id, 1440)} className="focusable chip mr-2 opacity-0 group-hover:opacity-100 hover:bg-s3">Tomorrow</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsView({ onEdit }: { onEdit: (t: Todo) => void }) {
  const db = useFlow((s) => s.db);
  const addProject = useFlow((s) => s.addProject);
  const deleteProject = useFlow((s) => s.deleteProject);
  const [name, setName] = useState('');
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="New project name" onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { addProject(name.trim()); setName(''); } }} />
        <Btn variant="primary" icon="Plus" onClick={() => { if (name.trim()) { addProject(name.trim()); setName(''); } }}>Add</Btn>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {db.projects.map((p) => {
          const items = db.todos.filter((t) => t.projectId === p.id && t.status !== 'archived');
          const done = items.filter((t) => t.status === 'done').length;
          const pctDone = items.length ? Math.round((done / items.length) * 100) : 0;
          return (
            <Panel key={p.id} className="p-3">
              <div className="flex items-center gap-2">
                <Icon name={p.icon} size={15} style={{ color: p.color }} />
                <span className="text-[13px] font-medium">{p.name}</span>
                <Badge tone="accent">{pctDone}%</Badge>
                <IconBtn icon="Trash2" label="Delete project" className="ml-auto" onClick={() => deleteProject(p.id)} />
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-s2">
                <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pctDone}%`, background: p.color }} />
              </div>
              <div className="mt-2 space-y-0.5">
                {items.slice(0, 5).map((t) => <TaskRow key={t.id} todo={t} onEdit={onEdit} compact showMeta={false} />)}
                {!items.length && <div className="py-3 text-[11.5px] text-faint">No tasks assigned yet.</div>}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
