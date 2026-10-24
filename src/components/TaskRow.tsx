import { useSortable } from '@dnd-kit/sortable';
import { useNavigate } from 'react-router-dom';
import { CSS } from '@dnd-kit/utilities';
import { useFlow } from '../store';
import { Chip, Icon, IconBtn, MenuBtn } from './ui';
import { PriorityFlag } from './TodoDialog';
import { dueState, dueTint, fmtTime, minsToHM, relDay, cn } from '../lib/utils';
import type { Todo } from '../lib/types';

export function TaskCheckbox({ done, priority, onClick }: { done: boolean; priority: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={done ? 'Mark incomplete' : 'Complete task'}
      className="focusable mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] transition-colors"
      style={{
        // No drawn border: an unticked box is a soft tint that carries the
        // priority colour, a ticked one is a solid accent fill.
        background: done
          ? 'var(--accent)'
          : `color-mix(in srgb, ${priority >= 3 ? 'var(--danger)' : priority === 2 ? 'var(--warning)' : 'var(--text-faint)'} ${priority > 0 ? 20 : 12}%, transparent)`,
      }}
    >
      {done && <Icon name="Check" size={11} className="text-white" strokeWidth={3} />}
    </button>
  );
}

export function TaskRow({ todo, onEdit, selected, onSelect, compact, showMeta = true, draggable }: {
  todo: Todo; onEdit: (t: Todo) => void; selected?: boolean; onSelect?: () => void; compact?: boolean; showMeta?: boolean; draggable?: boolean;
}) {
  const db = useFlow((s) => s.db);
  const toggleTodo = useFlow((s) => s.toggleTodo);
  const snoozeTodo = useFlow((s) => s.snoozeTodo);
  const duplicateTodo = useFlow((s) => s.duplicateTodo);
  const updateTodo = useFlow((s) => s.updateTodo);
  const deleteTodo = useFlow((s) => s.deleteTodo);
  const startFocus = useFlow((s) => s.startFocus);
  const navigate = useNavigate();

  const cat = db.categories.find((c) => c.id === todo.categoryId);
  const subject = db.subjects.find((s) => s.id === todo.subjectId);
  const project = db.projects.find((p) => p.id === todo.projectId);
  const done = todo.status === 'done';
  const state = done ? 'none' : dueState(todo.dueAt);
  const st = sortable(todo.id, draggable);

  const body = (
    <div
      className={cn(
        'group flex items-start gap-2.5 rounded-[12px] px-2.5 transition-colors',
        compact ? 'py-1.5' : 'py-2',
        selected ? 'bg-accentsoft' : 'row-hover',
      )}
      onClick={(e) => { if (e.metaKey || e.ctrlKey) { onSelect?.(); } }}
    >
      <TaskCheckbox done={done} priority={todo.priority} onClick={() => toggleTodo(todo.id)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onEdit(todo)}
            className={cn('focusable truncate text-left text-[13.5px]', done ? 'text-faint line-through' : 'text-ink')}
          >
            {todo.title}
          </button>
          {todo.rrule && <Icon name="Repeat" size={11} className="shrink-0 text-faint" />}
          {todo.checklist.length > 0 && (
            <span className="num shrink-0 text-[11px] text-faint">{todo.checklist.filter((c) => c.done).length}/{todo.checklist.length}</span>
          )}
        </div>
        {showMeta && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {cat && <Chip icon={cat.icon} color={cat.color}>{cat.name}</Chip>}
            {subject && <Chip icon={subject.icon} color={subject.color}>{subject.name}</Chip>}
            {project && <Chip icon={project.icon} color={project.color}>{project.name}</Chip>}
            {todo.tags.map((t) => <span key={t} className="text-[11px] text-faint">#{t}</span>)}
            {todo.status === 'blocked' && <Chip icon="Hourglass" color="var(--warning)">Blocked</Chip>}
            {todo.status === 'doing' && <Chip icon="Play" color="var(--accent)">Doing</Chip>}
            {todo.loggedMin > 0 && <Chip icon="Clock">{minsToHM(todo.loggedMin)}</Chip>}
            {todo.estimateMin && todo.loggedMin === 0 && <Chip icon="Hourglass">{todo.estimateMin}m</Chip>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {todo.dueAt && (
          <span className={cn('num whitespace-nowrap text-[11.5px]', dueTint[state])}>
            {relDay(todo.dueAt)} {fmtTime(todo.dueAt)}
          </span>
        )}
        {todo.priority > 0 && <PriorityFlag priority={todo.priority} />}
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <MenuBtn
            trigger={<IconBtn icon="MoreHorizontal" label="Task actions" />}
            items={[
              { label: 'Edit task', icon: 'Edit3', onClick: () => onEdit(todo) },
              { label: 'Start focus on this', icon: 'Timer', onClick: () => { startFocus({ todoId: todo.id, subjectId: todo.subjectId, categoryId: todo.categoryId }); navigate('/focus'); } },
              { label: 'Snooze 1 hour', icon: 'AlarmClock', onClick: () => snoozeTodo(todo.id, 60) },
              { label: 'Snooze to tomorrow', icon: 'CalendarDays', onClick: () => snoozeTodo(todo.id, 1440) },
              { label: 'Mark as doing', icon: 'Play', onClick: () => updateTodo(todo.id, { status: 'doing' }) },
              { label: 'Blocked / waiting', icon: 'Hourglass', onClick: () => updateTodo(todo.id, { status: 'blocked' }) },
              { label: 'Duplicate', icon: 'Copy', onClick: () => duplicateTodo(todo.id) },
              { label: 'Archive', icon: 'Archive', onClick: () => updateTodo(todo.id, { status: 'archived' }), separator: true },
              { label: 'Delete', icon: 'Trash2', onClick: () => deleteTodo(todo.id), danger: true },
            ]}
          />
        </div>
      </div>
    </div>
  );

  if (draggable) {
    return (
      <div ref={st.setNodeRef} style={st.style} {...st.attributes} {...st.listeners} className="touch-none">
        {body}
      </div>
    );
  }
  return body;
}

function sortable(id: string, enabled?: boolean) {
  // dnd-kit hooks must be called unconditionally, so always initialise
  const s = useSortable({ id, disabled: !enabled });
  return {
    setNodeRef: s.setNodeRef,
    attributes: s.attributes,
    listeners: s.listeners,
    style: { transform: CSS.Transform.toString(s.transform), transition: s.transition, opacity: s.isDragging ? 0.6 : 1 },
  };
}
