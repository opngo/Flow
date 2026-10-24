import { addDays, format, subDays, startOfWeek } from 'date-fns';
import { DBSchema, SCHEMA_VERSION, type DB } from './types';
import { uuid } from './utils';

/** Deterministic PRNG so the seeded database looks identical on every reset. */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dk = (d: Date) => format(d, 'yyyy-MM-dd');
const at = (d: Date, h: number, m = 0) => {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x.toISOString();
};

export function seedDB(): DB {
  const rand = mulberry(20261024);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const today = new Date();
  const now = today.toISOString();

  /* Categories ---------------------------------------------------- */
  const catDefs = [
    { name: 'School', icon: 'GraduationCap', color: '#7c8cff', priority: 2 },
    { name: 'Personal', icon: 'Home', color: '#4ec9a0', priority: 1 },
    { name: 'Work', icon: 'Briefcase', color: '#f0a75a', priority: 2 },
    { name: 'Health', icon: 'HeartPulse', color: '#ef6f6c', priority: 1 },
    { name: 'Errands', icon: 'ShoppingBag', color: '#4db6e5', priority: 0 },
    { name: 'Projects', icon: 'FolderKanban', color: '#b18cff', priority: 2 },
    { name: 'Reading', icon: 'BookOpen', color: '#c9d24b', priority: 1 },
  ];
  const categories = catDefs.map((c, i) => ({
    id: `cat-${c.name.toLowerCase()}`,
    name: c.name,
    icon: c.icon,
    color: c.color,
    defaultPriority: c.priority,
    defaultReminderOffsets: [1440, 60, 10],
    order: i,
    smart: false,
  }));

  /* Subjects ------------------------------------------------------ */
  const subjectDefs = [
    { name: 'Chemistry', icon: 'FlaskConical', color: '#57c9a0', teacher: 'Ms. Aldridge', room: 'B-214', credits: 1.5, target: 90 },
    { name: 'Mathematics', icon: 'Sigma', color: '#7c8cff', teacher: 'Mr. Ozawa', room: 'A-108', credits: 1.5, target: 88 },
    { name: 'Biology', icon: 'Dna', color: '#ef6f6c', teacher: 'Dr. Nwosu', room: 'C-302', credits: 1, target: 85 },
    { name: 'English Literature', icon: 'BookMarked', color: '#f0a75a', teacher: 'Ms. Beaumont', room: 'D-011', credits: 1, target: 92 },
    { name: 'History', icon: 'Landmark', color: '#b18cff', teacher: 'Mr. Petrov', room: 'B-105', credits: 1, target: 84 },
  ];
  const gcDefs = [
    { name: 'Assignments', weight: 20, color: '#7c8cff' },
    { name: 'Quizzes', weight: 15, color: '#57c9a0' },
    { name: 'Tests', weight: 25, color: '#f0a75a' },
    { name: 'Exams', weight: 30, color: '#ef6f6c' },
    { name: 'Projects', weight: 10, color: '#b18cff' },
  ];
  const subjects = subjectDefs.map((s, i) => ({
    id: `sub-${s.name.split(' ')[0].toLowerCase()}`,
    name: s.name,
    teacher: s.teacher,
    room: s.room,
    term: 'Fall 2026',
    credits: s.credits,
    icon: s.icon,
    color: s.color,
    scale: 'af' as const,
    targetPct: s.target,
    categories: gcDefs.map((g) => ({ id: `gc-${i}-${g.name.toLowerCase()}`, name: g.name, weightPct: g.weight, dropLowest: g.name === 'Quizzes' ? 1 : 0, bestN: 0, color: g.color })),
    weighting: 'category' as const,
    syllabus: '',
    notes: '',
    archived: false,
    order: i,
  }));

  const markTitles: Record<string, string[]> = {
    Chemistry: ['Stoichiometry problem set', 'Titration lab', 'Periodic trends quiz', 'Moles unit test', 'Bonding assignment', 'Midterm exam', 'Lab report: enthalpy'],
    Mathematics: ['Limits worksheet', 'Derivatives quiz', 'Sequences assignment', 'Integration test', 'Vectors project', 'Midterm exam', 'Matrix problem set'],
    Biology: ['Cell structure quiz', 'Genetics lab', 'Photosynthesis assignment', 'Evolution test', 'Enzyme lab report', 'Osmosis quiz'],
    'English Literature': ['Macbeth essay', 'Poetry analysis', 'Thesis workshop', 'Comparative essay', 'Oral presentation', 'Romantics quiz'],
    History: ['Industrial Revolution essay', 'Cold War timeline', 'Source analysis', 'WWI unit test', 'Map quiz', 'Research project'],
  };
  const kindByCat: Record<string, 'assignment' | 'quiz' | 'test' | 'exam' | 'project' | 'lab'> = {
    assignments: 'assignment', quizzes: 'quiz', tests: 'test', exams: 'exam', projects: 'project',
  };
  const marks: DB['marks'] = [];
  subjects.forEach((sub, si) => {
    const titles = markTitles[sub.name] ?? [];
    titles.forEach((title, ti) => {
      const cat = sub.categories[ti % sub.categories.length];
      const key = cat.name.toLowerCase();
      const graded = !(ti === titles.length - 1 && si % 2 === 0);
      const base = 74 + Math.round(rand() * 24);
      marks.push({
        id: `mark-${si}-${ti}`,
        subjectId: sub.id,
        categoryId: cat.id,
        title,
        kind: kindByCat[key] ?? 'other',
        score: graded ? base : undefined,
        max: 100,
        status: graded ? 'graded' : 'pending',
        date: addDays(today, -(60 - ti * 8)).toISOString(),
        notes: '',
      });
    });
    // one upcoming assessment
    const upcomingCat = sub.categories[2];
    marks.push({
      id: `mark-up-${si}`,
      subjectId: sub.id,
      categoryId: upcomingCat.id,
      title: `${sub.name} unit test`,
      kind: 'test',
      score: undefined,
      max: 100,
      status: 'pending',
      date: addDays(today, 3 + si * 2).toISOString(),
      notes: 'Bring calculator',
    });
  });

  /* Todos --------------------------------------------------------- */
  const todoDefs: Array<[string, string, number, number | null, number | null, string]> = [
    ["Chem lab report on enthalpy", 'cat-school', 3, 2, 5, 'sub-chemistry'],
    ['Finish integration problem set 7', 'cat-school', 3, 1, 1, 'sub-mathematics'],
    ['Read Macbeth act 3 and annotate', 'cat-school', 2, 0, 2, 'sub-english'],
    ['Genetics lab write-up', 'cat-school', 2, 3, 4, 'sub-biology'],
    ['Review Cold War timeline', 'cat-school', 1, 4, 6, 'sub-history'],
    ['Draft history research project outline', 'cat-school', 2, 5, 9, 'sub-history'],
    ['Book dentist appointment', 'cat-personal', 1, null, 3, ''],
    ['Renew library card', 'cat-personal', 0, null, null, ''],
    ['Plan weekend hike with Sam', 'cat-personal', 1, 6, 7, ''],
    ['Reply to internship email', 'cat-work', 3, 0, 0, ''],
    ['Update CV with summer role', 'cat-work', 1, 2, 12, ''],
    ['Portfolio site: rewrite landing copy', 'cat-projects', 2, -1, 2, ''],
    ['Portfolio site: fix mobile nav', 'cat-projects', 1, null, 5, ''],
    ['Finish chapter 8 of Sapiens', 'cat-reading', 0, null, null, ''],
    ['Return borrowed calculator', 'cat-errands', 1, null, 1, ''],
    ['Buy lab goggles', 'cat-errands', 2, 0, 0, ''],
    ['Morning run 5k', 'cat-health', 1, null, null, ''],
  ];
  const todos: DB['todos'] = todoDefs.map(([title, categoryId, priority, start, due, subjectId], i) => {
    const status = i > 13 ? (i % 3 === 0 ? 'doing' : 'todo') : i === 12 ? 'blocked' : 'todo';
    const done = i === 6 || i === 8;
    return {
      id: `todo-${i}`,
      title,
      notes: i === 0 ? 'Include the calibration curve and error analysis.\n\n- [ ] raw data table\n- [ ] percent error' : '',
      categoryId,
      subjectId: subjectId ? subjectId : undefined,
      tags: i % 4 === 0 ? ['deep-work'] : i % 3 === 0 ? ['quick'] : [],
      priority,
      startAt: start === null ? undefined : at(addDays(today, start), 9 + (i % 8)),
      dueAt: due === null ? undefined : at(addDays(today, due), 17, 30),
      estimateMin: [30, 45, 60, 90, 120][i % 5],
      loggedMin: done ? 45 : 0,
      status: done ? 'done' : status,
      reminders: [],
      checklist: i === 0 ? [
        { id: uuid(), text: 'Raw data table', done: true },
        { id: uuid(), text: 'Percent error', done: false },
      ] : [],
      attachments: [],
      completedAt: done ? addDays(today, -1).toISOString() : undefined,
      createdAt: addDays(today, -10 - i).toISOString(),
      updatedAt: now,
      order: i,
    } as DB['todos'][number];
  });
  // a recurring chore
  todos.push({
    id: 'todo-recurring',
    title: 'Weekly chemistry problem set review',
    notes: '',
    categoryId: 'cat-school',
    subjectId: 'sub-chemistry',
    tags: [],
    priority: 1,
    dueAt: at(addDays(today, 1), 18),
    estimateMin: 45,
    loggedMin: 0,
    status: 'todo',
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
    reminders: [],
    checklist: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
    order: 20,
  });

  const projects: DB['projects'] = [
    { id: 'proj-portfolio', name: 'Portfolio site', description: 'Personal site rebuild', color: '#b18cff', icon: 'Globe', archived: false, createdAt: addDays(today, -30).toISOString() },
    { id: 'proj-research', name: 'History research project', description: 'Cold War source analysis', color: '#f0a75a', icon: 'Landmark', archived: false, createdAt: addDays(today, -20).toISOString() },
  ];
  todos[11].projectId = 'proj-portfolio';
  todos[12].projectId = 'proj-portfolio';
  todos[5].projectId = 'proj-research';

  /* Habits -------------------------------------------------------- */
  const habitDefs = [
    { name: 'Read 30 minutes', icon: 'BookOpen', color: '#c9d24b', schedule: { type: 'daily' as const, days: [0, 1, 2, 3, 4, 5, 6], times: 7 }, target: { type: 'duration' as const, value: 30 }, subject: 'sub-english' },
    { name: 'Exercise', icon: 'Dumbbell', color: '#ef6f6c', schedule: { type: 'timesPerWeek' as const, days: [1, 3, 5], times: 4 }, target: { type: 'boolean' as const, value: 1 }, subject: '' },
    { name: 'Meditate', icon: 'Brain', color: '#7c8cff', schedule: { type: 'daily' as const, days: [0, 1, 2, 3, 4, 5, 6], times: 7 }, target: { type: 'duration' as const, value: 10 }, subject: '' },
    { name: 'Review notes', icon: 'NotebookPen', color: '#57c9a0', schedule: { type: 'weekdays' as const, days: [1, 2, 3, 4, 5], times: 5 }, target: { type: 'boolean' as const, value: 1 }, subject: 'sub-chemistry' },
    { name: 'Practice Spanish', icon: 'Languages', color: '#f0a75a', schedule: { type: 'weekdays' as const, days: [1, 2, 3, 4, 5], times: 5 }, target: { type: 'count' as const, value: 15 }, subject: '' },
    { name: 'Plan tomorrow', icon: 'ListChecks', color: '#4db6e5', schedule: { type: 'daily' as const, days: [0, 1, 2, 3, 4, 5, 6], times: 7 }, target: { type: 'boolean' as const, value: 1 }, subject: '' },
  ];
  const habits = habitDefs.map((h, i) => ({
    id: `habit-${i}`,
    name: h.name,
    icon: h.icon,
    color: h.color,
    categoryId: i < 4 ? 'cat-health' : 'cat-personal',
    description: '',
    schedule: h.schedule,
    target: h.target,
    reminderTimes: i % 2 === 0 ? ['08:00'] : ['20:30'],
    linkedSubjectId: h.subject || undefined,
    startDate: addDays(today, -180).toISOString(),
    pausedUntil: undefined,
    order: i,
    createdAt: addDays(today, -180).toISOString(),
  }));

  const habitLogs: DB['habitLogs'] = [];
  habits.forEach((h, hi) => {
    for (let d = 180; d >= 0; d -= 1) {
      const day = subDays(today, d);
      const dow = day.getDay();
      const st: string = h.schedule.type;
      const scheduled = st === 'daily'
        || (st === 'everyOtherDay' ? Math.floor(d / 2) % 2 === 0 : h.schedule.days.includes(dow));
      if (!scheduled) continue;
      const consistency = [0.82, 0.6, 0.7, 0.74, 0.65, 0.88][hi];
      if (rand() > consistency) continue;
      const partial = h.target.type === 'duration' ? Math.round(h.target.value * (0.6 + rand() * 0.6)) : h.target.value;
      habitLogs.push({
        id: `hl-${hi}-${d}`,
        habitId: h.id,
        date: dk(day),
        value: partial,
        skipped: false,
        source: rand() > 0.75 ? 'timer' : 'manual',
      });
    }
  });

  /* Goals --------------------------------------------------------- */
  const goals: DB['goals'] = [
    {
      id: 'goal-1', title: 'Finish term with 90% average', icon: 'Trophy', color: '#f0a75a',
      type: 'outcome', deadline: addDays(today, 60).toISOString(), link: { kind: 'none', id: '' },
      progressMode: 'manual', manualProgress: 62, milestones: [
        { id: uuid(), title: 'All midterms above 85%', date: addDays(today, -14).toISOString(), done: true },
        { id: uuid(), title: 'Chem lab reports caught up', date: addDays(today, 10).toISOString(), done: false },
      ], status: 'on-track', createdAt: addDays(today, -80).toISOString(),
    },
    {
      id: 'goal-2', title: 'Study 100 hours this term', icon: 'Clock', color: '#7c8cff',
      type: 'numeric', deadline: addDays(today, 45).toISOString(), progressMode: 'auto',
      targetValue: 6000, manualProgress: 0, milestones: [], status: 'on-track',
      createdAt: addDays(today, -60).toISOString(),
    },
    {
      id: 'goal-3', title: 'Meditate 8 weeks straight', icon: 'Brain', color: '#57c9a0',
      type: 'habit', deadline: addDays(today, 20).toISOString(), link: { kind: 'habit', id: 'habit-2' },
      progressMode: 'auto', manualProgress: 0, targetValue: 56, milestones: [], status: 'on-track',
      createdAt: addDays(today, -30).toISOString(),
    },
    {
      id: 'goal-4', title: 'Ship portfolio site', icon: 'Rocket', color: '#b18cff',
      type: 'milestones', deadline: addDays(today, 30).toISOString(), progressMode: 'manual',
      manualProgress: 40, milestones: [
        { id: uuid(), title: 'Wireframes', date: addDays(today, -20).toISOString(), done: true },
        { id: uuid(), title: 'Design system', date: addDays(today, -6).toISOString(), done: true },
        { id: uuid(), title: 'Build pages', date: addDays(today, 12).toISOString(), done: false },
        { id: uuid(), title: 'Deploy', date: addDays(today, 28).toISOString(), done: false },
      ], status: 'on-track', createdAt: addDays(today, -40).toISOString(),
    },
  ];

  /* Focus sessions (365 days, heatmap source) --------------------- */
  const focusSessions: DB['focusSessions'] = [];
  for (let d = 364; d >= 0; d -= 1) {
    const day = subDays(today, d);
    const dow = day.getDay();
    const weekdayFactor = dow === 0 || dow === 6 ? 0.35 : 1;
    const trend = 0.55 + (365 - d) / 365 * 0.6;
    const sessionsToday = Math.round(rand() * 4 * weekdayFactor * trend);
    for (let s = 0; s < sessionsToday; s += 1) {
      const subject = pick(subjects);
      const startHour = 9 + Math.floor(rand() * 10);
      const started = new Date(day);
      started.setHours(startHour, [0, 15, 30, 45][Math.floor(rand() * 4)], 0, 0);
      const planned = pick([25, 25, 50, 50, 15, 90]);
      const actual = Math.round(planned * (0.75 + rand() * 0.35));
      focusSessions.push({
        id: `fs-${d}-${s}`,
        startedAt: started.toISOString(),
        endedAt: new Date(started.getTime() + actual * 60000).toISOString(),
        kind: rand() > 0.85 ? 'stopwatch' : 'focus',
        subjectId: subject.id,
        categoryId: 'cat-school',
        todoId: rand() > 0.7 ? `todo-${Math.floor(rand() * 6)}` : undefined,
        habitId: rand() > 0.8 ? 'habit-0' : undefined,
        label: '',
        plannedMin: planned,
        actualMin: actual,
        rating: rand() > 0.5 ? 3 + Math.round(rand()) : undefined,
        distractions: Math.round(rand() * 3),
        note: '',
      });
    }
  }

  /* Notes --------------------------------------------------------- */
  const notes: DB['notes'] = [
    {
      id: 'note-1', title: 'Chemistry — enthalpy and calorimetry', folder: 'School', tags: ['chemistry', 'exam'],
      pinned: true, journal: false, createdAt: addDays(today, -12).toISOString(), updatedAt: addDays(today, -1).toISOString(),
      body: '# Enthalpy\n\nEnthalpy (H) is the heat content of a system at constant pressure.\n\n## Key formulas\n\n- `q = mcΔT`\n- `ΔH = q / n`\n- Hess\'s law: sum of step enthalpies\n\n## Lab notes\n\n> Calibration curve needs at least 5 points.\n\n- [x] Record room temperature\n- [ ] Compute percent error\n',
    },
    { id: 'note-2', title: 'Macbeth — ambition motif quotes', folder: 'School', tags: ['english'], pinned: false, journal: false, createdAt: addDays(today, -9).toISOString(), updatedAt: addDays(today, -3).toISOString(), body: 'Act 1: "vaulting ambition, which o\'erleaps itself"\n\nAct 3: "Be innocent of the knowledge"\n\nLink to [[Chemistry — enthalpy and calorimetry]] as an example of backlinks.\n' },
    { id: 'note-3', title: 'Weekly review — structure', folder: 'System', tags: ['review'], pinned: true, journal: false, createdAt: addDays(today, -30).toISOString(), updatedAt: addDays(today, -7).toISOString(), body: '1. What moved forward?\n2. What stalled, and why?\n3. One thing to drop.\n4. Top three for next week.\n' },
    { id: 'note-4', title: 'Today', folder: 'Journal', tags: ['journal'], pinned: false, journal: true, mood: 4, createdAt: now, updatedAt: now, body: 'Felt sharp in the morning session. Chemistry clicked after the second worked example.\n\nEnergy dipped after lunch — move the harder task earlier tomorrow.' },
    { id: 'note-5', title: 'Integration by parts — worked examples', folder: 'School', tags: ['math'], pinned: false, journal: false, createdAt: addDays(today, -20).toISOString(), updatedAt: addDays(today, -5).toISOString(), body: 'When the integrand is a product, try `u` = the thing that gets simpler when differentiated.\n' },
    { id: 'note-6', title: 'Internship email draft', folder: 'Work', tags: ['work'], pinned: false, journal: false, createdAt: addDays(today, -4).toISOString(), updatedAt: addDays(today, -2).toISOString(), body: 'Subject: Summer research placement — application follow-up\n\nKeep it to four sentences.\n' },
  ];

  /* Decks --------------------------------------------------------- */
  const decks: DB['decks'] = [
    {
      id: 'deck-1', name: 'Chemistry — bonding', subjectId: 'sub-chemistry', createdAt: addDays(today, -14).toISOString(),
      cards: [
        { id: uuid(), front: 'What is an ionic bond?', back: 'Electrostatic attraction between oppositely charged ions.', ease: 2.5, interval: 0, due: dk(today), reps: 0, lapses: 0 },
        { id: uuid(), front: 'Define electronegativity', back: 'The tendency of an atom to attract shared electrons.', ease: 2.5, interval: 1, due: dk(subDays(today, 2)), reps: 2, lapses: 0 },
        { id: uuid(), front: 'What is a dipole-dipole force?', back: 'Attraction between partially charged ends of polar molecules.', ease: 2.3, interval: 3, due: dk(addDays(today, 1)), reps: 3, lapses: 1 },
        { id: uuid(), front: 'Formula for percent yield', back: '(actual / theoretical) x 100', ease: 2.5, interval: 0, due: dk(today), reps: 0, lapses: 0 },
      ],
    },
    {
      id: 'deck-2', name: 'Spanish verbs', createdAt: addDays(today, -6).toISOString(),
      cards: [
        { id: uuid(), front: 'aprender', back: 'to learn', ease: 2.5, interval: 0, due: dk(today), reps: 0, lapses: 0 },
        { id: uuid(), front: 'recordar', back: 'to remember', ease: 2.5, interval: 0, due: dk(today), reps: 0, lapses: 0 },
        { id: uuid(), front: 'conseguir', back: 'to get / achieve', ease: 2.5, interval: 2, due: dk(addDays(today, 2)), reps: 1, lapses: 0 },
      ],
    },
  ];

  /* Events -------------------------------------------------------- */
  const events: DB['events'] = [
    { id: 'ev-1', title: 'Chemistry unit test', start: at(addDays(today, 3), 10), end: at(addDays(today, 3), 11, 30), allDay: false, color: '#57c9a0', subjectId: 'sub-chemistry', location: 'B-214', notes: '' },
    { id: 'ev-2', title: 'Math midterm', start: at(addDays(today, 5), 9), end: at(addDays(today, 5), 11), allDay: false, color: '#7c8cff', subjectId: 'sub-mathematics', location: 'A-108', notes: '' },
    { id: 'ev-3', title: 'English seminar — Macbeth', start: at(addDays(today, 1), 13), end: at(addDays(today, 1), 14), allDay: false, color: '#f0a75a', subjectId: 'sub-english', location: 'D-011', notes: '' },
    { id: 'ev-4', title: 'Study group', start: at(addDays(today, 2), 16), end: at(addDays(today, 2), 18), allDay: false, color: '#b18cff', location: 'Library', notes: '' },
    { id: 'ev-5', title: 'Biology field trip', start: at(addDays(today, 8), 8), end: at(addDays(today, 8), 16), allDay: true, color: '#ef6f6c', subjectId: 'sub-biology', location: 'Riverdale', notes: '' },
  ];

  /* Sound mixes --------------------------------------------------- */
  const mixes: DB['mixes'] = [
    { id: 'mix-deep', name: 'Deep Focus', masterVolume: 0.8, masterMuffle: 0, favorite: true, layers: [
      { type: 'brown', volume: 0.32, pan: 0, params: {}, muted: false, solo: false },
      { type: 'rain-light', volume: 0.24, pan: 0.1, params: { tone: 0.4 }, muted: false, solo: false },
    ] },
    { id: 'mix-rainy', name: 'Rainy Study', masterVolume: 0.8, masterMuffle: 0, favorite: true, layers: [
      { type: 'rain-heavy', volume: 0.45, pan: 0, params: {}, muted: false, solo: false },
      { type: 'thunder', volume: 0.18, pan: 0, params: {}, muted: false, solo: false },
      { type: 'fire', volume: 0.15, pan: -0.2, params: {}, muted: false, solo: false },
    ] },
    { id: 'mix-cafe', name: 'Cafe', masterVolume: 0.75, masterMuffle: 0, favorite: false, layers: [
      { type: 'cafe', volume: 0.4, pan: 0, params: {}, muted: false, solo: false },
      { type: 'typing', volume: 0.18, pan: 0.2, params: {}, muted: false, solo: false },
      { type: 'pink', volume: 0.1, pan: 0, params: {}, muted: false, solo: false },
    ] },
    { id: 'mix-sleep', name: 'Sleep', masterVolume: 0.6, masterMuffle: 0.35, favorite: false, layers: [
      { type: 'brown', volume: 0.3, pan: 0, params: {}, muted: false, solo: false },
      { type: 'ocean', volume: 0.35, pan: 0, params: {}, muted: false, solo: false },
    ] },
    { id: 'mix-meditation', name: 'Meditation', masterVolume: 0.7, masterMuffle: 0, favorite: false, layers: [
      { type: 'binaural-alpha', volume: 0.22, pan: 0, params: {}, muted: false, solo: false },
      { type: 'ocean', volume: 0.18, pan: 0, params: {}, muted: false, solo: false },
    ] },
    { id: 'mix-storm', name: 'Thunderstorm', masterVolume: 0.85, masterMuffle: 0, favorite: false, layers: [
      { type: 'rain-heavy', volume: 0.5, pan: 0, params: {}, muted: false, solo: false },
      { type: 'thunder', volume: 0.4, pan: 0, params: {}, muted: false, solo: false },
      { type: 'wind', volume: 0.2, pan: 0, params: {}, muted: false, solo: false },
    ] },
    { id: 'mix-ocean', name: 'Ocean Night', masterVolume: 0.7, masterMuffle: 0, favorite: false, layers: [
      { type: 'ocean', volume: 0.45, pan: 0, params: {}, muted: false, solo: false },
      { type: 'crickets', volume: 0.2, pan: 0, params: {}, muted: false, solo: false },
    ] },
  ];

  /* Reminders + notifications ------------------------------------- */
  const reminders: DB['reminders'] = [
    { id: 'rem-1', targetKind: 'todo', targetId: 'todo-0', title: 'Chem lab report due soon', body: 'Due today at 5:30 PM', fireAt: at(today, 16, 30), delivered: false, missed: false, actions: ['complete', 'snooze10', 'open'], route: '/todos' },
    { id: 'rem-2', targetKind: 'habit', targetId: 'habit-0', title: 'Read 30 minutes', body: 'Daily habit still open', fireAt: at(today, 20, 30), delivered: false, missed: false, actions: ['complete', 'snooze30', 'open'], route: '/habits' },
    { id: 'rem-3', targetKind: 'mark', targetId: 'mark-up-0', title: 'Chemistry unit test in 3 days', body: 'B-214 at 10:00 AM', fireAt: at(addDays(today, 2), 18), delivered: false, missed: false, actions: ['open'], route: '/grades' },
  ];
  const notifications: DB['notifications'] = [
    { id: 'n-1', kind: 'system', title: 'Welcome to Flow', body: 'Everything lives in one local database. No accounts, no telemetry.', at: now, read: false, missed: false, route: '/', actions: [] },
    { id: 'n-2', kind: 'todo', title: 'Integration problem set due in 2 hours', body: 'Mathematics', at: subDays(today, 0).toISOString(), read: true, missed: false, route: '/todos', actions: ['complete', 'snooze10'] },
  ];

  const timerProfiles: DB['settings']['timerProfiles'] = [
    { id: 'pomodoro-classic', name: 'Classic 25/5', focus: 25, shortBreak: 5, longBreak: 15, sessionsBeforeLong: 4, autoStartBreaks: false, autoStartFocus: false, strict: false, mixId: 'mix-deep' },
    { id: 'pomodoro-deep', name: 'Deep 50/10', focus: 50, shortBreak: 10, longBreak: 25, sessionsBeforeLong: 3, autoStartBreaks: true, autoStartFocus: false, strict: false, mixId: 'mix-deep' },
    { id: 'pomodoro-sprint', name: 'Sprint 15/3', focus: 15, shortBreak: 3, longBreak: 12, sessionsBeforeLong: 4, autoStartBreaks: true, autoStartFocus: true, strict: false },
  ];

  const activity: DB['activity'] = [
    { id: 'a-1', at: addDays(today, -1).toISOString(), kind: 'mark', text: 'Added mark "Lab report: enthalpy" to Chemistry' },
    { id: 'a-2', at: addDays(today, -1).toISOString(), kind: 'habit', text: 'Checked in "Read 30 minutes"' },
    { id: 'a-3', at: addDays(today, -2).toISOString(), kind: 'todo', text: 'Completed "Morning run 5k"' },
  ];

  const db: DB = {
    version: SCHEMA_VERSION,
    projects,
    categories, todos, habits, habitLogs, goals, subjects, marks, focusSessions,
    reminders, notifications, notes, decks, events, mixes, activity, timers: [],
    settings: DBSchema.shape.settings.parse({
      timerProfiles,
      activeProfileId: 'pomodoro-classic',
      onboardingComplete: false,
      enabledTools: [],
    }),
  };
  return db;
}

/** 12-week window used by compact dashboard widgets. */
export function lastNWeeks(n: number, weekStart: number) {
  const thisWeek = startOfWeek(new Date(), { weekStartsOn: weekStart as 0 | 1 });
  return Array.from({ length: n }, (_, i) => subDays(thisWeek, (n - 1 - i) * 7));
}
