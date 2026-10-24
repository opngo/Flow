import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format, differenceInDays, differenceInCalendarDays, addDays } from 'date-fns';
import QRCode from 'qrcode';
import { marked } from 'marked';
import { useFlow } from '../store';
import { useUI } from '../ui';
import {
  Badge, Btn, Chip, EmptyState, Field, Icon, IconBtn, Modal, Panel, ProgressRing, SectionHead, Segmented, Select, Slider, Stat, TextArea, TextInput, Toggle,
} from '../components/ui';
import { safeStore } from '../lib/repo';
import { TOOLS } from '../lib/nav';
import { download } from '../lib/platform';
import { habitStats } from '../lib/habits';
import { computeSubjectGrade, neededOnFinal } from '../lib/grades';
import { minsToHM, cn, uuid, toCSV, dayKey, toLocalInput, parseLocalInput } from '../lib/utils';
import { engine } from '../audio/engine';

/* ---------------------------------------------------------------- helpers */
function useLocal<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => safeStore.read<T>(key, initial));
  useEffect(() => { safeStore.write(key, value); }, [key, value]);
  return [value, setValue] as const;
}

function ToolShell({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="space-y-3 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">{title}</h1>
          {subtitle && <div className="mt-0.5 text-[12px] text-muted">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function RecordList({ storeKey, fields, label }: {
  storeKey: string; label: string;
  fields: Array<{ key: string; label: string; type?: 'text' | 'textarea' | 'number' }>;
}) {
  const [rows, setRows] = useLocal<Array<Record<string, string>>>(storeKey, []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const add = () => {
    if (!Object.values(draft).some((v) => v.trim())) return;
    setRows([{ id: uuid(), ...draft }, ...rows]);
    setDraft({});
  };
  return (
    <Panel className="p-3">
      <div className="grid gap-2 md:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
            {f.type === 'textarea'
              ? <TextArea rows={2} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              : <TextInput type={f.type === 'number' ? 'number' : 'text'} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />}
          </Field>
        ))}
      </div>
      <Btn variant="primary" icon="Plus" className="mt-2" onClick={add}>Add {label}</Btn>
      <div className="mt-3 space-y-1">
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-2 rounded-[10px] bg-s1 px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px]">{r[fields[0].key]}</div>
              {fields.slice(1).map((f) => r[f.key] ? <div key={f.key} className="mt-0.5 text-[11px] text-muted"><span className="text-faint">{f.label}: </span>{r[f.key]}</div> : null)}
            </div>
            <IconBtn icon="Trash2" label="Delete" className="h-6 w-6" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} />
          </div>
        ))}
        {!rows.length && <div className="py-6 text-center text-[12px] text-faint">Nothing saved yet.</div>}
      </div>
    </Panel>
  );
}

function Checklist({ storeKey, label }: { storeKey: string; label: string }) {
  const [items, setItems] = useLocal<Array<{ id: string; text: string; done: boolean }>>(storeKey, []);
  const [text, setText] = useState('');
  return (
    <Panel className="p-3">
      <div className="flex gap-1.5">
        <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder={`Add ${label}`}
          onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { setItems([...items, { id: uuid(), text: text.trim(), done: false }]); setText(''); } }} />
        <Btn variant="soft" icon="Plus" onClick={() => { if (text.trim()) { setItems([...items, { id: uuid(), text: text.trim(), done: false }]); setText(''); } }} />
      </div>
      <div className="mt-2 space-y-1">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2 py-1.5">
            <button onClick={() => setItems(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
              className="focusable flex h-4 w-4 items-center justify-center rounded-[5px]" style={{ background: it.done ? 'var(--accent)' : 'var(--surface-3)' }}>
              {it.done && <Icon name="Check" size={10} className="text-white" />}
            </button>
            <span className={cn('flex-1 text-[12.5px]', it.done && 'text-faint line-through')}>{it.text}</span>
            <IconBtn icon="X" label="Remove" className="h-6 w-6" onClick={() => setItems(items.filter((x) => x.id !== it.id))} />
          </div>
        ))}
        {!items.length && <div className="py-4 text-center text-[12px] text-faint">Empty list.</div>}
      </div>
      {items.length > 0 && <Btn size="sm" variant="ghost" icon="RotateCcw" className="mt-2" onClick={() => setItems(items.map((x) => ({ ...x, done: false })))}>Reset all</Btn>}
    </Panel>
  );
}

/* ---------------------------------------------------------------- the host */
export default function ToolHost() {
  const { toolId } = useParams();
  // Catalogue ids and tool routes are not always identical (a few tools share a
  // longer route slug), so resolve by route first and fall back to the id.
  const tool = TOOLS.find((t) => t.route === `/tools/${toolId}`) ?? TOOLS.find((t) => t.id === toolId);
  const rendererId = tool ? tool.route.replace('/tools/', '') : toolId;
  const body = rendererId ? RENDERERS[rendererId] : undefined;

  if (!tool || !body) {
    return (
      <div data-tool="missing">
        <EmptyState icon="Wrench" title="Tool not found" body="That tool is not part of this build." />
      </div>
    );
  }
  return <div data-tool={rendererId}>{body()}</div>;
}

/* ---------------------------------------------------------------- tools */
const RENDERERS: Record<string, () => JSX.Element> = {
  /* tasks */
  inbox: () => <TodoBucket status="inbox" title="Quick capture inbox" subtitle="Triage what you captured — move it into a real task or delete it" />,
  someday: () => <TodoBucket status="someday" title="Someday / maybe" subtitle="Parked ideas without a date" />,
  waiting: () => <TodoBucket status="blocked" title="Waiting for" subtitle="Blocked on someone or something else" />,
  recurring: () => <RecurringTool />,
  'task-templates': () => <ToolShell title="Task & checklist templates" subtitle="Reusable blueprints you can add to any day"><Checklist storeKey="templates" label="template step" /></ToolShell>,
  'weekly-review': () => <ReviewWizard weekly />,
  'daily-review': () => <ReviewWizard />,

  /* habits and goals */
  achievements: () => <Achievements />,
  vacation: () => <VacationMode />,

  /* time */
  'exam-mode': () => <ExamMode />,
  'mini-timer': () => <MiniTimerTool />,
  breath: () => <BreathTool />,
  'eye-rest': () => <WellnessTool kind="eye" />,
  stretch: () => <WellnessTool kind="stretch" />,
  water: () => <WellnessTool kind="water" />,
  'wind-down': () => <WellnessTool kind="winddown" />,
  'world-clock': () => <WorldClock />,
  'day-progress': () => <DayProgress />,
  'distraction-log': () => <DistractionLog />,
  nudge: () => <Nudge />,
  'countdown-events': () => <CountdownEvents />,
  'final-needed': () => <FinalNeeded />,
  'study-planner': () => <StudyPlanner />,
  assignments: () => <Assignments />,
  timetable: () => <Timetable />,
  'reading-list': () => <ReadingList />,
  citations: () => <Citations />,
  formulas: () => <ToolShell title="Formula sheet library" subtitle="Save formulas per subject"><RecordList storeKey="formulas" label="formula" fields={[{ key: 'name', label: 'Name' }, { key: 'subject', label: 'Subject' }, { key: 'formula', label: 'Formula', type: 'textarea' }]} /></ToolShell>,
  vocab: () => <ToolShell title="Vocabulary builder" subtitle="Word, meaning, example sentence"><RecordList storeKey="vocab" label="word" fields={[{ key: 'word', label: 'Word' }, { key: 'meaning', label: 'Meaning' }, { key: 'example', label: 'Example', type: 'textarea' }]} /></ToolShell>,
  'practice-log': () => <PracticeLog />,
  syllabus: () => <ToolShell title="Syllabus checklist" subtitle="Tick off topics as you cover them"><Checklist storeKey="syllabus" label="topic" /></ToolShell>,

  /* notes */
  scratchpad: () => <Scratchpad />,
  journal: () => <JournalTool />,
  'writing-mode': () => <WritingMode />,
  'word-count': () => <WordCount />,
  snippets: () => <ToolShell title="Snippet manager" subtitle="Reusable text blocks with copy"><RecordList storeKey="snippets" label="snippet" fields={[{ key: 'title', label: 'Title' }, { key: 'body', label: 'Text', type: 'textarea' }]} /></ToolShell>,
  clipboard: () => <ClipboardHistory />,
  'template-lib': () => <ToolShell title="Templates library" subtitle="Note and task templates"><RecordList storeKey="notetemplates" label="template" fields={[{ key: 'name', label: 'Name' }, { key: 'body', label: 'Body', type: 'textarea' }]} /></ToolShell>,
  whiteboard: () => <Whiteboard />,
  mindmap: () => <MindMap />,
  cornell: () => <Cornell />,
  outline: () => <Outline />,

  /* utilities */
  'scientific-calc': () => <ScientificCalc />,
  'percentage-calc': () => <PercentageCalc />,
  'unit-convert': () => <UnitConverter />,
  'date-diff': () => <DateDiff />,
  'age-calc': () => <AgeCalc />,
  random: () => <RandomTool />,
  'color-palette': () => <ColorTool />,
  base64: () => <EncoderTool />,
  'text-case': () => <TextCase />,
  lorem: () => <Lorem />,
  qr: () => <QrTool />,
  password: () => <PasswordTool />,
  hash: () => <HashTool />,
  json: () => <JsonTool />,
  regex: () => <RegexTool />,
  'markdown-preview': () => <MarkdownTool />,
  timestamp: () => <TimestampTool />,
  timezone: () => <TimezoneTool />,

  /* organise */
  bookmarks: () => <ToolShell title="Bookmarks and resources" subtitle="Links with tags, kept locally"><RecordList storeKey="bookmarks" label="bookmark" fields={[{ key: 'title', label: 'Title' }, { key: 'url', label: 'URL' }, { key: 'tags', label: 'Tags' }]} /></ToolShell>,
  files: () => <FilesTool />,
  contacts: () => <ToolShell title="Contacts" subtitle="Study group, teachers, everyone you need"><RecordList storeKey="contacts" label="contact" fields={[{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'email', label: 'Email' }, { key: 'note', label: 'Note' }]} /></ToolShell>,
  budget: () => <Budget />,
  subscriptions: () => <Subscriptions />,
  packing: () => <ToolShell title="Packing checklist" subtitle="Reusable lists for trips and events"><Checklist storeKey="packing" label="item" /></ToolShell>,
  search: () => <GlobalSearch />,
  tags: () => <TagManager />,
  'saved-views': () => <SavedViews />,
  backup: () => <BackupTool />,
  export: () => <ExportTool />,
  'undo-history': () => <UndoHistory />,
  activity: () => <ActivityLog />,
  shortcuts: () => <Shortcuts />,
  widgets: () => <WidgetGallery />,
  changelog: () => <Changelog />,
};

/* ---------------------------------------------------------------- pieces */
function TodoBucket({ status, title, subtitle }: { status: string; title: string; subtitle: string }) {
  const db = useFlow((s) => s.db);
  const updateTodo = useFlow((s) => s.updateTodo);
  const completeTodo = useFlow((s) => s.completeTodo);
  const items = db.todos.filter((t) => t.status === status);
  return (
    <ToolShell title={title} subtitle={subtitle}>
      <Panel className="p-3">
        <div className="space-y-1">
          {items.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2">
              <Icon name="Circle" size={12} className="text-faint" />
              <span className="flex-1 truncate text-[12.5px]">{t.title}</span>
              <Btn size="sm" variant="ghost" onClick={() => updateTodo(t.id, { status: 'todo' })}>Make active</Btn>
              <Btn size="sm" variant="ghost" icon="Check" onClick={() => completeTodo(t.id)}>Done</Btn>
            </div>
          ))}
          {!items.length && <div className="py-8 text-center text-[12px] text-faint">Empty. Capture something with Ctrl Shift Space.</div>}
        </div>
      </Panel>
    </ToolShell>
  );
}

