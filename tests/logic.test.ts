import { describe, expect, it } from 'vitest';
import { computeSubjectGrade, letterFor, neededOnFinal, projections, termGPA, whatIfGrade } from '../src/lib/grades';
import { buildRollingGrid, bucketSessions, levelFor, streakStats, summaryStats, thresholds } from '../src/lib/analytics';
import { habitStats, isHabitScheduled, weeklyTarget } from '../src/lib/habits';
import { parseQuickAdd } from '../src/lib/nlp';
import { dueReminders, nextFireAt, quietHoursActive } from '../src/lib/scheduler';
import { migrate } from '../src/lib/repo';
import type { Category, Habit, HabitLog, Mark, Reminder, Settings, Subject, Todo } from '../src/lib/types';
import { DBSchema, SCHEMA_VERSION, TodoSchema } from '../src/lib/types';

const iso = (d: string) => new Date(d).toISOString();

const subject = (over: Partial<Subject> = {}): Subject => ({
  id: 'sub-1', name: 'Chemistry', icon: 'FlaskConical', color: '#4ec9a0', teacher: '', room: '',
  term: '', credits: 1, targetPct: 90, scale: 'af', weighting: 'category', archived: false,
  syllabus: '', notes: '', order: 0,
  categories: [
    { id: 'c-hw', name: 'Homework', weightPct: 30, color: '#7c8cff', dropLowest: 0, bestN: 0 },
    { id: 'c-tests', name: 'Tests', weightPct: 40, color: '#e5b567', dropLowest: 0, bestN: 0 },
    { id: 'c-final', name: 'Final exam', weightPct: 30, color: '#ef6f6c', dropLowest: 0, bestN: 0 },
  ],
  ...over,
});

const mark = (over: Partial<Mark>): Mark => ({
  id: Math.random().toString(36).slice(2), subjectId: 'sub-1', categoryId: 'c-hw', title: 'Mark',
  kind: 'assignment', score: 80, max: 100, status: 'graded', date: iso('2026-09-10'), notes: '',
  ...over,
});

describe('grades', () => {
  it('weights category averages by their percentage', () => {
    const marks = [
      mark({ categoryId: 'c-hw', score: 90, max: 100 }),
      mark({ categoryId: 'c-tests', score: 70, max: 100 }),
    ];
    const grade = computeSubjectGrade(subject(), marks);
    // 90*0.3 + 70*0.4 = 27 + 28 = 55 over the 70% of weight that has data
    expect(grade.pct).toBeCloseTo(55 / 0.7, 1);
    expect(grade.letter).toBe(letterFor(grade.pct!));
  });

  it('drops the lowest mark when the category says so', () => {
    const s = subject({ categories: [{ id: 'c-hw', name: 'Homework', weightPct: 100, color: '#fff', dropLowest: 1, bestN: 0 }] });
    const marks = [mark({ score: 50 }), mark({ score: 100 }), mark({ score: 90 })];
    expect(computeSubjectGrade(s, marks).pct).toBe(95);
  });

  it('solves the score needed on the final', () => {
    const marks = [mark({ categoryId: 'c-hw', score: 80 }), mark({ categoryId: 'c-tests', score: 80 })];
    // 70% of the grade is a steady 80, so a 30% final needs 80 for an 80 overall
    expect(neededOnFinal(subject(), marks, 30, 80)).toBeCloseTo(80, 0);
    expect(neededOnFinal(subject(), marks, 30, 100)).toBeGreaterThan(120);
  });

  it('separates best and worst case projections', () => {
    const marks: Mark[] = [
      mark({ categoryId: 'c-hw', score: 80 }),
      mark({ categoryId: 'c-final', status: 'pending', score: undefined }),
    ];
    const p = projections(subject(), marks);
    // Category weights re-normalise over the weight that actually has marks, so
    // a 30/w and 30/w split puts best case halfway between 80 and 100.
    expect(p.current).toBe(80);
    expect(p.best).toBe(90);
    expect(p.worst).toBeLessThan(80);
  });

  it('never mutates the marks passed to a what-if', () => {
    const marks = [mark({ score: 60 })];
    const snapshot = JSON.stringify(marks);
    whatIfGrade(subject(), marks, [{ categoryId: 'c-tests', pct: 100 }]);
    expect(JSON.stringify(marks)).toBe(snapshot);
  });

  it('credit-weights the term GPA', () => {
    const a = subject({ id: 'a', credits: 1 });
    const b = subject({ id: 'b', credits: 3 });
    const marks = [
      mark({ subjectId: 'a', categoryId: 'c-hw', score: 100 }),
      mark({ subjectId: 'b', categoryId: 'c-hw', score: 50 }),
    ];
    // 100% (1 credit) maps to a 4.0 and 50% to an F, so the credit-weighted
    // result must sit close to 4/4 rather than a plain mean.
    const gpa = termGPA([a, b], marks);
    expect(gpa).toBeCloseTo(1, 1);
  });
});

