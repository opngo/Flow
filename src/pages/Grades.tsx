import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useFlow } from '../store';
import { useUI } from '../ui';
import {
  Badge, Btn, Chip, ColorPicker, ConfirmDialog, EmptyState, Field, Icon, IconBtn, IconPicker, MenuBtn,
  Modal, Panel, ProgressRing, SectionHead, Segmented, Select, Sparkline, Stat, TextArea, TextInput, Toggle,
} from '../components/ui';
import {
  computeSubjectGrade, gradeTrend, letterFor, neededOnFinal, normalizedWeights, pctOf, projections,
  termGPA, LETTER_SCALE,
} from '../lib/grades';
import { download } from '../lib/platform';
import { fmtDate, minsToHM, parseCSV, toCSV, uuid, cn } from '../lib/utils';
import type { Mark, Subject } from '../lib/types';

export default function Grades() {
  const { subjectId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const db = useFlow((s) => s.db);
  const addSubject = useFlow((s) => s.addSubject);

  const active = db.subjects.find((s) => s.id === subjectId);
  const view = params.get('view') ?? 'overview';

  useEffect(() => {
    if (params.get('new')) { params.delete('new'); setParams(params, { replace: true }); navigate(`/grades`, { replace: true }); }
  }, [params, setParams, navigate]);

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="hidden w-56 shrink-0 flex-col gap-2 lg:flex">
        <div className="px-2.5 pt-1">
          <div className="h1">Grades</div>
          <div className="mt-0.5 text-[12px] text-muted">{db.subjects.length} subjects · GPA {termGPA(db.subjects, db.marks).toFixed(2)}</div>
        </div>
        <button onClick={() => navigate('/grades')} className={cn('focusable flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px]', !active ? 'bg-s2 text-ink' : 'text-muted hover:bg-s1')}>
          <Icon name="LayoutDashboard" size={14} /> Overview
        </button>
        <div className="label px-2.5 pt-2">Subjects</div>
        {db.subjects.map((s) => {
          const grade = computeSubjectGrade(s, db.marks);
          const trend = gradeTrend(s, db.marks).slice(-8).map((t) => t.pct);
          return (
            <button key={s.id} onClick={() => navigate(`/grades/${s.id}`)}
              className={cn('focusable flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left', active?.id === s.id ? 'bg-s2 text-ink' : 'text-muted hover:bg-s1')}>
              <Icon name={s.icon} size={14} style={{ color: s.color }} />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{s.name}</span>
              <Sparkline data={trend} width={32} height={14} color={s.color} />
              <span className="num text-[11.5px]" style={{ color: s.color }}>{grade.pct != null ? grade.pct.toFixed(0) : '—'}</span>
            </button>
          );
        })}
        <Btn variant="soft" size="sm" icon="Plus" className="mt-1" onClick={() => addSubject({ name: 'New subject' })}>Add subject</Btn>
        <div className="divider" />
        {[
          { id: 'gpa', label: 'GPA calculator', icon: 'Award' },
          { id: 'compare', label: 'Compare subjects', icon: 'BarChart3' },
          { id: 'trends', label: 'Trend charts', icon: 'LineChart' },
        ].map((v) => (
          <button key={v.id} onClick={() => setParams({ view: v.id })} className={cn('focusable flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px]', view === v.id ? 'bg-s2 text-ink' : 'text-muted hover:bg-s1')}>
            <Icon name={v.icon} size={14} /> {v.label}
          </button>
        ))}
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto pb-8">
        {subjectId && active
          ? <SubjectDetail subject={active} />
          : view === 'gpa' ? <GpaCalculator />
            : view === 'whatif' ? <WhatIfOverview />
            : view === 'compare' ? <CompareSubjects />
              : view === 'trends' ? <TrendsView />
                : <Overview />}
      </section>
    </div>
  );
}