function RecurringTool() {
  const db = useFlow((s) => s.db);
  const items = db.todos.filter((t) => t.rrule);
  return (
    <ToolShell title="Recurring task engine" subtitle="RRULE schedules; the next instance spawns when you complete one">
      <Panel className="p-3">
        {items.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2 text-[12.5px]">
            <Icon name="Repeat" size={13} className="text-accent" />
            <span className="flex-1 truncate">{t.title}</span>
            <Chip>{t.rrule}</Chip>
            <span className="text-[11px] text-faint">next {t.dueAt ? format(new Date(t.dueAt), 'MMM d, h:mm a') : '—'}</span>
          </div>
        ))}
        {!items.length && <div className="py-8 text-center text-[12px] text-faint">No recurring tasks. Set a repeat on any task.</div>}
      </Panel>
    </ToolShell>
  );
}

function ReviewWizard({ weekly }: { weekly?: boolean }) {
  const db = useFlow((s) => s.db);
  const addNote = useFlow((s) => s.addNote);
  const toast = useUI((s) => s.toast);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(['', '', '', '']);
  const doneToday = db.todos.filter((t) => t.status === 'done' && t.completedAt && differenceInCalendarDays(new Date(), new Date(t.completedAt)) < (weekly ? 7 : 1));
  const questions = weekly
    ? ['What moved forward this week?', 'What stalled, and why?', 'What will you drop?', 'Top three for next week']
    : ['What did you finish today?', 'What is still open?', 'What got in the way?', 'One thing for tomorrow'];
  const save = () => {
    addNote({ title: `${weekly ? 'Weekly' : 'Daily'} review — ${format(new Date(), 'MMM d')}`, folder: 'Journal', tags: ['review'], body: questions.map((q, i) => `## ${q}\n\n${answers[i] || '_no answer_'}`).join('\n\n') });
    toast({ title: 'Review saved to notes', tone: 'success' });
  };
  return (
    <ToolShell title={weekly ? 'Weekly review' : 'Daily review'} subtitle={`Step ${step + 1} of ${questions.length}`}>
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <Panel className="p-4">
          <div className="label mb-1">{questions[step]}</div>
          <TextArea rows={5} value={answers[step]} onChange={(e) => setAnswers(answers.map((a, i) => (i === step ? e.target.value : a)))} autoFocus />
          <div className="mt-3 flex gap-2">
            <Btn variant="ghost" icon="ArrowLeft" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Btn>
            {step < questions.length - 1
              ? <Btn variant="primary" iconRight="ArrowRight" onClick={() => setStep(step + 1)}>Next</Btn>
              : <Btn variant="primary" icon="Check" onClick={save}>Save review</Btn>}
          </div>
        </Panel>
        <Panel className="p-3">
          <SectionHead title="Context" subtitle={weekly ? 'This week' : 'Today'} />
          <div className="space-y-1 text-[12px] text-muted">
            <div className="flex justify-between"><span>Tasks completed</span><span className="num">{doneToday.length}</span></div>
            <div className="flex justify-between"><span>Open tasks</span><span className="num">{db.todos.filter((t) => t.status !== 'done').length}</span></div>
            <div className="flex justify-between"><span>Focus sessions</span><span className="num">{db.focusSessions.filter((s) => differenceInCalendarDays(new Date(), new Date(s.startedAt)) < (weekly ? 7 : 1)).length}</span></div>
          </div>
          <div className="mt-2 space-y-0.5">
            {doneToday.slice(0, 6).map((t) => <div key={t.id} className="truncate text-[11.5px] text-faint">· {t.title}</div>)}
          </div>
        </Panel>
      </div>
    </ToolShell>
  );
}

function Achievements() {
  const db = useFlow((s) => s.db);
  const weekStart = db.settings.behavior.weekStart;
  const badges = [
    { id: 'first', label: 'First focus', icon: 'Timer', earned: db.focusSessions.length > 0, desc: 'Log one focus session' },
    { id: 'ten', label: 'Ten blocks', icon: 'Layers', earned: db.focusSessions.length >= 10, desc: 'Log ten sessions' },
    { id: 'streak3', label: 'Three days', icon: 'Flame', earned: Object.keys(db.focusSessions.reduce<Record<string, number>>((a, s) => ({ ...a, [dayKey(s.startedAt)]: 1 }), {})).length >= 3, desc: 'Study three separate days' },
    { id: 'habit7', label: 'Habit week', icon: 'CheckCircle2', earned: db.habits.some((h) => habitStats(h, db.habitLogs, weekStart).weeklyStreak >= 1), desc: 'Hit a weekly habit target' },
    { id: 'marks', label: 'Gradekeeper', icon: 'GraduationCap', earned: db.marks.length >= 5, desc: 'Record five marks' },
    { id: 'notes', label: 'Note taker', icon: 'NotebookPen', earned: db.notes.length >= 3, desc: 'Write three notes' },
  ];
  return (
    <ToolShell title="Achievements" subtitle={`${badges.filter((b) => b.earned).length} of ${badges.length} earned`}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {badges.map((b) => (
          <Panel key={b.id} className={cn('flex items-center gap-3 p-3', !b.earned && 'opacity-55')}>
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px]" style={{ background: b.earned ? 'var(--accent-soft)' : 'var(--surface-2)', color: b.earned ? 'var(--accent)' : 'var(--text-faint)' }}>
              <Icon name={b.earned ? b.icon : 'Lock'} size={17} />
            </span>
            <div>
              <div className="text-[12.5px] font-medium">{b.label}</div>
              <div className="text-[11px] text-muted">{b.desc}</div>
            </div>
          </Panel>
        ))}
      </div>
    </ToolShell>
  );
}

function VacationMode() {
  const db = useFlow((s) => s.db);
  const updateHabit = useFlow((s) => s.updateHabit);
  const [until, setUntil] = useState(toLocalInput(addDays(new Date(), 7).toISOString()));
  return (
    <ToolShell title="Vacation / pause mode" subtitle="Pausing protects streaks — no missed days while you are away">
      <Panel className="p-3">
        <Field label="Pause all habits until">
          <TextInput type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <Btn variant="primary" icon="Plane" className="mt-2" onClick={() => db.habits.forEach((h) => updateHabit(h.id, { pausedUntil: parseLocalInput(until) }))}>Pause every habit</Btn>
        <div className="mt-3 space-y-1">
          {db.habits.map((h) => (
            <div key={h.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
              <Icon name={h.icon} size={13} style={{ color: h.color }} />
              <span className="flex-1 truncate">{h.name}</span>
              {h.pausedUntil && new Date(h.pausedUntil) > new Date()
                ? <Badge tone="warning">paused until {format(new Date(h.pausedUntil), 'MMM d')}</Badge>
                : <Btn size="sm" variant="ghost" onClick={() => updateHabit(h.id, { pausedUntil: parseLocalInput(until) })}>Pause</Btn>}
              {h.pausedUntil && <Btn size="sm" variant="ghost" onClick={() => updateHabit(h.id, { pausedUntil: undefined })}>Resume</Btn>}
            </div>
          ))}
        </div>
      </Panel>
    </ToolShell>
  );
}

function ExamMode() {
  const db = useFlow((s) => s.db);
  const flow = useFlow.getState();
  const [subjectId, setSubjectId] = useState(db.subjects[0]?.id ?? '');
  const [minutes, setMinutes] = useState(90);
  const [sections, setSections] = useState(3);
  const running = db.timers.find((t) => t.kind === 'exam');
  return (
    <ToolShell title="Exam mode" subtitle="Section timers, 10-minute and final-minute warnings">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-3">
          <div className="space-y-2">
            <Field label="Subject"><Select value={subjectId} onChange={setSubjectId} options={db.subjects.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Minutes"><TextInput type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
              <Field label="Sections"><TextInput type="number" value={sections} onChange={(e) => setSections(Number(e.target.value))} /></Field>
            </div>
            <Btn variant="primary" icon="Presentation" full onClick={() => flow.startTimer({ kind: 'exam', label: 'Exam', plannedMin: minutes, subjectId, endsAt: new Date(Date.now() + minutes * 60000).toISOString() })}>Start exam timer</Btn>
          </div>
        </Panel>
        <Panel className="p-3">
          <SectionHead title="Live" subtitle={running ? 'In progress' : 'Not started'} />
          {running ? (
            <div className="text-center">
              <div className="num text-[40px] font-semibold">{Math.max(0, Math.round(((new Date(running.endsAt!).getTime() - Date.now()) / 60000)))}<span className="text-[14px] text-faint"> min left</span></div>
              <div className="mt-1 text-[11.5px] text-muted">{sections} sections · {db.subjects.find((s) => s.id === running.subjectId)?.name}</div>
              <Btn variant="soft" className="mt-3" onClick={() => flow.finishTimer(running.id)}>End and log</Btn>
            </div>
          ) : <div className="py-8 text-center text-[12px] text-faint">Start when the paper starts.</div>}
          <div className="mt-3 rounded-[12px] bg-s1 p-3 text-[11.5px] text-muted">After the exam you can enter the mark straight into the gradebook from the notification.</div>
        </Panel>
      </div>
    </ToolShell>
  );
}

function MiniTimerTool() {
  const setMiniMode = useUI((s) => s.setMiniMode);
  return (
    <ToolShell title="Mini floating timer" subtitle="A small always-on-top window that follows you">
      <Panel className="p-4">
        <p className="text-[12.5px] text-muted">Mini mode hides the full interface and shows only the active timer, the task it is attached to and quick sound controls.</p>
        <Btn variant="primary" icon="AppWindow" className="mt-3" onClick={() => setMiniMode(true)}>Enter mini mode</Btn>
        <div className="mt-3 text-[11px] text-faint">Hotkey: Ctrl/Cmd + Shift + F. In the packaged build the window becomes always-on-top with an opacity slider and click-through toggle.</div>
      </Panel>
    </ToolShell>
  );
}

function BreathTool() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  const [scale, setScale] = useState(0.6);
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const loop = async () => {
      const seq: Array<['in' | 'hold' | 'out', number, number]> = [['in', 4000, 1], ['hold', 4000, 1], ['out', 6000, 0.6]];
      for (const [p, ms, s] of seq) {
        if (cancelled) return;
        setPhase(p); setScale(s);
        await new Promise((r) => setTimeout(r, ms));
      }
      if (!cancelled) void loop();
    };
    void loop();
    return () => { cancelled = true; };
  }, [running]);
  useEffect(() => { if (scale === 1) engine.notificationChime?.(); }, [scale]);
  return (
    <ToolShell title="Break guide" subtitle="Box breathing: in 4, hold 4, out 6">
      <Panel className="flex flex-col items-center p-8">
        <div className="relative flex h-56 w-56 items-center justify-center">
          <div className="absolute inset-0 rounded-full transition-transform duration-[4000ms] ease-in-out" style={{ transform: `scale(${scale})`, background: 'var(--accent-soft)' }} />
          <div className="relative text-center">
            <div className="text-[18px] font-medium capitalize">{running ? phase : 'Ready'}</div>
            <div className="mt-1 text-[11.5px] text-muted">{running ? (phase === 'in' ? '4 seconds' : phase === 'hold' ? '4 seconds' : '6 seconds') : 'Press start'}</div>
          </div>
        </div>
        <Btn variant={running ? 'soft' : 'primary'} icon={running ? 'Pause' : 'Play'} className="mt-6" onClick={() => setRunning(!running)}>{running ? 'Stop' : 'Start breathing'}</Btn>
      </Panel>
    </ToolShell>
  );
}