describe('analytics', () => {
  const sessions = [
    { id: '1', kind: 'focus' as const, startedAt: iso('2026-10-20T09:00:00'), endedAt: iso('2026-10-20T09:50:00'), label: 'x', plannedMin: 50, actualMin: 50, note: '' },
    { id: '2', kind: 'timer' as const, startedAt: iso('2026-10-20T11:00:00'), endedAt: iso('2026-10-20T11:30:00'), label: 'y', plannedMin: 30, actualMin: 30, note: '' },
  ];

  it('buckets sessions per day with subject totals', () => {
    const bucket = bucketSessions(sessions);
    const day = Object.keys(bucket)[0];
    expect(bucket[day].minutes).toBe(80);
    expect(bucket[day].sessions).toBe(2);
  });

  it('computes intensity levels from thresholds', () => {
    const th = thresholds([10, 40, 90, 200]);
    expect(levelFor(0, th)).toBe(0);
    expect(levelFor(200, th)).toBe(4);
  });

  it('finds the current streak', () => {
    const ref = new Date('2026-10-22T12:00:00');
    const bucket = {
      '2026-10-22': { minutes: 30, sessions: 1, bySubject: {} },
      '2026-10-21': { minutes: 30, sessions: 1, bySubject: {} },
      '2026-10-20': { minutes: 30, sessions: 1, bySubject: {} },
    };
    expect(streakStats(bucket, ref).current).toBe(3);
    expect(summaryStats(bucket, ref).totalMin).toBe(90);
  });

  it('builds a rolling grid of full weeks', () => {
    const grid = buildRollingGrid(12, 1);
    expect(grid.length).toBe(12);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[grid.length - 1][0].getDay()).toBe(1);
  });
});

describe('habits', () => {
  const habit = (over: Partial<Habit> = {}): Habit => ({
    id: 'h1', name: 'Read', icon: 'BookOpen', color: '#4ec9a0', description: '',
    schedule: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], times: 7 },
    target: { type: 'boolean', value: 1 }, reminderTimes: [], order: 0,
    startDate: iso('2026-01-01'), createdAt: iso('2026-01-01'),
    ...over,
  });
  const log = (date: string, value = 1): HabitLog => ({ id: date, habitId: 'h1', date, value, skipped: false, source: 'manual' });

  it('only schedules habits on their chosen days', () => {
    const weekdays = habit({ schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5], times: 5 } });
    expect(isHabitScheduled(weekdays, new Date('2026-10-26'))).toBe(true); // Monday
    expect(isHabitScheduled(weekdays, new Date('2026-10-25'))).toBe(false); // Sunday
  });

  it('counts a streak across consecutive days', () => {
    const logs = [log('2026-10-22'), log('2026-10-21'), log('2026-10-20')];
    expect(habitStats(habit(), logs, 1, new Date('2026-10-22T12:00:00')).current).toBe(3);
  });

  it('derives a weekly target from the schedule', () => {
    expect(weeklyTarget(habit({ schedule: { type: 'timesPerWeek', days: [], times: 3 } }))).toBe(3);
  });
});

