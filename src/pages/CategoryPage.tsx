import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useFlow } from '../store';
import { TaskRow } from '../components/TaskRow';
import { TodoDialog } from '../components/TodoDialog';
import { Heatmap } from '../components/Heatmap';
import { Btn, EmptyState, Icon, Panel, SectionHead, Stat, PlusBtn } from '../components/ui';
import { bucketSessions, buildRollingGrid, thresholds } from '../lib/analytics';
import { minsToHM } from '../lib/utils';
import type { Todo } from '../lib/types';

export default function CategoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const db = useFlow((s) => s.db);
  const addTodo = useFlow((s) => s.addTodo);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [open, setOpen] = useState(false);

  const category = db.categories.find((c) => c.id === id);
  const todos = db.todos.filter((t) => t.categoryId === id);
  const openTodos = todos.filter((t) => t.status !== 'done' && t.status !== 'archived');
  const doneTodos = todos.filter((t) => t.status === 'done').sort((a, b) => +new Date(b.completedAt ?? 0) - +new Date(a.completedAt ?? 0));
  const overdue = openTodos.filter((t) => t.dueAt && new Date(t.dueAt) < new Date());

  const bucket = useMemo(() => {
    const sessions = db.focusSessions.filter((s) => s.categoryId === id);
    const b = bucketSessions(sessions);
    return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.minutes]));
  }, [db.focusSessions, id]);
  const th = useMemo(() => thresholds(Object.values(bucket)), [bucket]);
  const grid = useMemo(() => buildRollingGrid(26, db.settings.behavior.weekStart), [db.settings.behavior.weekStart]);
  const totalTracked = todos.reduce((a, t) => a + (t.loggedMin ?? 0), 0);

  if (!category) {
    return <EmptyState icon="Folder" title="Category not found" body="It may have been deleted." action={<Btn variant="primary" onClick={() => navigate('/todos')}>Back to todos</Btn>} />;
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: `color-mix(in srgb, ${category.color} 18%, transparent)` }}>
          <Icon name={category.icon} size={20} style={{ color: category.color }} />
        </span>
        <div className="min-w-0">
          <h1 className="h1">{category.name}</h1>
          <div className="text-[12px] text-muted">{openTodos.length} open · {doneTodos.length} completed</div>
        </div>
        <div className="ml-auto flex gap-2">
          <PlusBtn label="New task" onClick={() => { setEditing(null); setOpen(true); }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Open tasks" value={openTodos.length} icon="CheckSquare" />
        <Stat label="Overdue" value={overdue.length} icon="CircleAlert" tone={overdue.length ? 'danger' : 'success'} />
        <Stat label="Tracked" value={minsToHM(totalTracked)} icon="Clock" />
        <Stat label="Completed" value={doneTodos.length} icon="CircleCheck" tone="success" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <Panel className="p-3">
            <SectionHead title="Open tasks" subtitle={`${openTodos.length} remaining`} />
            <div className="space-y-0.5">
              {openTodos.map((t) => <TaskRow key={t.id} todo={t} onEdit={(x) => { setEditing(x); setOpen(true); }} />)}
              {!openTodos.length && <div className="py-8 text-center text-[12px] text-faint">Nothing open in this category.</div>}
            </div>
          </Panel>

          <Panel className="p-3">
            <SectionHead title="Completed history" subtitle={`${doneTodos.length} finished`} />
            <div className="space-y-0.5">
              {doneTodos.slice(0, 20).map((t) => <TaskRow key={t.id} todo={t} onEdit={(x) => { setEditing(x); setOpen(true); }} compact />)}
              {!doneTodos.length && <div className="py-6 text-center text-[12px] text-faint">No completions yet.</div>}
            </div>
          </Panel>
        </div>

        <Panel className="p-3">
          <SectionHead title="Study heatmap" subtitle="Focus time logged in this category" />
          <div className="overflow-x-auto pb-1">
            <Heatmap
              weeks={grid} values={bucket} thresholds={th} cell={10} weekStart={db.settings.behavior.weekStart}
              formatTooltip={(date, value) => (
                <>
                  <div className="font-medium">{format(new Date(`${date}T12:00:00`), 'EEE, MMM d')}</div>
                  <div className="text-muted">{value ? minsToHM(value) : 'No study time'}</div>
                </>
              )}
            />
          </div>
        </Panel>
      </div>

      <TodoDialog open={open} onClose={() => setOpen(false)} todo={editing} defaults={editing ? undefined : { categoryId: category.id, priority: category.defaultPriority }} />
      <span className="hidden">{typeof addTodo}</span>
    </div>
  );
}