function WellnessTool({ kind }: { kind: 'eye' | 'stretch' | 'water' | 'winddown' }) {
  const meta = {
    eye: { title: '20-20-20 eye rest', icon: 'Eye', every: 20, body: 'Every 20 minutes, look at something 20 feet away for 20 seconds.' },
    stretch: { title: 'Stretch reminders', icon: 'PersonStanding', every: 45, body: 'Stand, roll your shoulders, and reset your posture.' },
    water: { title: 'Water reminders', icon: 'Droplet', every: 60, body: 'A glass of water every hour keeps the afternoon dip away.' },
    winddown: { title: 'Bedtime wind-down', icon: 'Moon', every: 30, body: 'Dim the lights, stop screens, and set tomorrow’s top three.' },
  }[kind];
  const [interval, setIntervalMin] = useLocal<number>(`wellness-${kind}`, meta.every);
  const [last, setLast] = useLocal<string>(`wellness-${kind}-last`, '');
  const flow = useFlow.getState();
  return (
    <ToolShell title={meta.title} subtitle={meta.body}>
      <Panel className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Remind me every (minutes)">
            <TextInput type="number" value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} />
          </Field>
          <Field label="Last done">
            <div className="num input flex items-center">{last ? format(new Date(last), 'MMM d, h:mm a') : 'never'}</div>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variant="primary" icon="Bell" onClick={() => {
            flow.addReminder({ targetKind: 'wellness', title: meta.title, body: meta.body, fireAt: new Date(Date.now() + interval * 60000).toISOString(), actions: ['snooze10', 'open'], route: `/tools/${kind === 'eye' ? 'eye-rest' : kind === 'winddown' ? 'wind-down' : kind}` });
            useUI.getState().toast({ title: 'Reminder scheduled', body: `In ${interval} minutes`, tone: 'success' });
          }}>Schedule reminder</Btn>
          <Btn variant="soft" icon="Check" onClick={() => setLast(new Date().toISOString())}>Mark done now</Btn>
        </div>
      </Panel>
    </ToolShell>
  );
}

function WorldClock() {
  const zones = ['America/Toronto', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Kolkata'];
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <ToolShell title="World clock" subtitle="Compare time zones at a glance">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {zones.map((z) => (
          <Panel key={z} className="p-3">
            <div className="text-[11.5px] text-muted">{z.split('/')[1].replace('_', ' ')}</div>
            <div className="num mt-1 text-[26px] font-semibold leading-none">{now.toLocaleTimeString('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit' })}</div>
            <div className="mt-1 text-[11px] text-faint">{now.toLocaleDateString('en-GB', { timeZone: z, weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </Panel>
        ))}
      </div>
    </ToolShell>
  );
}

function DayProgress() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const pct = ((now.getTime() - start.getTime()) / 86400000) * 100;
  const yearPct = ((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (365.25 * 86400000)) * 100;
  return (
    <ToolShell title="Day progress" subtitle="How much of today, and this year, has already gone">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel className="flex flex-col items-center p-6">
          <ProgressRing value={pct} size={140} stroke={10}><span className="num text-[20px] font-semibold">{pct.toFixed(1)}%</span></ProgressRing>
          <div className="mt-2 text-[12px] text-muted">of today elapsed</div>
          <div className="num mt-1 text-[11px] text-faint">{Math.round((100 - pct) / 100 * 24 * 60)} minutes left</div>
        </Panel>
        <Panel className="flex flex-col items-center p-6">
          <ProgressRing value={yearPct} size={140} stroke={10} color="var(--success)"><span className="num text-[20px] font-semibold">{yearPct.toFixed(1)}%</span></ProgressRing>
          <div className="mt-2 text-[12px] text-muted">of {now.getFullYear()} elapsed</div>
          <div className="num mt-1 text-[11px] text-faint">{differenceInDays(new Date(now.getFullYear(), 11, 31), now)} days left</div>
        </Panel>
      </div>
    </ToolShell>
  );
}

function DistractionLog() {
  const [rows, setRows] = useLocal<Array<{ id: string; at: string; what: string }>>('distractions', []);
  const [what, setWhat] = useState('');
  return (
    <ToolShell title="Distraction log" subtitle="Name it and it loses power">
      <Panel className="p-3">
        <div className="flex gap-1.5">
          <TextInput value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What pulled you away?" onKeyDown={(e) => { if (e.key === 'Enter' && what.trim()) { setRows([{ id: uuid(), at: new Date().toISOString(), what }, ...rows]); setWhat(''); } }} />
          <Btn variant="soft" icon="Plus" onClick={() => { if (what.trim()) { setRows([{ id: uuid(), at: new Date().toISOString(), what }, ...rows]); setWhat(''); } }} />
        </div>
        <div className="mt-2 space-y-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
              <span className="num text-[10.5px] text-faint">{format(new Date(r.at), 'h:mm a')}</span>
              <span className="flex-1">{r.what}</span>
              <IconBtn icon="Trash2" label="Delete" className="h-6 w-6" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} />
            </div>
          ))}
          {!rows.length && <div className="py-6 text-center text-[12px] text-faint">Nothing logged.</div>}
        </div>
      </Panel>
    </ToolShell>
  );
}

function Nudge() {
  const addTodo = useFlow((s) => s.addTodo);
  const startFocus = useFlow((s) => s.startFocus);
  const [task, setTask] = useState('');
  return (
    <ToolShell title="Start with five minutes" subtitle="The only rule: you may stop after five minutes">
      <Panel className="p-5 text-center">
        <div className="text-[15px]">What is the thing you keep avoiding?</div>
        <TextInput value={task} onChange={(e) => setTask(e.target.value)} placeholder="Name it" className="mx-auto mt-3 max-w-md text-center" />
        <Btn variant="primary" icon="Rocket" className="mt-3" onClick={() => {
          const t = addTodo({ title: task || 'Five minute start', estimateMin: 5 });
          startFocus({ todoId: t.id });
        }}>Just five minutes</Btn>
      </Panel>
    </ToolShell>
  );
}

function CountdownEvents() {
  const [events, setEvents] = useLocal<Array<{ id: string; name: string; date: string }>>('events', []);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  return (
    <ToolShell title="Event countdowns" subtitle="How many sleeps until it happens">
      <Panel className="p-3">
        <div className="flex flex-wrap gap-1.5">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Event name" className="flex-1" />
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <Btn variant="soft" icon="Plus" onClick={() => { if (name && date) { setEvents([...events, { id: uuid(), name, date }]); setName(''); setDate(''); } }}>Add</Btn>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => {
            const days = differenceInCalendarDays(new Date(e.date), new Date());
            return (
              <div key={e.id} className="rounded-[12px] bg-s1 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[12.5px]">{e.name}</span>
                  <IconBtn icon="Trash2" label="Delete" className="h-6 w-6" onClick={() => setEvents(events.filter((x) => x.id !== e.id))} />
                </div>
                <div className="num mt-1 text-[24px] font-semibold" style={{ color: days >= 0 ? 'var(--accent)' : 'var(--text-faint)' }}>{Math.abs(days)}<span className="ml-1 text-[11px] text-muted">{days >= 0 ? 'days away' : 'days ago'}</span></div>
                <div className="text-[10.5px] text-faint">{format(new Date(e.date), 'EEEE, MMM d, yyyy')}</div>
              </div>
            );
          })}
        </div>
      </Panel>
    </ToolShell>
  );
}

function FinalNeeded() {
  const db = useFlow((s) => s.db);
  const [subjectId, setSubjectId] = useState(db.subjects[0]?.id ?? '');
  const subject = db.subjects.find((s) => s.id === subjectId);
  const [weight, setWeight] = useState(30);
  const [target, setTarget] = useState(subject?.targetPct ?? 90);
  const need = subject ? neededOnFinal(subject, db.marks, weight, target) : null;
  const grade = subject ? computeSubjectGrade(subject, db.marks) : null;
  return (
    <ToolShell title="What do I need on the final" subtitle="Solve backwards from the grade you want">
      <Panel className="p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Subject"><Select value={subjectId} onChange={setSubjectId} options={db.subjects.map((s) => ({ value: s.id, label: s.name, icon: s.icon }))} /></Field>
          <Field label="Final weight %"><TextInput type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></Field>
          <Field label="Target %"><TextInput type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
        </div>
        <div className="mt-4 rounded-[14px] p-5 text-center" style={{ background: 'var(--accent-soft)' }}>
          <div className="num text-[36px] font-semibold" style={{ color: 'var(--accent)' }}>{need != null ? `${need.toFixed(1)}%` : '—'}</div>
          <div className="text-[12px] text-muted">Current grade: {grade?.pct != null ? `${grade.pct.toFixed(1)}%` : 'no marks yet'}</div>
        </div>
      </Panel>
    </ToolShell>
  );
}