describe('quick add parsing', () => {
  const categories: Category[] = [{ id: 'cat-study', name: 'Study', icon: 'BookOpen', color: '#fff', defaultPriority: 0, defaultReminderOffsets: [], order: 0, smart: false }];
  const subjects: Subject[] = [subject({ name: 'Chemistry' })];

  it('extracts category, priority, estimate and date', () => {
    const parsed = parseQuickAdd('Review lab notes #study !high ~45m tomorrow', { categories, subjects });
    expect(parsed.categoryId).toBe('cat-study');
    expect(parsed.priority).toBe(3);
    expect(parsed.estimateMin).toBe(45);
    expect(parsed.title.toLowerCase()).toContain('review lab notes');
    expect(parsed.dueAt).toBeTruthy();
  });

  it('falls back to tags when the token is not a category', () => {
    const parsed = parseQuickAdd('Buy milk #errand', { categories, subjects });
    expect(parsed.tags).toContain('errand');
    expect(parsed.categoryId).toBeUndefined();
  });
});

describe('reminder scheduler', () => {
  const reminder = (over: Partial<Reminder>): Reminder => ({
    id: 'r1', targetKind: 'todo', title: 'Test', body: '', fireAt: iso('2026-10-22T09:00:00'),
    delivered: false, missed: false, actions: ['open'], ...over,
  });
  const settings = (over: Partial<Settings> = {}): Settings =>
    DBSchema.shape.settings.parse(over) as Settings;

  it('marks reminders fired more than five minutes late as missed', () => {
    const now = new Date('2026-10-22T09:20:00');
    const [due] = dueReminders([reminder({})], now);
    expect(due.missed).toBe(true);
  });

  it('ignores delivered reminders', () => {
    expect(dueReminders([reminder({ delivered: true })], new Date('2026-10-22T09:30:00'))).toHaveLength(0);
  });

  it('picks the soonest upcoming reminder', () => {
    const next = nextFireAt(
      [reminder({ id: 'b', fireAt: iso('2026-10-22T10:00:00') }), reminder({ id: 'a', fireAt: iso('2026-10-22T09:30:00') })],
      new Date('2026-10-22T09:00:00'),
    );
    expect(next?.toISOString()).toBe(iso('2026-10-22T09:30:00'));
  });

  it('detects quiet hours across midnight', () => {
    const s = settings({ notifications: { enabled: true, sound: true, volume: 0.5, quietHours: { enabled: true, from: '22:00', to: '07:00' }, perType: {}, devNoteDismissed: false } } as never);
    expect(quietHoursActive(s, new Date('2026-10-22T23:30:00'))).toBe(true);
    expect(quietHoursActive(s, new Date('2026-10-22T12:00:00'))).toBe(false);
  });
});

describe('database migration', () => {
  it('upgrades an old payload and fills new collections', () => {
    const old = {
      version: 1,
      todos: [{
        id: 't1', title: 'Old task', status: 'todo', priority: 0, order: 0, tags: [], subtasks: [],
        reminders: [], createdAt: iso('2026-01-01'), updatedAt: iso('2026-01-01'), notes: '',
      }],
    };
    const db = migrate(old);
    expect(db.version).toBe(SCHEMA_VERSION);
    expect(db.projects).toEqual([]);
    expect(db.timers).toEqual([]);
    // The migration adds loggedMin to pre-v2 todos instead of dropping them.
    expect(db.todos[0].title).toBe('Old task');
    expect(db.todos[0].loggedMin).toBe(0);
  });

  it('repairs a corrupt collection instead of losing the database', () => {
    const broken = { version: 3, todos: 'not-an-array', habits: [] };
    const db = migrate(broken);
    expect(Array.isArray(db.todos)).toBe(true);
    expect(db.habits).toEqual([]);
  });

  it('accepts an empty object as a valid database', () => {
    const db = DBSchema.parse({});
    expect(db.settings.typography.baseSize).toBeGreaterThan(10);
    expect(db.notifications ?? []).toEqual([]);
  });
});

describe('todo model', () => {
  it('defaults new todos to todo status with sane fields', () => {
    const t: Todo = TodoSchema.parse({ id: 'x', title: 'hello', createdAt: iso('2026-10-01'), updatedAt: iso('2026-10-01') });
    expect(t.status).toBe('todo');
    expect(t.priority).toBe(0);
    expect(t.checklist).toEqual([]);
    expect(t.loggedMin).toBe(0);
  });
});