function Overview() {
  const db = useFlow((s) => s.db);
  const navigate = useNavigate();
  const addSubject = useFlow((s) => s.addSubject);
  const grades = db.subjects.map((s) => ({ subject: s, grade: computeSubjectGrade(s, db.marks) }));
  const withPct = grades.filter((g) => g.grade.pct != null);
  const best = [...withPct].sort((a, b) => (b.grade.pct ?? 0) - (a.grade.pct ?? 0))[0];
  const worst = [...withPct].sort((a, b) => (a.grade.pct ?? 0) - (b.grade.pct ?? 0))[0];
  const upcoming = db.marks.filter((m) => m.status === 'pending').sort((a, b) => +new Date(a.date) - +new Date(b.date));

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Grade overview</h1>
          <div className="mt-0.5 text-[12px] text-muted">{db.subjects[0]?.term || 'Current term'}</div>
        </div>
        <Btn variant="primary" icon="Plus" onClick={() => addSubject({ name: 'New subject' })}>Add subject</Btn>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Term GPA" value={termGPA(db.subjects, db.marks).toFixed(2)} sub="credit weighted" icon="Award" tone="accent" />
        <Stat label="Best subject" value={best?.subject.name.split(' ')[0] ?? '—'} sub={best?.grade.pct ? `${best.grade.pct.toFixed(1)}%` : ''} icon="TrendingUp" tone="success" />
        <Stat label="Needs attention" value={worst?.subject.name.split(' ')[0] ?? '—'} sub={worst?.grade.pct ? `${worst.grade.pct.toFixed(1)}%` : ''} icon="TrendingDown" tone="warning" />
        <Stat label="Upcoming" value={upcoming.length} sub="assessments pending" icon="CalendarClock" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {grades.map(({ subject, grade }) => (
          <Panel key={subject.id} className="cursor-pointer p-3.5 transition-transform hover:-translate-y-0.5" onClick={() => navigate(`/grades/${subject.id}`)}>
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ background: `color-mix(in srgb, ${subject.color} 17%, transparent)` }}>
                <Icon name={subject.icon} size={16} style={{ color: subject.color }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{subject.name}</div>
                <div className="text-[11px] text-faint">{subject.teacher || 'No teacher'} · {subject.room || 'no room'}</div>
              </div>
              <div className="text-right">
                <div className="num text-[20px] font-semibold leading-none" style={{ color: subject.color }}>{grade.pct != null ? `${grade.pct.toFixed(1)}%` : '—'}</div>
                <div className="text-[11px] text-muted">{grade.letter}</div>
              </div>
            </div>
            <div className="mt-2.5">
              <Sparkline data={gradeTrend(subject, db.marks).slice(-12).map((t) => t.pct)} width={240} height={26} color={subject.color} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip icon="ClipboardList">{grade.gradedCount} graded</Chip>
              {grade.pendingCount > 0 && <Chip icon="Clock" color="var(--warning)">{grade.pendingCount} pending</Chip>}
              {grade.missingCount > 0 && <Chip icon="CircleAlert" color="var(--danger)">{grade.missingCount} missing</Chip>}
              {subject.targetPct && <Chip icon="Target">target {subject.targetPct}%</Chip>}
              {grade.weightTotal !== 100 && grade.weightTotal > 0 && <Chip icon="Percent" color="var(--warning)">weights {grade.weightTotal}%</Chip>}
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="p-3">
        <SectionHead title="Upcoming assessments" subtitle="Created as pending marks — enter a score and they become graded" />
        <div className="space-y-1">
          {upcoming.map((m) => {
            const subject = db.subjects.find((s) => s.id === m.subjectId);
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-[12px]">
                <Icon name={subject?.icon ?? 'BookOpen'} size={13} style={{ color: subject?.color }} />
                <span className="flex-1 truncate">{m.title}</span>
                <Chip>{subject?.name}</Chip>
                <span className="num text-[11px] text-faint">{fmtDate(m.date, 'EEE, MMM d')}</span>
                <MarkQuickEntry mark={m} />
              </div>
            );
          })}
          {!upcoming.length && <div className="py-6 text-center text-[12px] text-faint">No pending assessments.</div>}
        </div>
      </Panel>
    </div>
  );
}

function MarkQuickEntry({ mark }: { mark: Mark }) {
  const updateMark = useFlow((s) => s.updateMark);
  const [score, setScore] = useState('');
  return (
    <div className="flex items-center gap-1">
      <TextInput value={score} onChange={(e) => setScore(e.target.value)} placeholder="—" className="w-14 py-1 text-center text-[11.5px]" aria-label="Score" />
      <Btn size="sm" variant="ghost" icon="Check" onClick={() => {
        const n = Number(score);
        if (!Number.isNaN(n) && score !== '') updateMark(mark.id, { score: n, status: 'graded' });
      }}>Save</Btn>
    </div>
  );
}