function StudyPlanner() {
  const db = useFlow((s) => s.db);
  const addTodo = useFlow((s) => s.addTodo);
  const upcoming = db.marks.filter((m) => m.status === 'pending').sort((a, b) => +new Date(a.date) - +new Date(b.date));
  return (
    <ToolShell title="Study planner" subtitle="Turn an exam countdown into sessions on the calendar">
      <div className="space-y-2">
        {upcoming.map((m) => {
          const days = Math.max(1, differenceInCalendarDays(new Date(m.date), new Date()));
          const subject = db.subjects.find((s) => s.id === m.subjectId);
          const sessions = Math.min(8, Math.max(2, Math.round(days / 2)));
          return (
            <Panel key={m.id} className="flex flex-wrap items-center gap-2 p-3">
              <Icon name={subject?.icon ?? 'BookOpen'} size={15} style={{ color: subject?.color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px]">{m.title}</div>
                <div className="text-[10.5px] text-faint">{subject?.name} · {days} days · suggest {sessions} sessions</div>
              </div>
              <Btn size="sm" variant="primary" icon="CalendarDays" onClick={() => {
                for (let i = 0; i < sessions; i += 1) {
                  const d = addDays(new Date(), Math.round((i / sessions) * days));
                  d.setHours(18, 0, 0, 0);
                  addTodo({ title: `Study for ${m.title} (${i + 1}/${sessions})`, subjectId: m.subjectId, categoryId: 'cat-school', dueAt: d.toISOString(), estimateMin: 45 });
                }
              }}>Schedule sessions</Btn>
            </Panel>
          );
        })}
        {!upcoming.length && <EmptyState icon="CalendarRange" title="No upcoming assessments" body="Add a pending mark with a date to plan around it." />}
      </div>
    </ToolShell>
  );
}

function Assignments() {
  const db = useFlow((s) => s.db);
  const items = db.marks.filter((m) => m.status === 'pending' || m.status === 'missing').sort((a, b) => +new Date(a.date) - +new Date(b.date));
  return (
    <ToolShell title="Assignment tracker" subtitle={`${items.length} open assessments`}>
      <Panel className="p-3">
        <div className="space-y-1">
          {items.map((m) => {
            const subject = db.subjects.find((s) => s.id === m.subjectId);
            const days = differenceInCalendarDays(new Date(m.date), new Date());
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2 text-[12px]">
                <Icon name={subject?.icon ?? 'BookOpen'} size={13} style={{ color: subject?.color }} />
                <span className="flex-1 truncate">{m.title}</span>
                <Chip>{m.kind}</Chip>
                <span className={cn('num text-[11px]', days < 2 ? 'text-warning' : 'text-faint')}>{days < 0 ? `${Math.abs(days)}d late` : days === 0 ? 'today' : `${days}d`}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </ToolShell>
  );
}

function Timetable() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const [classes, setClasses] = useLocal<Array<{ id: string; day: string; time: string; name: string; room: string }>>('timetable', []);
  const [name, setName] = useState('');
  const [day, setDay] = useState('Mon');
  const [time, setTime] = useState('09:00');
  const [room, setRoom] = useState('');
  return (
    <ToolShell title="Class timetable" subtitle="Your week at a glance">
      <Panel className="p-3">
        <div className="flex flex-wrap gap-1.5">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Class" className="flex-1" />
          <Select value={day} onChange={setDay} options={days.map((d) => ({ value: d, label: d }))} className="w-24" />
          <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
          <TextInput value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room" className="w-24" />
          <Btn variant="soft" icon="Plus" onClick={() => { if (name) { setClasses([...classes, { id: uuid(), day, time, name, room }]); setName(''); } }}>Add</Btn>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          {days.map((d) => (
            <div key={d} className="rounded-[12px] bg-s1 p-2">
              <div className="label mb-1.5">{d}</div>
              <div className="space-y-1">
                {classes.filter((c) => c.day === d).sort((a, b) => a.time.localeCompare(b.time)).map((c) => (
                  <div key={c.id} className="rounded-[8px] bg-s2 px-2 py-1.5 text-[11px]">
                    <div className="num text-[10px] text-faint">{c.time}</div>
                    <div className="truncate">{c.name}</div>
                    {c.room && <div className="text-[10px] text-faint">{c.room}</div>}
                    <button onClick={() => setClasses(classes.filter((x) => x.id !== c.id))} className="focusable mt-0.5 text-[9.5px] text-danger">remove</button>
                  </div>
                ))}
                {!classes.some((c) => c.day === d) && <div className="py-3 text-center text-[10px] text-faint">—</div>}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </ToolShell>
  );
}

function ReadingList() {
  const [books, setBooks] = useLocal<Array<{ id: string; title: string; pages: number; read: number }>>('books', []);
  const [title, setTitle] = useState('');
  const [pages, setPages] = useState(300);
  return (
    <ToolShell title="Reading list" subtitle="Track pages and finish rate">
      <Panel className="p-3">
        <div className="flex flex-wrap gap-1.5">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" className="flex-1" />
          <TextInput type="number" value={pages} onChange={(e) => setPages(Number(e.target.value))} className="w-24" />
          <Btn variant="soft" icon="Plus" onClick={() => { if (title) { setBooks([...books, { id: uuid(), title, pages, read: 0 }]); setTitle(''); } }}>Add book</Btn>
        </div>
        <div className="mt-3 space-y-2">
          {books.map((b) => (
            <div key={b.id} className="rounded-[12px] bg-s1 p-2.5">
              <div className="flex items-center gap-2">
                <Icon name="BookOpen" size={13} className="text-accent" />
                <span className="flex-1 truncate text-[12.5px]">{b.title}</span>
                <span className="num text-[11px] text-faint">{b.read}/{b.pages}</span>
                <IconBtn icon="Trash2" label="Remove" className="h-6 w-6" onClick={() => setBooks(books.filter((x) => x.id !== b.id))} />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-s2">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (b.read / b.pages) * 100)}%`, background: 'var(--accent)' }} />
                </div>
                <TextInput type="number" value={b.read} onChange={(e) => setBooks(books.map((x) => (x.id === b.id ? { ...x, read: Number(e.target.value) } : x)))} className="w-20 py-1 text-center text-[11.5px]" />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </ToolShell>
  );
}

function Citations() {
  const [author, setAuthor] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [title, setTitle] = useState('');
  const [publisher, setPublisher] = useState('');
  const [style, setStyle] = useState<'apa' | 'mla'>('apa');
  const apa = `${author} (${year}). ${title}. ${publisher}.`;
  const mla = `${author}. "${title}." ${publisher}, ${year}.`;
  return (
    <ToolShell title="Citation helper" subtitle="APA and MLA in one line">
      <Panel className="p-3">
        <div className="grid gap-2 md:grid-cols-2">
          <Field label="Author"><TextInput value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Aldridge, M." /></Field>
          <Field label="Year"><TextInput value={year} onChange={(e) => setYear(e.target.value)} /></Field>
          <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Publisher / journal"><TextInput value={publisher} onChange={(e) => setPublisher(e.target.value)} /></Field>
        </div>
        <div className="mt-3">
          <Segmented value={style} onChange={setStyle} options={[{ value: 'apa', label: 'APA' }, { value: 'mla', label: 'MLA' }]} />
        </div>
        <div className="mt-3 rounded-[12px] bg-s1 p-3 text-[12.5px]">{style === 'apa' ? apa : mla}</div>
        <Btn size="sm" variant="soft" icon="Copy" className="mt-2" onClick={() => navigator.clipboard?.writeText(style === 'apa' ? apa : mla)}>Copy citation</Btn>
      </Panel>
    </ToolShell>
  );
}

function PracticeLog() {
  const [rows, setRows] = useLocal<Array<{ id: string; topic: string; right: number; wrong: number }>>('practice', []);
  const [topic, setTopic] = useState('');
  return (
    <ToolShell title="Practice-question logger" subtitle="Right and wrong by topic">
      <Panel className="p-3">
        <div className="flex gap-1.5">
          <TextInput value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic" />
          <Btn variant="soft" icon="Plus" onClick={() => { if (topic) { setRows([{ id: uuid(), topic, right: 0, wrong: 0 }, ...rows]); setTopic(''); } }}>Add</Btn>
        </div>
        <div className="mt-3 space-y-1">
          {rows.map((r) => {
            const total = r.right + r.wrong;
            return (
              <div key={r.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
                <span className="flex-1 truncate">{r.topic}</span>
                <Btn size="sm" variant="ghost" onClick={() => setRows(rows.map((x) => (x.id === r.id ? { ...x, right: x.right + 1 } : x)))}>Right {r.right}</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setRows(rows.map((x) => (x.id === r.id ? { ...x, wrong: x.wrong + 1 } : x)))}>Wrong {r.wrong}</Btn>
                <span className="num w-12 text-right" style={{ color: total && r.right / total > 0.7 ? 'var(--success)' : 'var(--warning)' }}>{total ? Math.round((r.right / total) * 100) : 0}%</span>
                <IconBtn icon="Trash2" label="Delete" className="h-6 w-6" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} />
              </div>
            );
          })}
        </div>
      </Panel>
    </ToolShell>
  );
}

function Scratchpad() {
  const [text, setText] = useLocal<string>('scratchpad', '');
  return (
    <ToolShell title="Scratchpad" subtitle="One note that is always exactly where you left it">
      <Panel className="p-3">
        <TextArea rows={18} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything. It saves as you type." style={{ fontFamily: 'var(--font-mono)' }} />
        <div className="mt-2 flex items-center gap-2 text-[11px] text-faint">
          <span>{text.trim().split(/\s+/).filter(Boolean).length} words</span>
          <Btn size="sm" variant="ghost" icon="Download" className="ml-auto" onClick={() => download('scratchpad.txt', text)}>Export</Btn>
        </div>
      </Panel>
    </ToolShell>
  );
}

function JournalTool() {
  const db = useFlow((s) => s.db);
  const addNote = useFlow((s) => s.addNote);
  const updateNote = useFlow((s) => s.updateNote);
  const today = format(new Date(), 'yyyy-MM-dd');
  const existing = db.notes.find((n) => n.journal && n.createdAt.slice(0, 10) === today);
  const [body, setBody] = useState(existing?.body ?? '');
  const [mood, setMood] = useState(existing?.mood ?? 3);
  const moods = [
    { v: 1, icon: 'CloudRain' }, { v: 2, icon: 'Cloud' }, { v: 3, icon: 'CloudSun' }, { v: 4, icon: 'Sun' }, { v: 5, icon: 'Sparkles' },
  ];
  return (
    <ToolShell title="Journal" subtitle="Today's entry, with a mood scale">
      <Panel className="p-3">
        <div className="mb-2 flex items-center gap-1.5">
          {moods.map((m) => (
            <button key={m.v} onClick={() => setMood(m.v)} className="focusable flex h-8 w-8 items-center justify-center rounded-[9px]"
              style={{ background: mood === m.v ? 'var(--accent-soft)' : 'var(--surface-2)', color: mood === m.v ? 'var(--accent)' : 'var(--text-faint)' }}>
              <Icon name={m.icon} size={14} />
            </button>
          ))}
        </div>
        <TextArea rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder="How was today?" />
        <Btn variant="primary" icon="Check" className="mt-2" onClick={() => {
          if (existing) updateNote(existing.id, { body, mood });
          else addNote({ title: `Journal — ${format(new Date(), 'MMM d')}`, body, journal: true, mood, folder: 'Journal', tags: ['journal'] });
          useUI.getState().toast({ title: 'Journal saved', tone: 'success' });
        }}>Save entry</Btn>
      </Panel>
    </ToolShell>
  );
}

function WritingMode() {
  const [text, setText] = useLocal<string>('writing', '');
  const [zen, setZen] = useState(false);
  return (
    <div className={zen ? 'fixed inset-0 z-50 bg-surface p-10' : ''}>
      <ToolShell title="Distraction-free writing" subtitle="Nothing but the words"
        right={<Btn variant="soft" icon={zen ? 'Minimize2' : 'Maximize2'} onClick={() => setZen(!zen)}>{zen ? 'Exit' : 'Full screen'}</Btn>}>
        <Panel className="p-4">
          <TextArea rows={zen ? 22 : 16} value={text} onChange={(e) => setText(e.target.value)} placeholder="Start writing…" style={{ fontFamily: 'var(--font-content)', fontSize: 16, lineHeight: 1.8 }} />
          <div className="mt-2 text-[11px] text-faint">{text.trim().split(/\s+/).filter(Boolean).length} words · {text.length} characters</div>
        </Panel>
      </ToolShell>
    </div>
  );
}

function WordCount() {
  const [text, setText] = useState('');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <ToolShell title="Word and character counter" subtitle="Live counts, reading time and speaking time">
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <Panel className="p-3"><TextArea rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your text" /></Panel>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Words" value={words} />
          <Stat label="Characters" value={text.length} />
          <Stat label="Sentences" value={text.split(/[.!?]+/).filter((s) => s.trim()).length} />
          <Stat label="Paragraphs" value={text.split(/\n{2,}/).filter((p) => p.trim()).length} />
          <Stat label="Reading" value={`${Math.max(1, Math.round(words / 220))}m`} />
          <Stat label="Speaking" value={`${Math.max(1, Math.round(words / 140))}m`} />
        </div>
      </div>
    </ToolShell>
  );
}

function ClipboardHistory() {
  const [rows, setRows] = useLocal<string[]>('clipboard', []);
  return (
    <ToolShell title="Clipboard history" subtitle="Recent text you copied inside Flow"
      right={<Btn variant="soft" icon="Plus" onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) setRows([t, ...rows].slice(0, 30)); } catch { useUI.getState().toast({ title: 'Clipboard permission denied', tone: 'warning' }); } }}>Capture clipboard</Btn>}>
      <Panel className="p-3">
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-2 rounded-[10px] bg-s1 px-2.5 py-2">
              <span className="min-w-0 flex-1 truncate text-[12px]">{r}</span>
              <IconBtn icon="Copy" label="Copy again" className="h-6 w-6" onClick={() => navigator.clipboard?.writeText(r)} />
              <IconBtn icon="X" label="Remove" className="h-6 w-6" onClick={() => setRows(rows.filter((_, x) => x !== i))} />
            </div>
          ))}
          {!rows.length && <div className="py-6 text-center text-[12px] text-faint">Nothing captured yet.</div>}
        </div>
      </Panel>
    </ToolShell>
  );
}

function Whiteboard() {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#fff';
    ctx.lineWidth = 2;
  }, []);
  const draw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };
  return (
    <ToolShell title="Whiteboard" subtitle="Freehand canvas"
      right={<Btn variant="soft" icon="RotateCcw" onClick={() => { const c = ref.current; const ctx = c?.getContext('2d'); if (c && ctx) ctx.clearRect(0, 0, c.width, c.height); }}>Clear</Btn>}>
      <Panel className="p-2">
        <canvas ref={ref} className="h-[60vh] w-full touch-none rounded-[12px] bg-s1"
          onPointerDown={(e) => { drawing.current = true; const ctx = ref.current?.getContext('2d'); const rect = ref.current!.getBoundingClientRect(); ctx?.beginPath(); ctx?.moveTo(e.clientX - rect.left, e.clientY - rect.top); }}
          onPointerMove={draw}
          onPointerUp={() => { drawing.current = false; }}
          onPointerLeave={() => { drawing.current = false; }} />
      </Panel>
    </ToolShell>
  );
}

