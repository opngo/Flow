import { z } from 'zod';
import { DEFAULT_SIDEBAR } from './nav';

/** ------------------------------------------------------------------
 *  Zod schemas + inferred types. Single source of truth for the shape
 *  of every entity that the repository persists and migrations handle.
 *  ------------------------------------------------------------------ */

export const id = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36));
const iso = z.string();
const ID = z.string();

export const TodoStatus = z.enum(['inbox', 'todo', 'doing', 'blocked', 'done', 'archived']);
export type TodoStatus = z.infer<typeof TodoStatus>;

export const CategorySchema = z.object({
  id: ID,
  name: z.string(),
  icon: z.string().default('Folder'),
  color: z.string().default('#7c8cff'),
  parentId: ID.optional(),
  defaultPriority: z.number().min(0).max(3).default(0),
  defaultReminderOffsets: z.array(z.number()).default([1440, 60]),
  defaultTimerProfileId: ID.optional(),
  order: z.number().default(0),
  smart: z.boolean().default(false),
});
export type Category = z.infer<typeof CategorySchema>;

export const ChecklistItemSchema = z.object({ id: ID, text: z.string(), done: z.boolean().default(false) });
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const AttachmentSchema = z.object({ id: ID, name: z.string(), path: z.string() });
export type Attachment = z.infer<typeof AttachmentSchema>;

export const TodoSchema = z.object({
  id: ID,
  title: z.string(),
  notes: z.string().default(''),
  categoryId: ID.optional(),
  subjectId: ID.optional(),
  projectId: ID.optional(),
  tags: z.array(z.string()).default([]),
  priority: z.number().min(0).max(3).default(0),
  startAt: z.string().optional(),
  dueAt: z.string().optional(),
  estimateMin: z.number().optional(),
  loggedMin: z.number().default(0),
  status: TodoStatus.default('todo'),
  rrule: z.string().optional(),
  reminders: z.array(z.any()).default([]),
  parentId: ID.optional(),
  checklist: z.array(ChecklistItemSchema).default([]),
  attachments: z.array(AttachmentSchema).default([]),
  noteId: ID.optional(),
  completedAt: z.string().optional(),
  createdAt: iso,
  updatedAt: iso,
  order: z.number().default(0),
});
export type Todo = z.infer<typeof TodoSchema>;

export const ProjectSchema = z.object({
  id: ID,
  name: z.string(),
  description: z.string().default(''),
  color: z.string().default('#7c8cff'),
  icon: z.string().default('FolderKanban'),
  archived: z.boolean().default(false),
  createdAt: iso,
});
export type Project = z.infer<typeof ProjectSchema>;

export const HabitSchedule = z.object({
  type: z.enum(['daily', 'weekdays', 'timesPerWeek', 'everyOtherDay', 'rrule']),
  days: z.array(z.number()).default([1, 2, 3, 4, 5]),
  times: z.number().default(5),
  rrule: z.string().optional(),
});
export type HabitSchedule = z.infer<typeof HabitSchedule>;

export const HabitSchema = z.object({
  id: ID,
  name: z.string(),
  icon: z.string().default('Sparkles'),
  color: z.string().default('#4ec9a0'),
  categoryId: ID.optional(),
  description: z.string().default(''),
  schedule: HabitSchedule,
  target: z.object({ type: z.enum(['boolean', 'count', 'duration']), value: z.number().default(1) }),
  reminderTimes: z.array(z.string()).default([]),
  linkedSubjectId: ID.optional(),
  timerProfileId: ID.optional(),
  mixId: ID.optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  pausedUntil: z.string().optional(),
  order: z.number().default(0),
  createdAt: iso,
});
export type Habit = z.infer<typeof HabitSchema>;

export const HabitLogSchema = z.object({
  id: ID,
  habitId: ID,
  date: z.string(),
  value: z.number().default(1),
  skipped: z.boolean().default(false),
  reason: z.string().optional(),
  source: z.enum(['manual', 'timer', 'auto']).default('manual'),
});
export type HabitLog = z.infer<typeof HabitLogSchema>;