function SubjectDetail({ subject }: { subject: Subject }) {
  const db = useFlow((s) => s.db);
  const navigate = useNavigate();
  const flow = useFlow.getState();
  const [tab, setTab] = useState<'marks' | 'categories' | 'whatif' | 'trends' | 'report'>('marks');
  const [markOpen, setMarkOpen] = useState(false);
  const [editingMark, setEditingMark] = useState<Mark | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [asZero, setAsZero] = useState({ pending: false, missing: true });

  const marks = db.marks.filter((m) => m.subjectId === subject.id);
  const grade = computeSubjectGrade(subject, db.marks, { treatPendingAsZero: asZero.pending, treatMissingAsZero: asZero.missing });
  const trend = gradeTrend(subject, db.marks);
  const catName = (id: string) => subject.categories.find((c) => c.id === id)?.name ?? 'Uncategorised';

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-[15px]" style={{ background: `color-mix(in srgb, ${subject.color} 18%, transparent)` }}>
          <Icon name={subject.icon} size={22} style={{ color: subject.color }} />
        </span>
        <div className="min-w-0">
          <h1 className="h1">{subject.name}</h1>
          <div className="text-[12px] text-muted">{subject.teacher || 'No teacher'} · {subject.room || 'No room'} · {subject.term || 'No term'} · {subject.credits} credit{subject.credits === 1 ? '' : 's'}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="num text-[24px] font-semibold leading-none" style={{ color: subject.color }}>{grade.pct != null ? `${grade.pct.toFixed(1)}%` : '—'}</div>
            <div className="text-[11px] text-muted">{grade.letter} · GPA {grade.gpa.toFixed(2)}</div>
          </div>
          <ProgressRing value={grade.pct ?? 0} size={48} stroke={5} color={subject.color} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'marks', label: 'Marks', icon: 'ClipboardList' },
          { value: 'categories', label: 'Categories', icon: 'Percent' },
          { value: 'whatif', label: 'What-if', icon: 'Calculator' },
          { value: 'trends', label: 'Trends', icon: 'LineChart' },
          { value: 'report', label: 'Report', icon: 'Printer' },
        ]} />
        <div className="ml-auto flex gap-2">
          <Btn variant="soft" icon="Settings2" onClick={() => setSubjectOpen(true)}>Subject</Btn>
          <Btn variant="soft" icon="Table" onClick={() => setBulkOpen(true)}>Bulk entry</Btn>
          <Btn variant="primary" icon="Plus" onClick={() => { setEditingMark(null); setMarkOpen(true); }}>Add mark</Btn>
        </div>
      </div>

      {grade.weightTotal !== 100 && grade.weightTotal > 0 && (
        <div className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-[12px]" style={{ background: 'color-mix(in srgb, var(--warning) 14%, transparent)', color: 'var(--warning)' }}>
          <Icon name="CircleAlert" size={14} />
          Category weights add up to {grade.weightTotal}%. Grades use the relative weights — normalize to make it explicit.
          <Btn size="sm" variant="ghost" className="ml-auto" onClick={() => flow.normalizeWeights(subject.id)}>Normalize</Btn>
        </div>
      )}

      {tab === 'marks' && (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <Panel className="p-3">
            <SectionHead title="Marks" subtitle={`${marks.length} entries · ${grade.gradedCount} graded`}
              right={<div className="flex gap-2"><Btn size="sm" variant="ghost" icon="Download" onClick={() => download(`${subject.name}-marks.csv`, toCSV(marks.map((m) => ({ title: m.title, category: catName(m.categoryId), score: m.score, max: m.max, status: m.status, date: m.date.slice(0, 10) }))), 'text/csv')}>CSV</Btn></div>} />
            <div className="space-y-1">
              {[...marks].sort((a, b) => +new Date(b.date) - +new Date(a.date)).map((m) => (
                <div key={m.id} className="group flex items-center gap-2 rounded-[10px] px-2 py-1.5 hover:bg-s1">
                  <span className="w-20 shrink-0 text-[10.5px] text-faint">{fmtDate(m.date, 'MMM d')}</span>
                  <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', m.status === 'pending' && 'text-muted')}>{m.title}</span>
                  <Chip>{catName(m.categoryId)}</Chip>
                  {m.status === 'missing' && <Badge tone="danger">missing</Badge>}
                  {m.status === 'pending' && <Badge tone="warning">pending</Badge>}
                  {m.status === 'excused' && <Badge>excused</Badge>}
                  <span className="num w-16 text-right text-[12px]">{m.score != null ? `${m.score}/${m.max}` : '—'}</span>
                  <span className="num w-12 text-right text-[11.5px]" style={{ color: m.status === 'graded' ? subject.color : 'var(--text-faint)' }}>
                    {m.status === 'graded' ? `${pctOf(m).toFixed(0)}%` : '—'}
                  </span>
                  <div className="opacity-0 group-hover:opacity-100">
                    <IconBtn icon="Edit3" label="Edit mark" className="h-6 w-6" onClick={() => { setEditingMark(m); setMarkOpen(true); }} />
                  </div>
                </div>
              ))}
              {!marks.length && <EmptyState icon="ClipboardList" title="No marks yet" body="Add your first mark — Enter saves and reopens a fresh form." action={<Btn variant="primary" onClick={() => setMarkOpen(true)}>Add mark</Btn>} />}
            </div>
          </Panel>

          <div className="space-y-3">
            <Panel className="p-3">
              <SectionHead title="Category breakdown" />
              <div className="space-y-2">
                {grade.breakdown.map((b) => (
                  <div key={b.categoryId}>
                    <div className="flex items-center gap-2 text-[11.5px]">
                      <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                      <span className="flex-1 truncate">{b.name}</span>
                      <span className="text-faint">{b.weightPct}%</span>
                      <span className="num w-12 text-right">{b.avg != null ? `${b.avg.toFixed(1)}%` : '—'}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-s2">
                      <div className="h-full rounded-full" style={{ width: `${b.avg ?? 0}%`, background: b.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                <Toggle label="Count pending as zero" checked={asZero.pending} onChange={(v) => setAsZero({ ...asZero, pending: v })} />
                <Toggle label="Count missing as zero" checked={asZero.missing} onChange={(v) => setAsZero({ ...asZero, missing: v })} />
              </div>
            </Panel>
            <Panel className="p-3">
              <SectionHead title="Grade scale" subtitle={`${subject.scale.toUpperCase()} · target ${subject.targetPct ?? '—'}%`} />
              <div className="grid grid-cols-4 gap-1 text-center text-[10.5px]">
                {LETTER_SCALE.slice(0, 12).map((l) => (
                  <div key={l.letter} className="rounded-[8px] py-1" style={{ background: grade.letter === l.letter ? 'var(--accent-soft)' : 'var(--surface-2)', color: grade.letter === l.letter ? 'var(--accent)' : 'var(--text-muted)' }}>
                    <div className="font-medium">{l.letter}</div>
                    <div className="num text-[9.5px] text-faint">{l.min}%</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'categories' && <CategoriesTab subject={subject} />}
      {tab === 'whatif' && <WhatIfTab subject={subject} grade={grade} />}
      {tab === 'trends' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="p-3">
            <SectionHead title="Grade over time" subtitle="Each graded mark, chronological" />
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={trend.map((t) => ({ ...t, label: format(new Date(t.date), 'MMM d') }))}>
                  <CartesianGrid stroke="var(--surface-3)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[40, 100]} tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={28} />
                  <RTooltip contentStyle={{ background: 'var(--surface-2)', border: 'none', borderRadius: 12, fontSize: 11 }} />
                  <Line type="monotone" dataKey="pct" stroke={subject.color} strokeWidth={2} dot={{ r: 2.5, fill: subject.color }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="p-3">
            <SectionHead title="Weight distribution" subtitle="Contribution of each category" />
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={grade.breakdown} dataKey="weightPct" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {grade.breakdown.map((b) => <Cell key={b.categoryId} fill={b.color} />)}
                  </Pie>
                  <RTooltip contentStyle={{ background: 'var(--surface-2)', border: 'none', borderRadius: 12, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {grade.breakdown.map((b) => (
                <div key={b.categoryId} className="flex items-center gap-1.5 text-[10.5px] text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />{b.name} {b.weightPct}%
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="p-3 lg:col-span-2">
            <SectionHead title="Category averages" />
            <div style={{ height: 180 }}>
              <ResponsiveContainer>
                <BarChart data={grade.breakdown.map((b) => ({ name: b.name, avg: b.avg ?? 0, color: b.color }))}>
                  <CartesianGrid stroke="var(--surface-3)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={28} />
                  <RTooltip contentStyle={{ background: 'var(--surface-2)', border: 'none', borderRadius: 12, fontSize: 11 }} />
                  <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                    {grade.breakdown.map((b) => <Cell key={b.categoryId} fill={b.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      )}
      {tab === 'report' && <ReportTab subject={subject} />}

      <MarkDialog open={markOpen} onClose={() => setMarkOpen(false)} subject={subject} mark={editingMark} />
      <BulkEntry open={bulkOpen} onClose={() => setBulkOpen(false)} subject={subject} />
      <SubjectDialog open={subjectOpen} onClose={() => setSubjectOpen(false)} subject={subject} onDelete={() => setConfirmDelete(true)} />
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} danger confirmLabel="Delete subject"
        title="Delete this subject?" body="Marks and categories for this subject are removed. Archive instead if you want to keep the history."
        onConfirm={() => { flow.deleteSubject(subject.id); navigate('/grades'); }} />
    </div>
  );
}

function CategoriesTab({ subject }: { subject: Subject }) {
  const flow = useFlow.getState();
  const [name, setName] = useState('');
  const total = subject.categories.reduce((a, c) => a + c.weightPct, 0);
  const normalized = normalizedWeights(subject.categories);
  const update = (id: string, patch: Partial<Subject['categories'][number]>) =>
    flow.updateSubject(subject.id, { categories: subject.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <SectionHead title="Assessment categories" subtitle={`Weights total ${total}%`}
          right={<div className="flex items-center gap-2">
            {total !== 100 && <Btn size="sm" variant="tonal" icon="Scale" onClick={() => flow.normalizeWeights(subject.id)}>Normalize</Btn>}
            <Select value={subject.weighting} onChange={(v) => flow.updateSubject(subject.id, { weighting: v as Subject['weighting'] })}
              options={[{ value: 'category', label: 'Weight by category' }, { value: 'points', label: 'Weight by total points' }, { value: 'equal', label: 'Equal per item' }]} />
          </div>} />
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_70px_70px_70px_60px_32px] gap-2 px-1 text-[10px] uppercase tracking-wide text-faint">
            <span>Category</span><span>Weight %</span><span>Drop lowest</span><span>Best N</span><span>Normalized</span><span />
          </div>
          {subject.categories.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_70px_70px_70px_60px_32px] items-center gap-2 rounded-[10px] bg-s1 px-1.5 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <input type="color" value={c.color} onChange={(e) => update(c.id, { color: e.target.value })} className="h-5 w-5 shrink-0 cursor-pointer rounded-full bg-transparent" aria-label="Category colour" />
                <TextInput value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} className="bg-transparent py-1 text-[12.5px]" />
              </div>
              <TextInput type="number" min={0} max={100} value={c.weightPct} onChange={(e) => update(c.id, { weightPct: Number(e.target.value) })} className="py-1 text-center text-[12px]" />
              <TextInput type="number" min={0} max={5} value={c.dropLowest} onChange={(e) => update(c.id, { dropLowest: Number(e.target.value) })} className="py-1 text-center text-[12px]" />
              <TextInput type="number" min={0} max={20} value={c.bestN} onChange={(e) => update(c.id, { bestN: Number(e.target.value) })} className="py-1 text-center text-[12px]" />
              <span className="num text-center text-[11.5px] text-muted">{normalized[subject.categories.indexOf(c)]}%</span>
              <IconBtn icon="Trash2" label="Delete category" className="h-6 w-6" onClick={() => flow.updateSubject(subject.id, { categories: subject.categories.filter((x) => x.id !== c.id) })} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
          <Btn variant="soft" icon="Plus" onClick={() => {
            if (!name.trim()) return;
            flow.updateSubject(subject.id, {
              categories: [...subject.categories, { id: uuid(), name: name.trim(), weightPct: 0, dropLowest: 0, bestN: 0, color: '#7c8cff' }],
            });
            setName('');
          }}>Add</Btn>
        </div>
        <div className="mt-2 text-[11px] text-faint">
          Drop-lowest and best-N rules are applied per category before averaging. Extracurricular rule: set weight to 0 and extra credit still counts through the points mode.
        </div>
      </Panel>

      <Panel className="p-3">
        <SectionHead title="Category rules" subtitle="How each category reduces to one number" />
        <div className="space-y-2">
          {subject.categories.map((c) => {
            const catMarks = useFlow.getState().db.marks.filter((m) => m.subjectId === subject.id && m.categoryId === c.id);
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-[10px] bg-s1 px-2 py-1.5 text-[12px]">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="w-32 truncate">{c.name}</span>
                <span className="text-[11px] text-faint">{catMarks.length} marks</span>
                <span className="ml-auto text-[11px] text-muted">
                  {c.dropLowest > 0 ? `drop lowest ${c.dropLowest}` : c.bestN > 0 ? `best ${c.bestN} only` : 'all count'}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function WhatIfTab({ subject, grade }: { subject: Subject; grade: ReturnType<typeof computeSubjectGrade> }) {
  const db = useFlow((s) => s.db);
  const [items, setItems] = useState<Array<{ categoryId: string; pct: number; title: string }>>(
    subject.categories.slice(0, 2).map((c) => ({ categoryId: c.id, pct: 90, title: `Hypothetical ${c.name.toLowerCase()}` })),
  );
  const [finalWeight, setFinalWeight] = useState(subject.categories.find((c) => c.name.toLowerCase().includes('exam'))?.weightPct ?? 30);
  const [target, setTarget] = useState(subject.targetPct ?? 90);

  const fake = items.map((it, i) => ({
    id: `whatif-${i}`, subjectId: subject.id, categoryId: it.categoryId, title: it.title,
    kind: 'other' as const, score: it.pct, max: 100, status: 'graded' as const, date: new Date().toISOString(), notes: '',
  }));
  const projected = computeSubjectGrade(subject, [...db.marks, ...fake]);
  const need = neededOnFinal(subject, db.marks, finalWeight, target);
  const proj = projections(subject, db.marks);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel className="p-3">
        <SectionHead title="What-if calculator" subtitle="Add hypothetical marks and watch the grade move" />
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-[10px] bg-s1 p-1.5">
              <Select value={it.categoryId} onChange={(v) => setItems(items.map((x, xi) => (xi === i ? { ...x, categoryId: v } : x)))}
                className="w-32" options={subject.categories.map((c) => ({ value: c.id, label: c.name }))} />
              <TextInput value={it.title} onChange={(e) => setItems(items.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)))} className="flex-1 py-1 text-[12px]" />
              <TextInput type="number" min={0} max={120} value={it.pct} onChange={(e) => setItems(items.map((x, xi) => (xi === i ? { ...x, pct: Number(e.target.value) } : x)))} className="w-16 py-1 text-center text-[12px]" />
              <IconBtn icon="X" label="Remove" className="h-6 w-6" onClick={() => setItems(items.filter((_, xi) => xi !== i))} />
            </div>
          ))}
          <Btn size="sm" variant="soft" icon="Plus" onClick={() => setItems([...items, { categoryId: subject.categories[0]?.id ?? '', pct: 90, title: 'Hypothetical' }])}>Add hypothesis</Btn>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Current" value={grade.pct != null ? `${grade.pct.toFixed(1)}%` : '—'} />
          <Stat label="Projected" value={projected.pct != null ? `${projected.pct.toFixed(1)}%` : '—'} tone="accent" />
          <Stat label="Change" value={grade.pct != null && projected.pct != null ? `${(projected.pct - grade.pct >= 0 ? '+' : '')}${(projected.pct - grade.pct).toFixed(1)}` : '—'} tone={projected.pct && grade.pct && projected.pct > grade.pct ? 'success' : 'warning'} />
        </div>
      </Panel>

      <Panel className="p-3">
        <SectionHead title="What do I need on the final?" subtitle="Solve for the score that hits your target" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Final weight %"><TextInput type="number" value={finalWeight} onChange={(e) => setFinalWeight(Number(e.target.value))} /></Field>
          <Field label="Target %"><TextInput type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
        </div>
        <div className="mt-3 rounded-[14px] p-4 text-center" style={{ background: 'var(--accent-soft)' }}>
          <div className="num text-[32px] font-semibold" style={{ color: 'var(--accent)' }}>{need != null ? `${need.toFixed(1)}%` : '—'}</div>
          <div className="text-[11.5px] text-muted">needed on a {finalWeight}% final to finish at {target}%</div>
          {need != null && need > 100 && <div className="mt-1 text-[11px] text-warning">Above 100% — consider adjusting the target.</div>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Worst case" value={proj.worst != null ? `${proj.worst.toFixed(1)}%` : '—'} tone="danger" />
          <Stat label="Current" value={proj.current != null ? `${proj.current.toFixed(1)}%` : '—'} />
          <Stat label="Best case" value={proj.best != null ? `${proj.best.toFixed(1)}%` : '—'} tone="success" />
        </div>
        <div className="mt-2 text-[11px] text-faint">Best case assumes every pending mark scores 100%; worst case assumes zero.</div>
      </Panel>
    </div>
  );
}

function ReportTab({ subject }: { subject: Subject }) {
  const db = useFlow((s) => s.db);
  const grade = computeSubjectGrade(subject, db.marks);
  const marks = db.marks.filter((m) => m.subjectId === subject.id);
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-faint">Flow grade report</div>
          <h2 className="h1 mt-1">{subject.name}</h2>
          <div className="text-[12px] text-muted">{subject.term} · {subject.teacher} · {subject.room}</div>
        </div>
        <Btn variant="soft" icon="Printer" onClick={() => window.print()}>Print / PDF</Btn>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Current" value={grade.pct != null ? `${grade.pct.toFixed(1)}%` : '—'} sub={grade.letter} />
        <Stat label="Target" value={subject.targetPct ? `${subject.targetPct}%` : '—'} />
        <Stat label="Graded" value={grade.gradedCount} />
        <Stat label="Pending" value={grade.pendingCount} />
      </div>
      <table className="mt-4 w-full text-left text-[12px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-faint">
            <th className="py-1.5">Date</th><th>Title</th><th>Category</th><th className="text-right">Score</th><th className="text-right">Percent</th><th className="text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {[...marks].sort((a, b) => +new Date(b.date) - +new Date(a.date)).map((m) => (
            <tr key={m.id} className="text-muted">
              <td className="py-1.5">{fmtDate(m.date, 'MMM d, yyyy')}</td>
              <td className="text-ink">{m.title}</td>
              <td>{subject.categories.find((c) => c.id === m.categoryId)?.name}</td>
              <td className="num text-right">{m.score != null ? `${m.score}/${m.max}` : '—'}</td>
              <td className="num text-right">{m.status === 'graded' ? `${pctOf(m).toFixed(1)}%` : '—'}</td>
              <td className="text-right">{m.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-[10.5px] text-faint">Generated by Flow on {format(new Date(), 'MMMM d, yyyy')}. All data stays local.</div>
    </Panel>
  );
}

function GpaCalculator() {
  const db = useFlow((s) => s.db);
  const updateSubject = useFlow((s) => s.updateSubject);
  const rows = db.subjects.map((s) => ({ subject: s, grade: computeSubjectGrade(s, db.marks) }));
  const gpa4 = rows.reduce((a, r) => a + (r.grade.pct != null ? LETTER_SCALE.find((l) => r.grade.pct! >= l.min)?.gpa ?? 0 : 0) * r.subject.credits, 0)
    / Math.max(1, rows.reduce((a, r) => a + r.subject.credits, 0));
  const gpa5 = rows.reduce((a, r) => a + ((r.grade.pct ?? 0) / 100) * 5 * r.subject.credits, 0)
    / Math.max(1, rows.reduce((a, r) => a + r.subject.credits, 0));

  return (
    <div className="space-y-3 pt-2">
      <h1 className="h1">GPA calculator</h1>
      <div className="grid gap-2.5 md:grid-cols-3">
        <Stat label="GPA 4.0 scale" value={gpa4.toFixed(2)} icon="Award" tone="accent" />
        <Stat label="GPA 5.0 scale" value={gpa5.toFixed(2)} icon="Award" />
        <Stat label="Credits" value={rows.reduce((a, r) => a + r.subject.credits, 0)} icon="GraduationCap" />
      </div>
      <Panel className="p-3">
        <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-1 pb-1 text-[10px] uppercase tracking-wide text-faint">
          <span>Subject</span><span>Percent</span><span>Letter</span><span>Credits</span><span>Points</span>
        </div>
        {rows.map(({ subject, grade }) => (
          <div key={subject.id} className="grid grid-cols-[1fr_80px_80px_80px_80px] items-center gap-2 rounded-[10px] bg-s1 px-1.5 py-1.5 text-[12px]">
            <div className="flex items-center gap-2"><Icon name={subject.icon} size={13} style={{ color: subject.color }} />{subject.name}</div>
            <span className="num">{grade.pct != null ? `${grade.pct.toFixed(1)}%` : '—'}</span>
            <span>{grade.letter}</span>
            <TextInput type="number" step={0.5} min={0} value={subject.credits} onChange={(e) => updateSubject(subject.id, { credits: Number(e.target.value) })} className="py-1 text-center text-[12px]" />
            <span className="num text-muted">{grade.pct != null ? (gpa4 * 0 + (LETTER_SCALE.find((l) => grade.pct! >= l.min)?.gpa ?? 0)).toFixed(1) : '—'}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/** School-wide what-if: pick a target for any subject and see the score the
 *  remaining weight has to carry. Same maths as the per-subject tab. */
function WhatIfOverview() {
  const db = useFlow((s) => s.db);
  const navigate = useNavigate();
  const [target, setTarget] = useState(90);
  const [finalWeight, setFinalWeight] = useState(30);

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">What-if simulator</h1>
          <div className="mt-0.5 text-[12px] text-muted">Set one target and one exam weight, then compare every subject</div>
        </div>
        <div className="flex gap-2">
          <Field label="Target %"><TextInput type="number" min={0} max={100} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-20 py-1 text-center" /></Field>
          <Field label="Final weight %"><TextInput type="number" min={0} max={100} value={finalWeight} onChange={(e) => setFinalWeight(Number(e.target.value))} className="w-20 py-1 text-center" /></Field>
        </div>
      </div>

      <Panel className="p-3">
        <div className="space-y-1">
          {db.subjects.map((subject) => {
            const grade = computeSubjectGrade(subject, db.marks);
            const need = neededOnFinal(subject, db.marks, finalWeight, target);
            const gap = grade.pct != null ? target - grade.pct : null;
            return (
              <button key={subject.id} onClick={() => navigate(`/grades/${subject.id}?tab=whatif`)}
                className="focusable flex w-full items-center gap-2 rounded-[11px] bg-s1 px-2.5 py-2 text-left text-[12px] hover:bg-s2">
                <Icon name={subject.icon} size={13} style={{ color: subject.color }} />
                <span className="w-40 truncate">{subject.name}</span>
                <span className="num w-16 text-muted">{grade.pct != null ? `${grade.pct.toFixed(1)}%` : '—'}</span>
                <span className="w-10 text-faint">{grade.letter}</span>
                <span className={cn('num w-20 text-[11.5px]', gap != null && gap <= 0 ? 'text-success' : 'text-warning')}>
                  {gap == null ? '—' : `${gap > 0 ? '+' : ''}${gap.toFixed(1)}`}
                </span>
                <span className="num flex-1 text-right text-[13px]" style={{ color: need != null && need <= 100 ? 'var(--accent)' : 'var(--warning)' }}>
                  {need != null ? `${need.toFixed(1)}% needed` : 'no weights left'}
                </span>
                <Icon name="ChevronRight" size={12} className="text-faint" />
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-faint">Click a subject to open its full what-if calculator with hypothetical marks.</div>
      </Panel>

      <Panel className="p-3">
        <SectionHead title="How this is computed" subtitle="Weight-aware, ungraded categories are excluded" />
        <div className="space-y-1 text-[11.5px] text-muted">
          <div className="flex items-center gap-2"><Icon name="Info" size={12} />Current grade = sum of weighted category averages over graded categories.</div>
          <div className="flex items-center gap-2"><Icon name="Info" size={12} />Needed on final = (target − current × (1 − w)) ÷ w, where w is the final weight.</div>
        </div>
      </Panel>
    </div>
  );
}

function CompareSubjects() {
  const db = useFlow((s) => s.db);
  const data = db.subjects.map((s) => {
    const g = computeSubjectGrade(s, db.marks);
    return { name: s.name.split(' ')[0], pct: g.pct ?? 0, color: s.color, target: s.targetPct ?? 0 };
  });
  return (
    <div className="space-y-3 pt-2">
      <h1 className="h1">Compare subjects</h1>
      <Panel className="p-3">
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid stroke="var(--surface-3)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={28} />
              <RTooltip contentStyle={{ background: 'var(--surface-2)', border: 'none', borderRadius: 12, fontSize: 11 }} />
              <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                {data.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Bar>
              <Bar dataKey="target" radius={[6, 6, 0, 0]} fill="var(--surface-3)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <div className="grid gap-2 md:grid-cols-2">
        {db.subjects.map((s) => {
          const g = computeSubjectGrade(s, db.marks);
          return (
            <Panel key={s.id} className="flex items-center gap-3 p-3">
              <Icon name={s.icon} size={16} style={{ color: s.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px]">{s.name}</div>
                <div className="text-[10.5px] text-faint">{g.gradedCount} graded · {g.pendingCount} pending · {g.missingCount} missing</div>
              </div>
              <span className="num text-[13px]" style={{ color: s.color }}>{g.pct?.toFixed(1) ?? '—'}%</span>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function TrendsView() {
  const db = useFlow((s) => s.db);
  const data = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    db.marks.filter((m) => m.status === 'graded').forEach((m) => {
      const k = format(new Date(m.date), 'MMM d');
      const entry = byDate.get(k) ?? {};
      entry[m.subjectId] = pctOf(m);
      byDate.set(k, entry);
    });
    return Array.from(byDate.entries()).map(([label, values]) => ({ label, ...values }));
  }, [db.marks]);
  return (
    <div className="space-y-3 pt-2">
      <h1 className="h1">Trend charts</h1>
      <Panel className="p-3">
        <div style={{ height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid stroke="var(--surface-3)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
              <YAxis domain={[40, 100]} tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} width={28} />
              <RTooltip contentStyle={{ background: 'var(--surface-2)', border: 'none', borderRadius: 12, fontSize: 11 }} />
              {db.subjects.map((s) => (
                <Line key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={s.color} strokeWidth={2} connectNulls dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {db.subjects.map((s) => <Chip key={s.id} color={s.color}>{s.name}</Chip>)}
        </div>
      </Panel>
    </div>
  );
}

function MarkDialog({ open, onClose, subject, mark }: { open: boolean; onClose: () => void; subject: Subject; mark: Mark | null }) {
  const addMark = useFlow((s) => s.addMark);
  const updateMark = useFlow((s) => s.updateMark);
  const deleteMark = useFlow((s) => s.deleteMark);
  const [form, setForm] = useState<Partial<Mark>>({});

  useEffect(() => {
    if (!open) return;
    setForm(mark ?? {
      title: '', categoryId: subject.categories[0]?.id, kind: 'assignment', max: 100, status: 'graded',
      date: new Date().toISOString(), score: undefined,
    });
  }, [open, mark, subject]);

  const save = (andAnother: boolean) => {
    if (!form.title?.trim()) return;
    if (mark) updateMark(mark.id, form);
    else addMark({ ...form, subjectId: subject.id });
    if (andAnother && !mark) {
      setForm({ ...form, title: '', score: undefined });
      return;
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={mark ? 'Edit mark' : 'Add mark'} subtitle={`${subject.name} · ${subject.categories.find((c) => c.id === form.categoryId)?.name ?? 'no category'}`}
      footer={<>
        {mark && <Btn variant="danger" icon="Trash2" className="mr-auto" onClick={() => { deleteMark(mark.id); onClose(); }}>Delete</Btn>}
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="soft" onClick={() => save(true)}>Save &amp; add another</Btn>
        <Btn variant="primary" icon="Check" onClick={() => save(false)}>Save</Btn>
      </>}>
      <div className="space-y-3">
        <TextInput autoFocus value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && save(true)} placeholder="Mark title" className="text-[15px] font-medium" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Field label="Category">
            <Select value={form.categoryId ?? ''} onChange={(v) => setForm({ ...form, categoryId: v })} options={subject.categories.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Kind">
            <Select value={form.kind ?? 'assignment'} onChange={(v) => setForm({ ...form, kind: v as Mark['kind'] })}
              options={[{ value: 'assignment', label: 'Assignment' }, { value: 'quiz', label: 'Quiz' }, { value: 'test', label: 'Test' }, { value: 'exam', label: 'Exam' }, { value: 'project', label: 'Project' }, { value: 'lab', label: 'Lab' }, { value: 'other', label: 'Other' }]} />
          </Field>
          <Field label="Status">
            <Select value={form.status ?? 'graded'} onChange={(v) => setForm({ ...form, status: v as Mark['status'] })}
              options={[{ value: 'graded', label: 'Graded' }, { value: 'pending', label: 'Pending' }, { value: 'missing', label: 'Missing' }, { value: 'excused', label: 'Excused' }]} />
          </Field>
          <Field label="Date"><TextInput type="date" value={(form.date ?? '').slice(0, 10)} onChange={(e) => setForm({ ...form, date: new Date(e.target.value).toISOString() })} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Score"><TextInput type="number" step="0.5" value={form.score ?? ''} onChange={(e) => setForm({ ...form, score: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="18" /></Field>
          <Field label="Out of"><TextInput type="number" value={form.max ?? 100} onChange={(e) => setForm({ ...form, max: Number(e.target.value) })} /></Field>
          <Field label="Weight override %" hint="Optional"><TextInput type="number" value={form.weightOverride ?? ''} onChange={(e) => setForm({ ...form, weightOverride: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
        </div>
        <Field label="Notes"><TextArea rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <div className="rounded-[12px] bg-s1 p-3 text-[11.5px] text-muted">
          Enter saves and opens a fresh form so you can enter a whole stack of marks without touching the mouse.
        </div>
      </div>
    </Modal>
  );
}

function BulkEntry({ open, onClose, subject }: { open: boolean; onClose: () => void; subject: Subject }) {
  const bulkAddMarks = useFlow((s) => s.bulkAddMarks);
  const [rows, setRows] = useState<Array<{ title: string; categoryId: string; score: string; max: string }>>([
    { title: '', categoryId: subject.categories[0]?.id ?? '', score: '', max: '100' },
  ]);
  const [paste, setPaste] = useState('');

  const importCSV = () => {
    const parsed = parseCSV(paste);
    const next = parsed.map((cols) => ({
      title: cols[0] ?? 'Mark',
      categoryId: subject.categories.find((c) => c.name.toLowerCase() === (cols[1] ?? '').toLowerCase())?.id ?? subject.categories[0]?.id ?? '',
      score: cols[2] ?? '',
      max: cols[3] ?? '100',
    }));
    if (next.length) setRows(next);
    setPaste('');
  };

  return (
    <Modal open={open} onClose={onClose} wide title="Bulk mark entry" subtitle="Tab through cells, or paste CSV as title, category, score, max"
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="Check" onClick={() => {
        const payload = rows.filter((r) => r.title.trim()).map((r) => ({
          subjectId: subject.id, categoryId: r.categoryId, title: r.title, score: r.score === '' ? undefined : Number(r.score),
          max: Number(r.max) || 100, status: (r.score === '' ? 'pending' : 'graded') as Mark['status'], date: new Date().toISOString(),
        }));
        if (payload.length) bulkAddMarks(payload);
        setRows([{ title: '', categoryId: subject.categories[0]?.id ?? '', score: '', max: '100' }]);
        onClose();
      }}>Import {rows.filter((r) => r.title.trim()).length} marks</Btn></>}>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_120px_80px_80px_28px] gap-1.5 px-1 text-[10px] uppercase tracking-wide text-faint">
          <span>Title</span><span>Category</span><span>Score</span><span>Max</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_80px_80px_28px] items-center gap-1.5">
            <TextInput value={r.title} onChange={(e) => setRows(rows.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)))} placeholder="Quiz 3" className="py-1.5 text-[12.5px]" />
            <Select value={r.categoryId} onChange={(v) => setRows(rows.map((x, xi) => (xi === i ? { ...x, categoryId: v } : x)))} options={subject.categories.map((c) => ({ value: c.id, label: c.name }))} />
            <TextInput value={r.score} onChange={(e) => setRows(rows.map((x, xi) => (xi === i ? { ...x, score: e.target.value } : x)))} className="py-1.5 text-center text-[12.5px]" placeholder="—" />
            <TextInput value={r.max} onChange={(e) => setRows(rows.map((x, xi) => (xi === i ? { ...x, max: e.target.value } : x)))} className="py-1.5 text-center text-[12.5px]" />
            <IconBtn icon="X" label="Remove row" className="h-6 w-6" onClick={() => setRows(rows.filter((_, xi) => xi !== i))} />
          </div>
        ))}
        <Btn size="sm" variant="soft" icon="Plus" onClick={() => setRows([...rows, { title: '', categoryId: subject.categories[0]?.id ?? '', score: '', max: '100' }])}>Row</Btn>
        <Field label="Or paste CSV">
          <TextArea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={`Lab 4,Assignments,45,50\nQuiz 5,Quizzes,9,10`} />
        </Field>
        <Btn size="sm" variant="tonal" icon="Upload" onClick={importCSV}>Parse CSV into rows</Btn>
      </div>
    </Modal>
  );
}

function SubjectDialog({ open, onClose, subject, onDelete }: { open: boolean; onClose: () => void; subject: Subject; onDelete: () => void }) {
  const updateSubject = useFlow((s) => s.updateSubject);
  const duplicateSubject = useFlow((s) => s.duplicateSubject);
  const [form, setForm] = useState<Partial<Subject>>(subject);
  useEffect(() => { if (open) setForm(subject); }, [open, subject]);
  const set = (patch: Partial<Subject>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <Modal open={open} onClose={onClose} title="Subject details" subtitle="Each subject is its own self-contained space"
      footer={<>
        <Btn variant="danger" icon="Trash2" className="mr-auto" onClick={onDelete}>Delete</Btn>
        <Btn variant="ghost" icon="Copy" onClick={() => { duplicateSubject(subject.id); onClose(); }}>Duplicate</Btn>
        <Btn variant="primary" icon="Check" onClick={() => { updateSubject(subject.id, form); onClose(); }}>Save</Btn>
      </>}>
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name"><TextInput value={form.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Teacher"><TextInput value={form.teacher ?? ''} onChange={(e) => set({ teacher: e.target.value })} /></Field>
          <Field label="Room"><TextInput value={form.room ?? ''} onChange={(e) => set({ room: e.target.value })} /></Field>
          <Field label="Term"><TextInput value={form.term ?? ''} onChange={(e) => set({ term: e.target.value })} /></Field>
          <Field label="Credits"><TextInput type="number" step={0.5} value={form.credits ?? 1} onChange={(e) => set({ credits: Number(e.target.value) })} /></Field>
          <Field label="Target %"><TextInput type="number" value={form.targetPct ?? ''} onChange={(e) => set({ targetPct: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="Grading scale">
            <Select value={form.scale ?? 'af'} onChange={(v) => set({ scale: v as Subject['scale'] })}
              options={[{ value: 'af', label: 'A–F with +/-' }, { value: 'percent', label: 'Percentage' }, { value: 'gpa4', label: 'GPA 4.0' }, { value: 'gpa5', label: 'GPA 5.0' }, { value: 'custom', label: 'Custom' }]} />
          </Field>
          <Field label="Syllabus link"><TextInput value={form.syllabus ?? ''} onChange={(e) => set({ syllabus: e.target.value })} placeholder="https://" /></Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Icon"><IconPicker value={form.icon ?? 'BookOpen'} onChange={(v) => set({ icon: v })} color={form.color} /></Field>
          <Field label="Colour"><ColorPicker value={form.color ?? '#7c8cff'} onChange={(v) => set({ color: v })} /></Field>
        </div>
        <Field label="Notes"><TextArea rows={3} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <div className="rounded-[12px] bg-s1 p-3"><Toggle label="Archived" checked={!!form.archived} onChange={(v) => set({ archived: v })} /></div>
      </div>
    </Modal>
  );
}