function MindMap() {
  const [nodes, setNodes] = useLocal<Array<{ id: string; label: string; parent: string | null }>>('mindmap', [{ id: 'root', label: 'Central idea', parent: null }]);
  const [label, setLabel] = useState('');
  const [parent, setParent] = useState('root');
  return (
    <ToolShell title="Mind map" subtitle="Branch ideas out from a centre">
      <Panel className="p-3">
        <div className="flex flex-wrap gap-1.5">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New branch" className="flex-1" />
          <Select value={parent} onChange={setParent} options={nodes.map((n) => ({ value: n.id, label: n.label }))} className="w-40" />
          <Btn variant="soft" icon="Plus" onClick={() => { if (label) { setNodes([...nodes, { id: uuid(), label, parent }]); setLabel(''); } }}>Add</Btn>
        </div>
        <div className="mt-3 space-y-1">
          {nodes.map((n) => {
            const depth = (() => { let d = 0; let cur = n; while (cur.parent) { d += 1; cur = nodes.find((x) => x.id === cur.parent) ?? cur; if (d > 10) break; } return d; })();
            return (
              <div key={n.id} className="flex items-center gap-2 rounded-[8px] bg-s1 px-2 py-1.5" style={{ marginLeft: depth * 18 }}>
                <Icon name={n.parent ? 'GitBranch' : 'Target'} size={12} className="text-accent" />
                <span className="flex-1 text-[12px]">{n.label}</span>
                {n.parent && <IconBtn icon="X" label="Remove" className="h-5 w-5" onClick={() => setNodes(nodes.filter((x) => x.id !== n.id))} />}
              </div>
            );
          })}
        </div>
      </Panel>
    </ToolShell>
  );
}

function Cornell() {
  const [cue, setCue] = useLocal<string>('cornell-cue', '');
  const [notes, setNotes] = useLocal<string>('cornell-notes', '');
  const [summary, setSummary] = useLocal<string>('cornell-summary', '');
  return (
    <ToolShell title="Cornell notes" subtitle="Cue, notes, summary">
      <div className="grid gap-2 md:grid-cols-[220px_1fr]">
        <Panel className="p-2"><div className="label mb-1 px-1">Cue</div><TextArea rows={14} value={cue} onChange={(e) => setCue(e.target.value)} /></Panel>
        <Panel className="p-2"><div className="label mb-1 px-1">Notes</div><TextArea rows={14} value={notes} onChange={(e) => setNotes(e.target.value)} /></Panel>
      </div>
      <Panel className="p-2"><div className="label mb-1 px-1">Summary</div><TextArea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></Panel>
    </ToolShell>
  );
}

function Outline() {
  const [items, setItems] = useLocal<Array<{ id: string; text: string; level: number }>>('outline', [{ id: uuid(), text: 'Main idea', level: 0 }]);
  const [text, setText] = useState('');
  return (
    <ToolShell title="Outline builder" subtitle="Indent with Tab, outdent with Shift Tab">
      <Panel className="p-3">
        <div className="space-y-1">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-1.5" style={{ marginLeft: it.level * 20 }}>
              <span className="h-1.5 w-1.5 rounded-full bg-faint" />
              <TextInput value={it.text} onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') { e.preventDefault(); setItems(items.map((x) => (x.id === it.id ? { ...x, level: Math.max(0, Math.min(5, x.level + (e.shiftKey ? -1 : 1))) } : x))); }
                  if (e.key === 'Enter' && it.text.trim()) { e.preventDefault(); const id = uuid(); setItems([...items, { id, text: '', level: it.level }]); }
                }}
                className="bg-transparent py-1 text-[12.5px]" />
              <IconBtn icon="X" label="Remove" className="h-6 w-6" onClick={() => setItems(items.filter((x) => x.id !== it.id))} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Add item" onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { setItems([...items, { id: uuid(), text, level: 0 }]); setText(''); } }} />
          <Btn variant="soft" icon="Plus" onClick={() => { if (text.trim()) { setItems([...items, { id: uuid(), text, level: 0 }]); setText(''); } }} />
        </div>
      </Panel>
    </ToolShell>
  );
}

/* ------------------------------------------------------------- utilities */

/** Recursive-descent arithmetic parser. No eval, no Function constructor:
 *  user text can never execute anything, and the grammar is the calculator UI. */
export function evaluate(input: string): number {
  const src = input.toLowerCase().replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  let i = 0;

  const peek = () => src[i];
  const eat = (ch: string) => {
    if (src[i] === ch) { i += 1; return true; }
    return false;
  };

  const number = (): number => {
    if (eat('(')) {
      const v = expression();
      if (!eat(')')) throw new Error('missing )');
      return v;
    }
    const fn = /^(sqrt|sin|cos|tan|log|ln|abs|exp)/.exec(src.slice(i));
    if (fn) {
      i += fn[0].length;
      if (!eat('(')) throw new Error('missing (');
      const arg = expression();
      if (!eat(')')) throw new Error('missing )');
      const table: Record<string, (n: number) => number> = {
        sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
        log: Math.log10, ln: Math.log, abs: Math.abs, exp: Math.exp,
      };
      return table[fn[0]](arg);
    }
    if (src.startsWith('pi', i)) { i += 2; return Math.PI; }
    if (src.startsWith('e', i)) { i += 1; return Math.E; }
    const num = /^\d*\.?\d+/.exec(src.slice(i));
    if (!num) throw new Error('expected a number');
    i += num[0].length;
    return Number(num[0]);
  };

  const unary = (): number => {
    if (eat('-')) return -unary();
    if (eat('+')) return unary();
    return number();
  };

  const power = (): number => {
    const base = unary();
    if (eat('^')) return base ** power();
    return base;
  };

  const term = (): number => {
    let v = power();
    for (;;) {
      if (eat('*')) { v *= power(); continue; }
      if (eat('/')) { const d = power(); if (d === 0) throw new Error('divide by zero'); v /= d; continue; }
      if (eat('%')) { v %= power(); continue; }
      return v;
    }
  };

  function expression(): number {
    let v = term();
    for (;;) {
      if (eat('+')) { v += term(); continue; }
      if (eat('-')) { v -= term(); continue; }
      return v;
    }
  }

  const result = expression();
  if (i < src.length) throw new Error(`unexpected "${src.slice(i)}"`);
  if (!Number.isFinite(result)) throw new Error('not a finite number');
  return result;
}

function ScientificCalc() {
  const [expr, setExpr] = useState('2+2');
  const [history, setHistory] = useLocal<Array<{ expr: string; value: string }>>('calc-history', []);
  /** Derived, never stored: the memo returns both the result and any parse error. */
  const { result, error } = useMemo(() => {
    if (!expr.trim()) return { result: '', error: '' };
    try { return { result: String(evaluate(expr)), error: '' }; } catch (err) { return { result: '', error: (err as Error).message }; }
  }, [expr]);
  const keys = ['7', '8', '9', '/', 'sqrt(', '4', '5', '6', '*', '^', '1', '2', '3', '-', '(', '0', '.', '=', '+', ')', 'sin(', 'cos(', 'tan(', 'log(', 'ln('];
  return (
    <ToolShell title="Scientific calculator" subtitle="Typed expressions, kept in history">
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <Panel className="p-3">
          <TextInput value={expr} onChange={(e) => setExpr(e.target.value)} className="text-[18px]" style={{ fontFamily: 'var(--font-mono)' }} onKeyDown={(e) => { if (e.key === 'Enter' && result) setHistory([{ expr, value: result }, ...history].slice(0, 30)); }} />
          <div className="num mt-2 h-10 text-right text-[26px] font-semibold" style={{ color: result ? 'var(--accent)' : 'var(--danger)' }}>{error || result || '—'}</div>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {keys.map((k) => (
              <button key={k} onClick={() => {
                if (k === '=') { if (result) setHistory([{ expr, value: result }, ...history].slice(0, 30)); return; }
                setExpr((prev) => prev + k);
              }} className="focusable rounded-[10px] bg-s2 py-2 text-[13px] hover:bg-s3">{k}</button>
            ))}
          </div>
        </Panel>
        <Panel className="p-3">
          <SectionHead title="History" />
          <div className="space-y-1">
            {history.map((h, i) => (
              <button key={i} onClick={() => setExpr(h.expr)} className="focusable block w-full rounded-[8px] px-2 py-1 text-left text-[11.5px] hover:bg-s1">
                <span className="text-faint">{h.expr}</span> = <span className="num">{h.value}</span>
              </button>
            ))}
            {!history.length && <div className="py-4 text-center text-[11.5px] text-faint">Press Enter to keep a result.</div>}
          </div>
        </Panel>
      </div>
    </ToolShell>
  );
}

function PercentageCalc() {
  const [a, setA] = useState(25);
  const [b, setB] = useState(80);
  return (
    <ToolShell title="Percentage calculator" subtitle="All the percentage questions at once">
      <Panel className="p-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Value A"><TextInput type="number" value={a} onChange={(e) => setA(Number(e.target.value))} /></Field>
          <Field label="Value B"><TextInput type="number" value={b} onChange={(e) => setB(Number(e.target.value))} /></Field>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label={`${a}% of ${b}`} value={(a / 100) * b} />
          <Stat label={`${a} is what % of ${b}`} value={`${((a / b) * 100).toFixed(2)}%`} />
          <Stat label={`% change ${a} → ${b}`} value={`${(((b - a) / a) * 100).toFixed(2)}%`} />
          <Stat label={`${a} increased by ${b}%`} value={(a * (1 + b / 100)).toFixed(2)} />
          <Stat label={`${a} decreased by ${b}%`} value={(a * (1 - b / 100)).toFixed(2)} />
          <Stat label="Difference" value={Math.abs(b - a)} />
        </div>
      </Panel>
    </ToolShell>
  );
}

function UnitConverter() {
  const units: Record<string, Record<string, number>> = {
    Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, inch: 0.0254, ft: 0.3048, mile: 1609.34, yard: 0.9144 },
    Mass: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592, oz: 0.0283495, tonne: 1000 },
    Volume: { L: 1, mL: 0.001, cup: 0.24, pint: 0.473, gallon: 3.785, tbsp: 0.0148 },
    Data: { byte: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 },
    Time: { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800 },
  };
  const [cat, setCat] = useState('Length');
  const [from, setFrom] = useState('m');
  const [to, setTo] = useState('ft');
  const [value, setValue] = useState(1);
  const keys = Object.keys(units[cat]);
  const result = (value * units[cat][from]) / units[cat][to];
  return (
    <ToolShell title="Unit converter" subtitle="Length, mass, volume, data and time">
      <Panel className="p-3">
        <Segmented value={cat} onChange={(v) => { setCat(v); setFrom(Object.keys(units[v])[0]); setTo(Object.keys(units[v])[1]); }} options={Object.keys(units).map((c) => ({ value: c, label: c }))} />
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <Field label="Value"><TextInput type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} /></Field>
          <Field label="From"><Select value={from} onChange={setFrom} options={keys.map((k) => ({ value: k, label: k }))} /></Field>
          <Field label="To"><Select value={to} onChange={setTo} options={keys.map((k) => ({ value: k, label: k }))} /></Field>
          <Field label="Result"><div className="num input">{Number(result.toFixed(6))}</div></Field>
        </div>
      </Panel>
    </ToolShell>
  );
}

function DateDiff() {
  const [a, setA] = useState(toLocalInput(new Date().toISOString()).slice(0, 10));
  const [b, setB] = useState(toLocalInput(addDays(new Date(), 14).toISOString()).slice(0, 10));
  const d1 = new Date(a);
  const d2 = new Date(b);
  return (
    <ToolShell title="Date difference" subtitle="Days, weeks, months and working days between two dates">
      <Panel className="p-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="From"><TextInput type="date" value={a} onChange={(e) => setA(e.target.value)} /></Field>
          <Field label="To"><TextInput type="date" value={b} onChange={(e) => setB(e.target.value)} /></Field>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Days" value={differenceInCalendarDays(d2, d1)} />
          <Stat label="Weeks" value={(differenceInCalendarDays(d2, d1) / 7).toFixed(1)} />
          <Stat label="Hours" value={differenceInCalendarDays(d2, d1) * 24} />
          <Stat label="Working days" value={Array.from({ length: Math.max(0, differenceInCalendarDays(d2, d1)) }, (_, i) => addDays(d1, i)).filter((d) => d.getDay() !== 0 && d.getDay() !== 6).length} />
        </div>
      </Panel>
    </ToolShell>
  );
}