export const MilestoneSchema = z.object({
  id: ID,
  title: z.string(),
  date: z.string().optional(),
  done: z.boolean().default(false),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const GoalSchema = z.object({
  id: ID,
  title: z.string(),
  icon: z.string().default('Target'),
  color: z.string().default('#7c8cff'),
  type: z.enum(['outcome', 'numeric', 'habit', 'milestones']),
  deadline: z.string().optional(),
  link: z.object({ kind: z.enum(['subject', 'habit', 'project', 'none']), id: ID }).optional(),
  progressMode: z.enum(['manual', 'auto']).default('manual'),
  manualProgress: z.number().min(0).max(100).default(0),
  targetValue: z.number().optional(),
  milestones: z.array(MilestoneSchema).default([]),
  status: z.enum(['on-track', 'at-risk', 'achieved', 'abandoned']).default('on-track'),
  createdAt: iso,
});
export type Goal = z.infer<typeof GoalSchema>;

export const GradeCategorySchema = z.object({
  id: ID,
  name: z.string(),
  weightPct: z.number().default(0),
  dropLowest: z.number().default(0),
  bestN: z.number().default(0),
  color: z.string().default('#7c8cff'),
});
export type GradeCategory = z.infer<typeof GradeCategorySchema>;

export const SubjectSchema = z.object({
  id: ID,
  name: z.string(),
  teacher: z.string().default(''),
  room: z.string().default(''),
  term: z.string().default(''),
  credits: z.number().default(1),
  icon: z.string().default('BookOpen'),
  color: z.string().default('#7c8cff'),
  scale: z.enum(['af', 'percent', 'gpa4', 'gpa5', 'custom']).default('af'),
  targetPct: z.number().optional(),
  categories: z.array(GradeCategorySchema).default([]),
  weighting: z.enum(['category', 'points', 'equal']).default('category'),
  syllabus: z.string().default(''),
  notes: z.string().default(''),
  archived: z.boolean().default(false),
  order: z.number().default(0),
});
export type Subject = z.infer<typeof SubjectSchema>;

export const MarkSchema = z.object({
  id: ID,
  subjectId: ID,
  categoryId: ID,
  title: z.string(),
  kind: z.enum(['assignment', 'quiz', 'test', 'exam', 'project', 'lab', 'other']).default('assignment'),
  score: z.number().optional(),
  max: z.number().default(100),
  weightOverride: z.number().optional(),
  status: z.enum(['graded', 'pending', 'missing', 'excused']).default('graded'),
  date: z.string(),
  notes: z.string().default(''),
});
export type Mark = z.infer<typeof MarkSchema>;

export const FocusSessionSchema = z.object({
  id: ID,
  startedAt: iso,
  endedAt: iso.optional(),
  kind: z.enum(['focus', 'break', 'long-break', 'stopwatch', 'timer', 'exam']),
  subjectId: ID.optional(),
  todoId: ID.optional(),
  categoryId: ID.optional(),
  habitId: ID.optional(),
  projectId: ID.optional(),
  label: z.string().default(''),
  plannedMin: z.number().default(0),
  actualMin: z.number().default(0),
  rating: z.number().optional(),
  distractions: z.number().optional(),
  note: z.string().default(''),
});
export type FocusSession = z.infer<typeof FocusSessionSchema>;

export const ReminderSchema = z.object({
  id: ID,
  targetKind: z.enum(['todo', 'habit', 'timer', 'mark', 'wellness', 'system', 'event']),
  targetId: ID.optional(),
  title: z.string(),
  body: z.string().default(''),
  fireAt: iso,
  repeat: z.string().optional(),
  snoozedUntil: iso.optional(),
  delivered: z.boolean().default(false),
  missed: z.boolean().default(false),
  actions: z.array(z.enum(['complete', 'snooze5', 'snooze10', 'snooze30', 'start-timer', 'open'])).default([]),
  route: z.string().optional(),
});
export type Reminder = z.infer<typeof ReminderSchema>;

export const NotificationRecordSchema = z.object({
  id: ID,
  kind: z.string(),
  title: z.string(),
  body: z.string().default(''),
  at: iso,
  read: z.boolean().default(false),
  route: z.string().optional(),
  actions: z.array(z.string()).default([]),
  missed: z.boolean().default(false),
});
export type NotificationRecord = z.infer<typeof NotificationRecordSchema>;

export const NoteSchema = z.object({
  id: ID,
  title: z.string().default('Untitled'),
  body: z.string().default(''),
  folder: z.string().default('Inbox'),
  tags: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  journal: z.boolean().default(false),
  mood: z.number().optional(),
  createdAt: iso,
  updatedAt: iso,
});
export type Note = z.infer<typeof NoteSchema>;

export const CardSchema = z.object({
  id: ID,
  front: z.string(),
  back: z.string(),
  ease: z.number().default(2.5),
  interval: z.number().default(0),
  due: z.string(),
  reps: z.number().default(0),
  lapses: z.number().default(0),
});
export type FlashCard = z.infer<typeof CardSchema>;

export const DeckSchema = z.object({
  id: ID,
  name: z.string(),
  subjectId: ID.optional(),
  cards: z.array(CardSchema).default([]),
  createdAt: iso,
});
export type Deck = z.infer<typeof DeckSchema>;

export const CalendarEventSchema = z.object({
  id: ID,
  title: z.string(),
  start: iso,
  end: iso,
  allDay: z.boolean().default(false),
  color: z.string().default('#7c8cff'),
  subjectId: ID.optional(),
  location: z.string().default(''),
  notes: z.string().default(''),
  rrule: z.string().optional(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const SoundLayerSchema = z.object({
  type: z.string(),
  volume: z.number().default(0.5),
  pan: z.number().default(0),
  params: z.record(z.number()).default({}),
  muted: z.boolean().default(false),
  solo: z.boolean().default(false),
});
export type SoundLayer = z.infer<typeof SoundLayerSchema>;

export const SoundMixSchema = z.object({
  id: ID,
  name: z.string(),
  layers: z.array(SoundLayerSchema).default([]),
  masterVolume: z.number().default(0.8),
  favorite: z.boolean().default(false),
  masterMuffle: z.number().default(0),
});
export type SoundMix = z.infer<typeof SoundMixSchema>;

export const TimerProfileSchema = z.object({
  id: ID,
  name: z.string(),
  focus: z.number().default(25),
  shortBreak: z.number().default(5),
  longBreak: z.number().default(15),
  sessionsBeforeLong: z.number().default(4),
  autoStartBreaks: z.boolean().default(false),
  autoStartFocus: z.boolean().default(false),
  strict: z.boolean().default(false),
  mixId: ID.optional(),
});
export type TimerProfile = z.infer<typeof TimerProfileSchema>;


export const TimerSchema = z.object({
  id: ID,
  kind: z.enum(['countdown', 'stopwatch', 'interval', 'exam']),
  label: z.string().default('Timer'),
  startedAt: iso,
  endsAt: iso.optional(),
  pausedAt: iso.optional(),
  accumulatedMs: z.number().default(0),
  plannedMin: z.number().default(5),
  rounds: z.number().default(1),
  restSec: z.number().default(30),
  running: z.boolean().default(true),
  laps: z.array(z.number()).default([]),
  todoId: ID.optional(),
  subjectId: ID.optional(),
  categoryId: ID.optional(),
  habitId: ID.optional(),
  finished: z.boolean().default(false),
  notifKind: z.string().default('timer'),
});
export type Timer = z.infer<typeof TimerSchema>;

export const FocusEngineSchema = z.object({
  phase: z.enum(['focus', 'short-break', 'long-break']).default('focus'),
  startedAt: iso.optional(),
  endsAt: iso.optional(),
  remainingMs: z.number().default(25 * 60000),
  running: z.boolean().default(false),
  sessionsDone: z.number().default(0),
  profileId: z.string().default('pomodoro-classic'),
  todoId: ID.optional(),
  subjectId: ID.optional(),
  categoryId: ID.optional(),
  mixId: ID.optional(),
  distractions: z.number().default(0),
  planningPrompt: z.boolean().default(false),
  notifiedEnd: z.boolean().default(false),
});
export type FocusEngine = z.infer<typeof FocusEngineSchema>;

export const ActivitySchema = z.object({
  id: ID,
  at: iso,
  kind: z.string(),
  text: z.string(),
});
export type Activity = z.infer<typeof ActivitySchema>;

/** Settings ------------------------------------------------------- */

export const SidebarItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  route: z.string(),
  hidden: z.boolean().default(false),
  group: z.string().default('Main'),
});
export type SidebarItem = z.infer<typeof SidebarItemSchema>;

export const SettingsSchema = z.object({
  theme: z.object({
    mode: z.enum(['dark', 'light', 'system']).default('dark'),
    preset: z.string().default('midnight'),
    accent: z.string().default('#7c8cff'),
    overrides: z.record(z.string()).default({}),
    density: z.number().default(1),
    /** `sharp` zeroes every radius, including pills. `rounded` follows the slider. */
    corners: z.enum(['rounded', 'sharp']).default('rounded'),
    radius: z.number().default(16),
    blur: z.number().default(18),
  }).default({}),
  /* Opt-in motion layer behind the interface. Off by default: the app ships
     quiet and the user turns atmosphere on in Settings, Appearance. */
  backdrop: z.object({
    effect: z.string().default('none'),
    intensity: z.number().default(0.55),
    speed: z.number().default(1),
    pixel: z.number().default(4),
    inFullscreen: z.boolean().default(true),
  }).default({}),
  typography: z.object({
    ui: z.string().default('Inter'),
    content: z.string().default('Inter'),
    timer: z.string().default('Inter'),
    mono: z.string().default('JetBrains Mono'),
    baseSize: z.number().default(14.5),
    lineHeight: z.number().default(1.55),
    letterSpacing: z.number().default(0),
    weight: z.number().default(450),
    headingScale: z.number().default(1),
    customFonts: z.array(z.object({ name: z.string(), dataUrl: z.string() })).default([]),
  }).default({}),
  sidebar: z.object({
    mode: z.enum(['auto', 'always']).default('auto'),
    hideDelay: z.number().default(1200),
    width: z.number().default(236),
    iconsOnly: z.boolean().default(false),
    overlay: z.boolean().default(false),
    items: z.array(SidebarItemSchema).default(DEFAULT_SIDEBAR),
  }).default({}),
  notifications: z.object({
    enabled: z.boolean().default(true),
    quietHours: z.object({ enabled: z.boolean().default(false), from: z.string().default('22:00'), to: z.string().default('07:00') }).default({}),
    sound: z.boolean().default(true),
    volume: z.number().default(0.6),
    perType: z.record(z.boolean()).default({}),
    devNoteDismissed: z.boolean().default(false),
  }).default({}),
  behavior: z.object({
    weekStart: z.number().default(1),
    closeToTray: z.boolean().default(true),
    minimizeToTray: z.boolean().default(false),
    launchAtStartup: z.boolean().default(false),
    reduceMotion: z.boolean().default(false),
    pinOnTop: z.boolean().default(false),
    appLock: z.object({ enabled: z.boolean().default(false), pin: z.string().default('') }).default({}),
    hotkeys: z.record(z.string()).default({
      quickAdd: 'CommandOrControl+Shift+Space',
      toggleTimer: 'CommandOrControl+Shift+P',
      toggleWindow: 'CommandOrControl+Shift+F',
      toggleSound: 'CommandOrControl+Shift+M',
      focusMode: 'CommandOrControl+Shift+D',
    }),
  }).default({}),
  enabledTools: z.array(z.string()).default([]),
  dashboardWidgets: z.array(z.string()).default([]),
  onboardingComplete: z.boolean().default(false),
  timerProfiles: z.array(TimerProfileSchema).default([]),
  activeProfileId: z.string().default('pomodoro-classic'),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DBSchema = z.object({
  version: z.number().default(1),
  categories: z.array(CategorySchema).default([]),
  todos: z.array(TodoSchema).default([]),
  habits: z.array(HabitSchema).default([]),
  habitLogs: z.array(HabitLogSchema).default([]),
  goals: z.array(GoalSchema).default([]),
  subjects: z.array(SubjectSchema).default([]),
  marks: z.array(MarkSchema).default([]),
  focusSessions: z.array(FocusSessionSchema).default([]),
  reminders: z.array(ReminderSchema).default([]),
  notifications: z.array(NotificationRecordSchema).default([]),
  notes: z.array(NoteSchema).default([]),
  decks: z.array(DeckSchema).default([]),
  events: z.array(CalendarEventSchema).default([]),
  mixes: z.array(SoundMixSchema).default([]),
  activity: z.array(ActivitySchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  timers: z.array(TimerSchema).default([]),
  focus: FocusEngineSchema.optional(),
  /** Marker for the removable demo dataset (see lib/demo.ts). */
  demo: z.object({ loadedAt: iso, count: z.number().default(0) }).optional(),
  settings: SettingsSchema.default({}),
});
export type DB = z.infer<typeof DBSchema>;
export type CollectionKey = 'categories' | 'todos' | 'habits' | 'habitLogs' | 'goals' | 'subjects' | 'marks'
  | 'focusSessions' | 'reminders' | 'notifications' | 'notes' | 'decks' | 'events' | 'mixes' | 'activity' | 'timers' | 'projects';

export const SCHEMA_VERSION = 4;