function AgeCalc() {
  const [birth, setBirth] = useState('2007-04-12');
  const b = new Date(birth);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  let days = now.getDate() - b.getDate();
  if (days < 0) { months -= 1; days += 30; }
  if (months < 0) { years -= 1; months += 12; }
  return (
    <ToolShell title="Age / duration calculator" subtitle="Exact age in years, months and days">
      <Panel className="p-3">
        <Field label="Birth date"><TextInput type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></Field>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Age" value={`${years}y ${months}m ${days}d`} />
          <Stat label="Total days" value={differenceInCalendarDays(now, b)} />
          <Stat label="Total hours" value={differenceInCalendarDays(now, b) * 24} />
          <Stat label="Next birthday" value={`${differenceInCalendarDays(new Date(now.getFullYear(), b.getMonth(), b.getDate()) < now ? new Date(now.getFullYear() + 1, b.getMonth(), b.getDate()) : new Date(now.getFullYear(), b.getMonth(), b.getDate()), now)} days`} />
        </div>
      </Panel>
    </ToolShell>
  );
}

function RandomTool() {
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [result, setResult] = useState<number | null>(null);
  const [flip, setFlip] = useState('');
  const [sides, setSides] = useState(6);
  const [dice, setDice] = useState<number | null>(null);
  return (
    <ToolShell title="Random picker, dice and coin" subtitle="Uniform randomness from the browser's CSPRNG">
      <div className="grid gap-3 md:grid-cols-3">
        <Panel className="p-3">
          <SectionHead title="Number" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min"><TextInput type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} /></Field>
            <Field label="Max"><TextInput type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} /></Field>
          </div>
          <Btn variant="primary" className="mt-2" full icon="Shuffle" onClick={() => {
            const arr = new Uint32Array(1); crypto.getRandomValues(arr);
            setResult(min + (arr[0] % Math.max(1, max - min + 1)));
          }}>Pick</Btn>
          <div className="num mt-2 text-center text-[28px] font-semibold">{result ?? '—'}</div>
        </Panel>
        <Panel className="p-3">
          <SectionHead title="Coin" />
          <Btn variant="primary" full icon="Circle" onClick={() => {
            const arr = new Uint8Array(1); crypto.getRandomValues(arr);
            setFlip(arr[0] % 2 ? 'Heads' : 'Tails');
          }}>Flip</Btn>
          <div className="mt-2 text-center text-[24px] font-semibold">{flip || '—'}</div>
        </Panel>
        <Panel className="p-3">
          <SectionHead title="Dice" />
          <Field label="Sides"><TextInput type="number" value={sides} onChange={(e) => setSides(Number(e.target.value))} /></Field>
          <Btn variant="primary" full icon="Dices" className="mt-2" onClick={() => { const arr = new Uint32Array(1); crypto.getRandomValues(arr); setDice((arr[0] % sides) + 1); }}>Roll</Btn>
          <div className="num mt-2 text-center text-[28px] font-semibold">{dice ?? '—'}</div>
        </Panel>
      </div>
    </ToolShell>
  );
}

function ColorTool() {
  const [base, setBase] = useState('#7c8cff');
  const hexToHsl = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0; let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  };
  const hslToHex = (h: number, s: number, l: number) => {
    const sn = s / 100; const ln = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = sn * Math.min(ln, 1 - ln);
    const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  };
  const { h, s, l } = hexToHsl(base);
  const harmonies = {
    Complementary: [h, (h + 180) % 360],
    Analogous: [h, (h + 30) % 360, (h - 30 + 360) % 360],
    Triadic: [h, (h + 120) % 360, (h + 240) % 360],
    Tetradic: [h, (h + 90) % 360, (h + 180) % 360, (h + 270) % 360],
  };
  return (
    <ToolShell title="Colour picker and palette" subtitle="Harmonies generated from a base colour">
      <Panel className="p-3">
        <Field label="Base colour"><input type="color" value={base} onChange={(e) => setBase(e.target.value)} className="h-10 w-24 cursor-pointer rounded-[10px] bg-transparent" /></Field>
        <div className="num mt-2 text-[12px] text-muted">{base} · H {Math.round(h)} S {Math.round(s)} L {Math.round(l)}</div>
        <div className="mt-4 space-y-3">
          {Object.entries(harmonies).map(([name, hues]) => (
            <div key={name}>
              <div className="label mb-1">{name}</div>
              <div className="flex gap-1.5">
                {hues.map((hh, i) => {
                  const hex = hslToHex(hh, s, l);
                  return (
                    <button key={i} onClick={() => navigator.clipboard?.writeText(hex)} className="focusable flex-1 rounded-[10px] py-6 text-[10px] font-medium" style={{ background: hex, color: l > 55 ? '#111' : '#fff' }}>{hex}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </ToolShell>
  );
}

function EncoderTool() {
  const [text, setText] = useState('Flow is local-first');
  const [mode, setMode] = useState<'base64' | 'url'>('base64');
  const encode = () => (mode === 'base64' ? btoa(unescape(encodeURIComponent(text))) : encodeURIComponent(text));
  const decode = () => {
    try { return mode === 'base64' ? decodeURIComponent(escape(atob(text))) : decodeURIComponent(text); } catch { return 'Invalid input'; }
  };
  return (
    <ToolShell title="Base64 / URL encoder" subtitle="Encode and decode without leaving the app">
      <Panel className="p-3">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'base64', label: 'Base64' }, { value: 'url', label: 'URL' }]} />
        <TextArea rows={5} value={text} onChange={(e) => setText(e.target.value)} className="mt-2" />
        <div className="mt-2 flex gap-2">
          <Btn variant="soft" icon="ArrowRight" onClick={() => setText(encode())}>Encode</Btn>
          <Btn variant="soft" icon="ArrowLeft" onClick={() => setText(decode())}>Decode</Btn>
          <Btn variant="ghost" icon="Copy" onClick={() => navigator.clipboard?.writeText(text)}>Copy</Btn>
        </div>
      </Panel>
    </ToolShell>
  );
}

function TextCase() {
  const [text, setText] = useState('flow makes studying feel like one surface');
  const cases = [
    { label: 'UPPER', fn: (s: string) => s.toUpperCase() },
    { label: 'lower', fn: (s: string) => s.toLowerCase() },
    { label: 'Title', fn: (s: string) => s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase()) },
    { label: 'Sentence', fn: (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() },
    { label: 'camel', fn: (s: string) => s.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase()) },
    { label: 'Pascal', fn: (s: string) => s.toLowerCase().replace(/(^|[^a-z0-9]+)(.)/g, (_, __, c) => c.toUpperCase()) },
    { label: 'snake', fn: (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') },
    { label: 'kebab', fn: (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') },
    { label: 'CONSTANT', fn: (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_') },
  ];
  return (
    <ToolShell title="Text case converter" subtitle="Nine casing styles, one click each">
      <Panel className="p-3">
        <TextArea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cases.map((c) => (
            <button key={c.label} onClick={() => setText(c.fn(text))} className="focusable chip hover:bg-s3">{c.label}</button>
          ))}
        </div>
      </Panel>
    </ToolShell>
  );
}

function Lorem() {
  const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
  const [paras, setParas] = useState(3);
  const [out, setOut] = useState('');
  const generate = () => {
    setOut(Array.from({ length: paras }, () => Array.from({ length: 40 + Math.floor(Math.random() * 30) }, () => words[Math.floor(Math.random() * words.length)]).join(' ') + '.').join('\n\n'));
  };
  return (
    <ToolShell title="Lorem ipsum" subtitle="Placeholder text, generated locally">
      <Panel className="p-3">
        <div className="flex gap-1.5">
          <TextInput type="number" value={paras} onChange={(e) => setParas(Number(e.target.value))} className="w-24" />
          <Btn variant="primary" icon="Sparkles" onClick={generate}>Generate</Btn>
          <Btn variant="ghost" icon="Copy" onClick={() => navigator.clipboard?.writeText(out)}>Copy</Btn>
        </div>
        <TextArea rows={12} value={out} onChange={(e) => setOut(e.target.value)} className="mt-2" />
      </Panel>
    </ToolShell>
  );
}

function QrTool() {
  const [text, setText] = useState('https://example.com');
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    if (!text) { setDataUrl(''); return; }
    QRCode.toDataURL(text, { margin: 1, width: 320, color: { dark: '#0b0d12', light: '#ffffff' } })
      .then(setDataUrl)
      .catch(() => setDataUrl(''));
  }, [text]);
  return (
    <ToolShell title="QR code generator" subtitle="Any text or link, generated offline">
      <Panel className="p-3">
        <TextArea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        {dataUrl && (
          <div className="mt-3 flex flex-col items-start gap-2">
            <img src={dataUrl} alt="QR code" className="rounded-[12px]" width={220} height={220} />
            <div className="flex gap-2">
              <Btn size="sm" variant="soft" icon="Download" onClick={() => {
                const a = document.createElement('a');
                a.href = dataUrl; a.download = 'flow-qr.png'; a.click();
              }}>Download PNG</Btn>
              <Btn size="sm" variant="ghost" icon="Copy" onClick={() => navigator.clipboard?.writeText(text)}>Copy text</Btn>
            </div>
          </div>
        )}
      </Panel>
    </ToolShell>
  );
}

function PasswordTool() {
  const [length, setLength] = useState(18);
  const [symbols, setSymbols] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [password, setPassword] = useState('');
  const generate = () => {
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const nums = '23456789';
    const syms = '!@#$%^&*-_=+?';
    let pool = lower + upper + (numbers ? nums : '') + (symbols ? syms : '');
    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    const out = Array.from(arr, (n, i) => {
      if (i === 0) pool = lower + upper + (numbers ? nums : '') + (symbols ? syms : '');
      return pool[n % pool.length];
    }).join('');
    setPassword(out);
  };
  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const strength = password.length > 20 ? 'Very strong' : password.length > 14 ? 'Strong' : password.length > 10 ? 'Okay' : 'Weak';
  return (
    <ToolShell title="Password generator" subtitle="Generated with the browser CSPRNG, never sent anywhere">
      <Panel className="p-3">
        <div className="flex items-center gap-2 rounded-[12px] bg-s1 px-3 py-2.5">
          <span className="num flex-1 break-all text-[14px]">{password}</span>
          <IconBtn icon="Copy" label="Copy password" onClick={() => navigator.clipboard?.writeText(password)} />
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <Field label="Length"><Slider value={length} min={8} max={40} step={1} label="Password length" showValue format={(v) => `${v}`} onChange={setLength} /></Field>
          <Toggle label="Symbols" checked={symbols} onChange={setSymbols} />
          <Toggle label="Numbers" checked={numbers} onChange={setNumbers} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone={strength === 'Weak' ? 'danger' : strength === 'Okay' ? 'warning' : 'success'}>{strength}</Badge>
          <Btn size="sm" variant="primary" icon="RefreshCw" onClick={generate}>Generate</Btn>
        </div>
      </Panel>
    </ToolShell>
  );
}

function HashTool() {
  const [text, setText] = useState('flow');
  const [out, setOut] = useState<Record<string, string>>({});
  const run = async () => {
    const enc = new TextEncoder().encode(text);
    const results: Record<string, string> = {};
    for (const algo of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) {
      const buf = await crypto.subtle.digest(algo, enc);
      results[algo] = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    setOut(results);
  };
  return (
    <ToolShell title="Hash generator" subtitle="SHA-1, SHA-256, SHA-384 and SHA-512">
      <Panel className="p-3">
        <TextArea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <Btn variant="primary" icon="ShieldCheck" className="mt-2" onClick={run}>Hash</Btn>
        <div className="mt-3 space-y-1.5">
          {Object.entries(out).map(([algo, hash]) => (
            <div key={algo} className="rounded-[10px] bg-s1 px-2.5 py-2">
              <div className="text-[10.5px] text-faint">{algo}</div>
              <div className="num break-all text-[11px]">{hash}</div>
            </div>
          ))}
        </div>
      </Panel>
    </ToolShell>
  );
}

function JsonTool() {
  const [text, setText] = useState('{"flow":true,"local":true}');
  const [error, setError] = useState('');
  const format = (minify: boolean) => {
    try {
      const parsed = JSON.parse(text);
      setText(minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <ToolShell title="JSON formatter" subtitle="Format, minify and validate">
      <Panel className="p-3">
        <TextArea rows={14} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
        <div className="mt-2 flex gap-2">
          <Btn variant="soft" icon="Rows" onClick={() => format(false)}>Format</Btn>
          <Btn variant="soft" icon="Minus" onClick={() => format(true)}>Minify</Btn>
          <Btn variant="ghost" icon="Copy" onClick={() => navigator.clipboard?.writeText(text)}>Copy</Btn>
          {error && <span className="text-[11.5px] text-danger">{error}</span>}
        </div>
      </Panel>
    </ToolShell>
  );
}

function RegexTool() {
  const [pattern, setPattern] = useState('(\\w+)@(\\w+)\\.com');
  const [flags, setFlags] = useState('gi');
  const [text, setText] = useState('Write to sam@example.com or alex@school.com');
  const matches = useMemo(() => {
    try {
      const re = new RegExp(pattern, flags);
      return Array.from(text.matchAll(re)).slice(0, 40).map((m) => ({ full: m[0], index: m.index ?? 0 }));
    } catch { return []; }
  }, [pattern, flags, text]);
  let valid = true;
  try { new RegExp(pattern, flags); } catch { valid = false; }
  return (
    <ToolShell title="Regex tester" subtitle="Live matching with capture preview">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-3">
          <div className="flex gap-1.5">
            <TextInput value={pattern} onChange={(e) => setPattern(e.target.value)} className="flex-1" style={{ fontFamily: 'var(--font-mono)' }} />
            <TextInput value={flags} onChange={(e) => setFlags(e.target.value)} className="w-16 text-center" />
          </div>
          <TextArea rows={8} value={text} onChange={(e) => setText(e.target.value)} className="mt-2" />
        </Panel>
        <Panel className="p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone={valid ? 'success' : 'danger'}>{valid ? 'valid' : 'invalid'}</Badge>
            <span className="num text-[11px] text-faint">{matches.length} matches</span>
          </div>
          <div className="space-y-1">
            {matches.map((m, i) => (
              <div key={i} className="rounded-[8px] bg-s1 px-2 py-1.5 text-[11.5px]">
                <span className="num text-faint">@{m.index} </span>{m.full}
              </div>
            ))}
            {!matches.length && <div className="py-6 text-center text-[11.5px] text-faint">No matches.</div>}
          </div>
        </Panel>
      </div>
    </ToolShell>
  );
}

function MarkdownTool() {
  const [text, setText] = useState('# Flow\n\nMarkdown **preview** with `code` and lists:\n\n- one\n- two\n');
  const html = useMemo(() => marked.parse(text, { async: false, gfm: true, breaks: true }) as string, [text]);
  return (
    <ToolShell title="Markdown previewer" subtitle="Live render, same renderer as the notes editor">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-3"><TextArea rows={16} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} /></Panel>
        <Panel className="markdown overflow-y-auto p-4" style={{ maxHeight: '60vh' }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </ToolShell>
  );
}

function TimestampTool() {
  const [ts, setTs] = useState(String(Math.floor(Date.now() / 1000)));
  const [iso, setIso] = useState(new Date().toISOString());
  const fromTs = new Date(Number(ts) * 1000);
  return (
    <ToolShell title="Timestamp converter" subtitle="Unix seconds, milliseconds and ISO 8601">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel className="p-3">
          <Field label="Unix seconds"><TextInput value={ts} onChange={(e) => setTs(e.target.value)} /></Field>
          <div className="mt-2 text-[12px] text-muted">{Number.isNaN(fromTs.getTime()) ? 'Invalid' : fromTs.toLocaleString()}</div>
          <Btn size="sm" variant="ghost" icon="RefreshCw" className="mt-2" onClick={() => setTs(String(Math.floor(Date.now() / 1000)))}>Now</Btn>
        </Panel>
        <Panel className="p-3">
          <Field label="ISO 8601"><TextInput value={iso} onChange={(e) => setIso(e.target.value)} /></Field>
          <div className="num mt-2 text-[12px] text-muted">{Math.floor(new Date(iso).getTime() / 1000)}</div>
        </Panel>
      </div>
    </ToolShell>
  );
}

function TimezoneTool() {
  const [base, setBase] = useState('America/Toronto');
  const [hour, setHour] = useState('09:00');
  const zones = ['America/Toronto', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Kolkata'];
  const [h, m] = hour.split(':').map(Number);
  const baseDate = new Date();
  baseDate.setHours(h || 0, m || 0, 0, 0);
  return (
    <ToolShell title="Timezone meeting planner" subtitle="Find an hour that works everywhere">
      <Panel className="p-3">
        <div className="grid gap-2 md:grid-cols-2">
          <Field label="Your zone"><Select value={base} onChange={setBase} options={zones.map((z) => ({ value: z, label: z }))} /></Field>
          <Field label="Your time"><TextInput type="time" value={hour} onChange={(e) => setHour(e.target.value)} /></Field>
        </div>
        <div className="mt-3 space-y-1">
          {zones.map((z) => {
            const local = new Date(baseDate.toLocaleString('en-US', { timeZone: base }));
            const other = new Date(baseDate.toLocaleString('en-US', { timeZone: z }));
            const offset = Math.round((other.getTime() - local.getTime()) / 3600000);
            const time = baseDate.toLocaleTimeString('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit' });
            const hourNum = Number(time.slice(0, 2));
            const good = hourNum >= 9 && hourNum <= 18;
            return (
              <div key={z} className="flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12px]" style={{ background: good ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'var(--surface-1)' }}>
                <span className="flex-1">{z.replace('_', ' ')}</span>
                <span className="text-[10.5px] text-faint">{offset >= 0 ? '+' : ''}{offset}h</span>
                <span className="num">{time}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </ToolShell>
  );
}

function FilesTool() {
  return (
    <ToolShell title="File shortcuts" subtitle="Open local files and folders from Flow">
      <Panel className="p-3">
        <p className="text-[12.5px] text-muted">In the packaged Electron build this page stores paths and opens them with the system handler through the preload bridge.</p>
        <div className="mt-2 space-y-1">
          {['Notes folder', 'Syllabus PDF', 'Chem lab data'].map((f) => (
            <div key={f} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2 text-[12px]">
              <Icon name="FolderOpen" size={13} className="text-muted" />
              <span className="flex-1">{f}</span>
              <Badge>browser preview</Badge>
            </div>
          ))}
        </div>
      </Panel>
    </ToolShell>
  );
}

function Budget() {
  const [rows, setRows] = useLocal<Array<{ id: string; label: string; amount: number; category: string }>>('budget', []);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState('Food');
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <ToolShell title="Budget / expense tracker" subtitle="Simple local expense log">
      <Panel className="p-3">
        <div className="flex flex-wrap gap-1.5">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What" className="flex-1" />
          <TextInput type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-24" />
          <Select value={category} onChange={setCategory} options={['Food', 'Transport', 'Books', 'Fun', 'Other'].map((c) => ({ value: c, label: c }))} className="w-32" />
          <Btn variant="soft" icon="Plus" onClick={() => { if (label) { setRows([{ id: uuid(), label, amount, category }, ...rows]); setLabel(''); setAmount(0); } }}>Add</Btn>
        </div>
        <div className="mt-3 space-y-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
              <span className="flex-1 truncate">{r.label}</span>
              <Chip>{r.category}</Chip>
              <span className="num w-16 text-right">{r.amount.toFixed(2)}</span>
              <IconBtn icon="Trash2" label="Delete" className="h-6 w-6" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12px]">
          <span className="text-faint">Total</span><span className="num font-medium">{total.toFixed(2)}</span>
          <Btn size="sm" variant="ghost" icon="Download" className="ml-auto" onClick={() => download('expenses.csv', toCSV(rows), 'text/csv')}>CSV</Btn>
        </div>
      </Panel>
    </ToolShell>
  );
}

function Subscriptions() {
  const [rows, setRows] = useLocal<Array<{ id: string; name: string; cost: number; renew: string }>>('subs', []);
  const [name, setName] = useState('');
  const [cost, setCost] = useState(0);
  const [renew, setRenew] = useState('');
  return (
    <ToolShell title="Subscriptions tracker" subtitle="Renewal dates and monthly cost">
      <Panel className="p-3">
        <div className="flex flex-wrap gap-1.5">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Service" className="flex-1" />
          <TextInput type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} className="w-24" />
          <TextInput type="date" value={renew} onChange={(e) => setRenew(e.target.value)} className="w-40" />
          <Btn variant="soft" icon="Plus" onClick={() => { if (name) { setRows([...rows, { id: uuid(), name, cost, renew }]); setName(''); } }}>Add</Btn>
        </div>
        <div className="mt-3 space-y-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
              <span className="flex-1 truncate">{r.name}</span>
              <span className="num">{r.cost.toFixed(2)}</span>
              <span className="text-[11px] text-faint">{r.renew ? format(new Date(r.renew), 'MMM d') : '—'}</span>
              <span className="text-[11px]" style={{ color: differenceInCalendarDays(new Date(r.renew || Date.now()), new Date()) < 7 ? 'var(--warning)' : 'var(--text-faint)' }}>
                {r.renew ? `${differenceInCalendarDays(new Date(r.renew), new Date())}d` : ''}
              </span>
              <IconBtn icon="Trash2" label="Delete" className="h-6 w-6" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} />
            </div>
          ))}
        </div>
        <div className="mt-2 text-[12px] text-faint">Monthly total: <span className="num">{rows.reduce((a, r) => a + r.cost, 0).toFixed(2)}</span></div>
      </Panel>
    </ToolShell>
  );
}

function GlobalSearch() {
  const db = useFlow((s) => s.db);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    const out: Array<{ id: string; type: string; label: string; route: string; icon: string }> = [];
    db.todos.filter((t) => t.title.toLowerCase().includes(needle)).forEach((t) => out.push({ id: t.id, type: 'Todo', label: t.title, route: '/todos', icon: 'CheckSquare' }));
    db.notes.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(needle)).forEach((n) => out.push({ id: n.id, type: 'Note', label: n.title, route: `/notes?open=${n.id}`, icon: 'NotebookPen' }));
    db.marks.filter((m) => m.title.toLowerCase().includes(needle)).forEach((m) => out.push({ id: m.id, type: 'Mark', label: m.title, route: `/grades/${m.subjectId}`, icon: 'Percent' }));
    db.habits.filter((h) => h.name.toLowerCase().includes(needle)).forEach((h) => out.push({ id: h.id, type: 'Habit', label: h.name, route: '/habits', icon: h.icon }));
    db.goals.filter((g) => g.title.toLowerCase().includes(needle)).forEach((g) => out.push({ id: g.id, type: 'Goal', label: g.title, route: '/goals', icon: g.icon }));
    db.subjects.filter((s) => s.name.toLowerCase().includes(needle)).forEach((s) => out.push({ id: s.id, type: 'Subject', label: s.name, route: `/grades/${s.id}`, icon: s.icon }));
    return out.slice(0, 40);
  }, [q, db]);
  return (
    <ToolShell title="Global search" subtitle="Todos, notes, marks, habits, goals and subjects at once">
      <Panel className="p-3">
        <div className="flex items-center gap-2 rounded-[12px] bg-s1 px-3">
          <Icon name="Search" size={14} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search everything" className="h-10 flex-1 bg-transparent text-[13px] placeholder:text-faint" />
        </div>
        <div className="mt-2 space-y-1">
          {results.map((r) => (
            <button key={`${r.type}-${r.id}`} onClick={() => navigate(r.route)} className="focusable flex w-full items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-2 text-left hover:bg-s2">
              <Icon name={r.icon} size={13} className="text-muted" />
              <span className="flex-1 truncate text-[12.5px]">{r.label}</span>
              <Chip>{r.type}</Chip>
            </button>
          ))}
          {q && !results.length && <div className="py-6 text-center text-[12px] text-faint">Nothing matches "{q}".</div>}
        </div>
      </Panel>
    </ToolShell>
  );
}

function TagManager() {
  const db = useFlow((s) => s.db);
  const updateTodo = useFlow((s) => s.updateTodo);
  const [rename, setRename] = useState({ from: '', to: '' });
  const tags = Array.from(new Set(db.todos.flatMap((t) => t.tags)));
  return (
    <ToolShell title="Tag manager" subtitle={`${tags.length} tags across todos and notes`}>
      <Panel className="p-3">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button key={t} onClick={() => setRename({ from: t, to: t })} className="focusable chip hover:bg-s3">#{t} <span className="num text-[10px] text-faint">{db.todos.filter((x) => x.tags.includes(t)).length}</span></button>
          ))}
          {!tags.length && <div className="text-[12px] text-faint">No tags yet — add them with # in quick add.</div>}
        </div>
        {rename.from && (
          <div className="mt-3 flex gap-1.5">
            <TextInput value={rename.to} onChange={(e) => setRename({ ...rename, to: e.target.value })} />
            <Btn variant="soft" icon="Check" onClick={() => {
              db.todos.filter((t) => t.tags.includes(rename.from)).forEach((t) => updateTodo(t.id, { tags: Array.from(new Set(t.tags.map((x) => (x === rename.from ? rename.to : x)))) }));
              setRename({ from: '', to: '' });
            }}>Rename</Btn>
          </div>
        )}
      </Panel>
    </ToolShell>
  );
}

function SavedViews() {
  return (
    <ToolShell title="Saved views" subtitle="Store filter combinations you reuse">
      <Panel className="p-3 text-[12.5px] text-muted">
        Smart lists already cover the common cases (Today, Overdue, High priority, Waiting, Someday). Custom saved views arrive with the shared filter bar — the palette already accepts <span className="num">/</span> to jump to any page with its filters.
      </Panel>
    </ToolShell>
  );
}

function BackupTool() {
  const exportJSON = useFlow((s) => s.exportJSON);
  const importJSON = useFlow((s) => s.importJSON);
  const toast = useUI((s) => s.toast);
  const [text, setText] = useState('');
  return (
    <ToolShell title="Backup scheduler" subtitle="Local JSON backups with retention">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-3">
          <SectionHead title="Export a backup" subtitle="Everything in one file" />
          <Btn variant="primary" icon="Download" onClick={() => download(`flow-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`, exportJSON(), 'application/json')}>Download backup</Btn>
          <div className="mt-3 rounded-[12px] bg-s1 p-3 text-[11.5px] text-muted">
            The Electron build writes a rolling backup into the user data folder after every debounced save and keeps the last 10.
          </div>
        </Panel>
        <Panel className="p-3">
          <SectionHead title="Restore" subtitle="Paste a backup JSON" />
          <TextArea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"version":3,...}' />
          <Btn variant="soft" icon="Upload" className="mt-2" onClick={() => {
            const ok = importJSON(text);
            toast({ title: ok ? 'Backup restored' : 'That file could not be read', tone: ok ? 'success' : 'danger' });
          }}>Restore</Btn>
        </Panel>
      </div>
    </ToolShell>
  );
}

function ExportTool() {
  const db = useFlow((s) => s.db);
  const exportJSON = useFlow((s) => s.exportJSON);
  const importJSON = useFlow((s) => s.importJSON);
  const toast = useUI((s) => s.toast);
  const stat = [
    ['Todos', db.todos.length], ['Notes', db.notes.length], ['Marks', db.marks.length], ['Subjects', db.subjects.length],
    ['Habits', db.habits.length], ['Habit logs', db.habitLogs.length], ['Sessions', db.focusSessions.length], ['Goals', db.goals.length],
  ] as const;
  return (
    <ToolShell title="Full data export / import" subtitle="JSON and CSV, no cloud involved">
      <Panel className="p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {stat.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variant="primary" icon="Download" onClick={() => download('flow.json', exportJSON(), 'application/json')}>JSON</Btn>
          <Btn variant="soft" icon="Table" onClick={() => download('flow-todos.csv', toCSV(db.todos.map((t) => ({ title: t.title, status: t.status, dueAt: t.dueAt ?? '', priority: t.priority, category: t.categoryId ?? '' }))), 'text/csv')}>Todos CSV</Btn>
          <Btn variant="soft" icon="Table" onClick={() => download('flow-marks.csv', toCSV(db.marks.map((m) => ({ title: m.title, score: m.score ?? '', max: m.max, status: m.status, date: m.date }))), 'text/csv')}>Marks CSV</Btn>
          <label className="focusable inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-s2 px-3.5 text-[13px] hover:bg-s3">
            <Icon name="Upload" size={15} /> Import JSON
            <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              toast({ title: importJSON(text) ? 'Import complete' : 'Import failed', tone: importJSON(text) ? 'success' : 'danger' });
            }} />
          </label>
        </div>
        <div className="mt-3 rounded-[12px] bg-s1 p-3 text-[11.5px] text-muted">
          Export before importing something big. Flow keeps an undo stack for edits but a full import replaces the database.
        </div>
      </Panel>
    </ToolShell>
  );
}

function UndoHistory() {
  const past = useFlow((s) => s.past);
  const future = useFlow((s) => s.future);
  const undo = useFlow((s) => s.undo);
  const redo = useFlow((s) => s.redo);
  return (
    <ToolShell title="Undo history" subtitle={`${past.length} steps back, ${future.length} forward`}>
      <Panel className="p-3">
        <div className="flex gap-2">
          <Btn variant="soft" icon="Undo2" disabled={!past.length} onClick={undo}>Undo</Btn>
          <Btn variant="soft" icon="Redo2" disabled={!future.length} onClick={redo}>Redo</Btn>
        </div>
        <div className="mt-3 space-y-1">
          {past.slice(-12).reverse().map((snap, i) => (
            <div key={i} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[11.5px]">
              <span className="num text-faint">{past.length - i}</span>
              <span className="flex-1">{snap.todos.length} todos · {snap.notes.length} notes · {snap.marks.length} marks</span>
            </div>
          ))}
          {!past.length && <div className="py-4 text-center text-[11.5px] text-faint">No history yet in this session.</div>}
        </div>
      </Panel>
    </ToolShell>
  );
}

function ActivityLog() {
  const activity = useFlow((s) => s.db.activity);
  return (
    <ToolShell title="Activity log" subtitle="Everything that changed, newest first">
      <Panel className="p-3">
        <div className="space-y-1">
          {activity.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
              <Icon name={a.kind === 'todo' ? 'CheckSquare' : a.kind === 'habit' ? 'Flame' : a.kind === 'grade' ? 'GraduationCap' : 'Activity'} size={12} className="text-faint" />
              <span className="flex-1 truncate">{a.text}</span>
              <span className="text-[10.5px] text-faint">{format(new Date(a.at), 'MMM d, h:mm a')}</span>
            </div>
          ))}
          {!activity.length && <div className="py-6 text-center text-[12px] text-faint">No activity recorded yet.</div>}
        </div>
      </Panel>
    </ToolShell>
  );
}

function Shortcuts() {
  const groups = [
    { name: 'Global', items: [['Ctrl/Cmd K', 'Command palette'], ['Ctrl/Cmd Shift Space', 'Quick capture'], ['Ctrl/Cmd Z', 'Undo'], ['Ctrl/Cmd Shift Z', 'Redo'], ['Ctrl/Cmd Shift F', 'Mini mode'], ['?', 'This sheet']] },
    { name: 'Todos', items: [['j / k', 'Move selection'], ['space', 'Complete task'], ['e', 'Edit task'], ['d', 'Defer a day'], ['t', 'Due today'], ['p', 'Cycle priority'], ['/', 'Focus filter']] },
    { name: 'Notes', items: [['Enter', 'New line'], ['[[', 'Link to another note'], ['Ctrl/Cmd B', 'Bold (markdown)']] },
    { name: 'Flashcards', items: [['1', 'Again'], ['2', 'Hard'], ['3', 'Good'], ['4', 'Easy']] },
  ];
  return (
    <ToolShell title="Keyboard shortcuts" subtitle="Everything reachable without a mouse">
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <Panel key={g.name} className="p-3">
            <SectionHead title={g.name} />
            <div className="space-y-1">
              {g.items.map(([k, label]) => (
                <div key={k} className="flex items-center gap-2 text-[12px]">
                  <kbd className="num rounded-[6px] bg-s2 px-1.5 py-0.5 text-[10.5px] text-muted">{k}</kbd>
                  <span className="text-muted">{label}</span>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </ToolShell>
  );
}

function WidgetGallery() {
  const settings = useFlow((s) => s.db.settings);
  const updateSettings = useFlow((s) => s.updateSettings);
  const all = [
    { id: 'quickstats', label: 'Quick stats', icon: 'Gauge', desc: 'Focus, streak, open tasks, GPA' },
    { id: 'focus', label: 'Focus engine', icon: 'Timer', desc: 'Ring, controls and current task' },
    { id: 'today', label: "Today's tasks", icon: 'Sun', desc: 'Due today plus overdue' },
    { id: 'habits', label: 'Habit week', icon: 'Flame', desc: 'Check-ins and weekly rings' },
    { id: 'heatmap', label: 'Study heatmap', icon: 'LayoutGrid', desc: '18-week strip with legend' },
    { id: 'grades', label: 'Grades', icon: 'GraduationCap', desc: 'Per-subject percentages' },
    { id: 'goals', label: 'Goals', icon: 'Target', desc: 'Progress bars' },
    { id: 'upcoming', label: 'Upcoming assessments', icon: 'CalendarClock', desc: 'Next pending marks' },
    { id: 'notes', label: 'Recent notes', icon: 'NotebookPen', desc: 'Most recently edited' },
  ];
  const active = settings.dashboardWidgets;
  return (
    <ToolShell title="Dashboard widget gallery" subtitle="Choose what the dashboard shows">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {all.map((w) => {
          const on = active.includes(w.id);
          return (
            <Panel key={w.id} className="flex items-center gap-2.5 p-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-s2 text-muted"><Icon name={w.icon} size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium">{w.label}</div>
                <div className="text-[11px] text-muted">{w.desc}</div>
              </div>
              <Toggle label="" checked={on} onChange={(v) => updateSettings((s) => ({ ...s, dashboardWidgets: v ? [...s.dashboardWidgets, w.id] : s.dashboardWidgets.filter((x) => x !== w.id) }))} />
            </Panel>
          );
        })}
      </div>
    </ToolShell>
  );
}

function Changelog() {
  const entries = [
    { v: '1.0.0', date: 'October 2026', items: ['Todos with start and due times, eight views and natural-language capture', 'Main-process notification scheduler with actions, snooze and quiet hours', 'Pomodoro engine with liquid ring, profiles and session logging', '53x7 study heatmap with filters, day panel and PNG/SVG export', 'Weekly habits with streaks, heatmaps, pause mode and timer auto check-in', 'Subject-scoped grades with weights, what-if maths and GPA tools', 'Procedural Sound Studio with 27 generators, presets and sleep timer', '140 tools, command palette, onboarding and full theme/font studio'] },
  ];
  return (
    <ToolShell title="What shipped" subtitle="Changelog for this build">
      {entries.map((e) => (
        <Panel key={e.v} className="p-4">
          <div className="flex items-center gap-2">
            <Badge tone="accent">v{e.v}</Badge>
            <span className="text-[11.5px] text-faint">{e.date}</span>
          </div>
          <ul className="mt-2 space-y-1">
            {e.items.map((i) => (
              <li key={i} className="flex gap-2 text-[12.5px] text-muted"><Icon name="Check" size={13} className="mt-0.5 shrink-0 text-success" />{i}</li>
            ))}
          </ul>
        </Panel>
      ))}
    </ToolShell>
  );
}
