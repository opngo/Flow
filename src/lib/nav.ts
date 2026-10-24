export type NavItem = { id: string; label: string; icon: string; route: string; group: string; keywords?: string };

/** Primary sidebar destinations. These are also the palette `/` pages. */
export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', route: '/', group: 'Main', keywords: 'home overview' },
  { id: 'todos', label: 'Todos', icon: 'CheckSquare', route: '/todos', group: 'Main', keywords: 'tasks list kanban board' },
  { id: 'habits', label: 'Habits', icon: 'Flame', route: '/habits', group: 'Main', keywords: 'streak weekly heatmap' },
  { id: 'goals', label: 'Goals', icon: 'Target', route: '/goals', group: 'Main', keywords: 'milestones progress' },
  { id: 'focus', label: 'Focus', icon: 'Timer', route: '/focus', group: 'Time', keywords: 'pomodoro timer' },
  { id: 'timers', label: 'Timers', icon: 'AlarmClock', route: '/timers', group: 'Time', keywords: 'stopwatch countdown interval exam' },
  { id: 'analytics', label: 'Analytics', icon: 'BarChart3', route: '/analytics', group: 'Time', keywords: 'heatmap study time stats' },
  { id: 'calendar', label: 'Calendar', icon: 'CalendarDays', route: '/calendar', group: 'Time', keywords: 'schedule events month week' },
  { id: 'grades', label: 'Grades', icon: 'GraduationCap', route: '/grades', group: 'Study', keywords: 'subjects marks gpa what-if' },
  { id: 'notes', label: 'Notes', icon: 'NotebookPen', route: '/notes', group: 'Study', keywords: 'markdown journal writing' },
  { id: 'flashcards', label: 'Flashcards', icon: 'Layers', route: '/flashcards', group: 'Study', keywords: 'spaced repetition srs deck' },
  { id: 'sound', label: 'Sound Studio', icon: 'AudioLines', route: '/sound', group: 'Atmosphere', keywords: 'noise rain mixer ambient' },
  { id: 'tools', label: 'Tools', icon: 'Wrench', route: '/tools', group: 'Atmosphere', keywords: 'catalog utilities calculators' },
  { id: 'notifications', label: 'Notifications', icon: 'Bell', route: '/notifications', group: 'System', keywords: 'reminders alerts center' },
  { id: 'settings', label: 'Settings', icon: 'Settings', route: '/settings', group: 'System', keywords: 'preferences theme fonts' },
];

export type Tool = { id: string; name: string; icon: string; group: string; route: string; desc: string; keywords?: string };

const t = (id: string, name: string, icon: string, group: string, desc: string, route?: string, keywords?: string): Tool =>
  ({ id, name, icon, group, desc, route: route ?? `/tools/${id}`, keywords });

/** Master tool catalog (spec §14). Every entry resolves to a real page. */
export const TOOLS: Tool[] = [
  /* Tasks and planning */
  t('todos', 'Todo manager', 'CheckSquare', 'Tasks', 'Every task with dates, priorities and reminders.', '/todos'),
  t('quick-add', 'Quick add (natural language)', 'Zap', 'Tasks', 'Parse dates, tags and estimates from one line.', '/todos', 'nlp capture'),
  t('kanban', 'Kanban boards', 'Rows', 'Tasks', 'Status and category columns with drag and drop.', '/todos?view=board'),
  t('eisenhower', 'Eisenhower matrix', 'Grid2x2', 'Tasks', 'Sort by urgency and importance.', '/todos?view=matrix'),
  t('day-planner', 'Daily time-blocking planner', 'CalendarRange', 'Tasks', 'Block the day hour by hour.', '/todos?view=planner'),
  t('timeline', 'Timeline (Gantt-lite)', 'GanttChartSquare', 'Tasks', 'Bars across the next two weeks.', '/todos?view=timeline'),
  t('deadline-radar', 'Deadline radar', 'Radar', 'Tasks', 'Everything due in the next seven days.', '/todos?view=radar'),
  t('overdue-rescue', 'Overdue rescue', 'LifeBuoy', 'Tasks', 'Re-plan every overdue item at once.', '/todos?view=overdue'),
  t('focus-list', 'Next-three focus list', 'Crosshair', 'Tasks', 'The only three things that matter now.', '/todos?view=focus'),
  t('completed-log', 'Completed log', 'History', 'Tasks', 'Everything you finished, by day.', '/todos?view=done'),
  t('projects', 'Project manager', 'FolderKanban', 'Tasks', 'Group tasks into projects with progress.', '/todos?view=projects'),
  t('recurring', 'Recurring task engine', 'Repeat', 'Tasks', 'RRULE-based repeating chores.', '/tools/recurring'),
  t('templates', 'Task & checklist templates', 'ClipboardList', 'Tasks', 'Reusable task blueprints.', '/tools/task-templates'),
  t('weekly-review', 'Weekly review wizard', 'ClipboardCheck', 'Tasks', 'Guided review of the week.', '/tools/weekly-review'),
  t('daily-review', 'Daily review wizard', 'Sun', 'Tasks', 'Close the day in two minutes.', '/tools/daily-review'),
  t('inbox', 'Quick capture inbox', 'Inbox', 'Tasks', 'Triage captured items later.', '/tools/inbox'),
  t('someday', 'Someday / maybe list', 'Archive', 'Tasks', 'Ideas parked without a date.', '/tools/someday'),
  t('waiting', 'Waiting-for list', 'Hourglass', 'Tasks', 'Blocked on someone else.', '/tools/waiting'),

  /* Habits and goals */
  t('habits', 'Weekly habit tracker', 'Flame', 'Habits', 'Weekly schedule with one-click check-ins.', '/habits'),
  t('habit-heatmap', 'Habit heatmap', 'LayoutGrid', 'Habits', '53x7 consistency grid per habit.', '/habits?view=heatmap'),
  t('streak-board', 'Habit streak board', 'TrendingUp', 'Habits', 'Current, longest and weekly streaks.', '/habits?view=streaks'),
  t('habit-calendar', 'Habit calendar', 'CalendarDays', 'Habits', 'Drag a habit onto a day to schedule it.', '/habits?view=calendar'),
  t('habit-insights', 'Habit insights', 'Lightbulb', 'Habits', 'Best weekday, best time, consistency.', '/habits?view=insights'),
  t('goals', 'Goals manager', 'Target', 'Habits', 'Outcome, numeric, habit and milestone goals.', '/goals'),
  t('milestones', 'Milestone tracker', 'ListChecks', 'Habits', 'Dated checkpoints inside goals.', '/goals?view=milestones'),
  t('goal-timeline', 'Goal progress timeline', 'GanttChartSquare', 'Habits', 'Progress over time per goal.', '/goals?view=timeline'),
  t('achievements', 'Achievements and badges', 'Medal', 'Habits', 'Milestones you have earned.', '/tools/achievements'),
  t('vacation', 'Vacation / pause mode', 'Plane', 'Habits', 'Protect streaks while you are away.', '/tools/vacation'),

  /* Time and focus */
  t('focus', 'Pomodoro', 'Timer', 'Time', 'Focus blocks, breaks and profiles.', '/focus'),
  t('timers', 'Multiple timers', 'AlarmClock', 'Time', 'Named countdowns running at once.', '/timers'),
  t('countdown', 'Countdown', 'Hourglass', 'Time', 'A single big countdown.', '/timers?tab=countdown'),
  t('stopwatch', 'Stopwatch with laps', 'Watch', 'Time', 'Lap splits and attach to task.', '/timers?tab=stopwatch'),
  t('interval', 'Interval / HIIT timer', 'Repeat', 'Time', 'Rounds and rest.', '/timers?tab=interval'),
  t('routines', 'Routine chains', 'Workflow', 'Time', 'Sequence timers back to back.', '/timers?tab=routines'),
  t('timetracker', 'Time tracker', 'Clock', 'Time', 'Start/stop with idle detection.', '/timers?tab=tracker'),
  t('timesheet', 'Timesheet and CSV export', 'Table', 'Time', 'Daily and weekly totals.', '/timers?tab=timesheet'),
  t('exam-mode', 'Exam mode', 'Presentation', 'Time', 'Section timers and warnings.', '/tools/exam-mode'),
  t('mini-timer', 'Mini floating timer', 'AppWindow', 'Time', 'Always-on-top widget.', '/tools/mini-timer'),
  t('breath', 'Break guide', 'Waves', 'Time', 'Guided breathing animation.', '/tools/breath'),
  t('eye-rest', '20-20-20 eye rest', 'Eye', 'Time', 'Look away every twenty minutes.', '/tools/eye-rest'),
  t('stretch', 'Stretch reminders', 'PersonStanding', 'Time', 'Movement nudges.', '/tools/stretch'),
  t('water', 'Water reminders', 'Droplet', 'Time', 'Hydration nudges.', '/tools/water'),
  t('wind-down', 'Bedtime wind-down', 'Moon', 'Time', 'Evening routine countdown.', '/tools/wind-down'),
  t('world-clock', 'World clock', 'Globe', 'Time', 'Compare time zones.', '/tools/world-clock'),
  t('day-progress', 'Day progress bar', 'Gauge', 'Time', 'How much of today is gone.', '/tools/day-progress'),
  t('distraction-log', 'Distraction log', 'CircleAlert', 'Time', 'Note what pulled you away.', '/tools/distraction-log'),
  t('nudge', 'Procrastination nudge', 'Rocket', 'Time', 'Start with just five minutes.', '/tools/nudge'),

  /* Study and grades */
  t('grades', 'Subjects manager', 'GraduationCap', 'Study', 'Each subject as its own space.', '/grades'),
  t('marks', 'Marks by category with weights', 'Percent', 'Study', 'Weighted categories and marks.', '/grades'),
  t('what-if', 'Grade what-if calculator', 'Calculator', 'Study', 'Model hypothetical marks.', '/grades?view=whatif'),
  t('gpa', 'GPA calculator', 'Award', 'Study', 'Credit-weighted GPA on any scale.', '/grades?view=gpa'),
  t('final-needed', 'Final-grade needed calculator', 'Sigma', 'Study', 'What you need on the final.', '/tools/final-needed'),
  t('trends', 'Grade trend charts', 'LineChart', 'Study', 'Per-subject trend lines.', '/grades?view=trends'),
  t('compare', 'Subject comparison', 'BarChart3', 'Study', 'Compare subjects side by side.', '/grades?view=compare'),
  t('heatmap', 'Study heatmap', 'LayoutGrid', 'Study', '53x7 study minutes grid.', '/analytics?view=heatmap'),
  t('study-per-subject', 'Study time per subject', 'PieChart', 'Study', 'Where the hours went.', '/analytics?view=subjects'),
  t('flashcards', 'Flashcards with spaced repetition', 'Layers', 'Study', 'SM-2 style scheduling.', '/flashcards'),
  t('deck-import', 'Deck importer', 'Upload', 'Study', 'CSV front,back import.', '/flashcards?view=import'),
  t('study-planner', 'Study planner', 'CalendarRange', 'Study', 'Exam countdown to a schedule.', '/tools/study-planner'),
  t('assignments', 'Assignment tracker', 'ClipboardList', 'Study', 'All upcoming assessments.', '/tools/assignments'),
  t('timetable', 'Class timetable', 'Table', 'Study', 'Weekly class grid.', '/tools/timetable'),
  t('reading-list', 'Reading list and progress', 'BookOpen', 'Study', 'Books with page progress.', '/tools/reading-list'),
  t('citations', 'Citation helper', 'Quote', 'Study', 'APA and MLA formatters.', '/tools/citations'),
  t('formulas', 'Formula sheet library', 'Braces', 'Study', 'Save formulas per subject.', '/tools/formulas'),
  t('vocab', 'Vocabulary builder', 'Languages', 'Study', 'Word, meaning, example.', '/tools/vocab'),
  t('practice-log', 'Practice-question logger', 'ClipboardCheck', 'Study', 'Right/wrong by topic.', '/tools/practice-log'),
  t('syllabus', 'Syllabus checklist', 'Clipboard', 'Study', 'Tick off syllabus topics.', '/tools/syllabus'),

  /* Notes and writing */
  t('notes', 'Markdown notes', 'NotebookPen', 'Notes', 'Full markdown editor.', '/notes'),
  t('scratchpad', 'Scratchpad', 'StickyNote', 'Notes', 'One always-there note.', '/tools/scratchpad'),
  t('journal', 'Journal with mood scale', 'Smile', 'Notes', 'Daily entry and mood.', '/tools/journal'),
  t('writing-mode', 'Distraction-free writing', 'PenLine', 'Notes', 'Only the text.', '/tools/writing-mode'),
  t('word-count', 'Word and character counter', 'Type', 'Notes', 'Live counts and reading time.', '/tools/word-count'),
  t('snippets', 'Snippet manager', 'Scissors', 'Notes', 'Save reusable text.', '/tools/snippets'),
  t('clipboard', 'Clipboard history', 'Copy', 'Notes', 'Recent copied text.', '/tools/clipboard'),
  t('templates-lib', 'Templates library', 'Files', 'Notes', 'Note templates.', '/tools/template-lib'),
  t('whiteboard', 'Whiteboard canvas', 'Brush', 'Notes', 'Freehand drawing.', '/tools/whiteboard'),
  t('mindmap', 'Mind map', 'GitBranch', 'Notes', 'Branch ideas from a centre.', '/tools/mindmap'),
  t('cornell', 'Cornell notes template', 'Columns3', 'Notes', 'Cue, notes, summary.', '/tools/cornell'),
  t('outline', 'Outline builder', 'List', 'Notes', 'Indented outline with reordering.', '/tools/outline'),

  /* Sound */
  t('sound', 'Sound Studio mixer', 'AudioLines', 'Sound', 'Layer noise and nature.', '/sound'),
  t('noise', 'White / pink / brown / blue noise', 'Radio', 'Sound', 'Six procedural noise colours.', '/sound'),
  t('rain', 'Rain and thunder generator', 'CloudRain', 'Sound', 'Five rain variants plus thunder.', '/sound'),
  t('binaural', 'Binaural beats', 'Headphones', 'Sound', 'Delta to beta presets.', '/sound'),
  t('sleep-timer', 'Sleep timer', 'Moon', 'Sound', 'Fade out after N minutes.', '/sound'),
  t('mix-presets', 'Mix presets and sharing', 'Album', 'Sound', 'Save and export mixes.', '/sound?view=presets'),
  t('visualizer', 'Visualizer', 'BarChart3', 'Sound', 'Spectrum that follows the accent.', '/sound?view=visualizer'),

  /* Calculators and utilities */
  t('scientific-calc', 'Scientific calculator', 'Calculator', 'Utilities', 'Full expression evaluator.', '/tools/scientific-calc'),
  t('percentage-calc', 'Percentage calculator', 'Percent', 'Utilities', 'All the percentage questions.', '/tools/percentage-calc'),
  t('unit-convert', 'Unit converter', 'Ruler', 'Utilities', 'Length, mass, volume, data, speed.', '/tools/unit-convert'),
  t('date-diff', 'Date difference', 'CalendarRange', 'Utilities', 'Days between two dates.', '/tools/date-diff'),
  t('age-calc', 'Age / duration calculator', 'Cake', 'Utilities', 'Exact age or duration.', '/tools/age-calc'),
  t('random', 'Random picker / dice / coin', 'Shuffle', 'Utilities', 'Fair randomness.', '/tools/random'),
  t('color-palette', 'Colour picker and palette', 'Palette', 'Utilities', 'Harmonies from a base colour.', '/tools/color-palette'),
  t('base64', 'Base64 / URL encoder', 'Binary', 'Utilities', 'Encode and decode.', '/tools/base64'),
  t('text-case', 'Text case converter', 'CaseSensitive', 'Utilities', 'Nine casing styles.', '/tools/text-case'),
  t('lorem', 'Lorem ipsum', 'FileText', 'Utilities', 'Placeholder paragraphs.', '/tools/lorem'),
  t('qr', 'QR code generator', 'QrCode', 'Utilities', 'QR for any text.', '/tools/qr'),
  t('password', 'Password generator', 'KeyRound', 'Utilities', 'Strong passwords.', '/tools/password'),
  t('hash', 'Hash generator', 'ShieldCheck', 'Utilities', 'SHA-1/256/384/512.', '/tools/hash'),
  t('json', 'JSON formatter', 'Braces', 'Utilities', 'Format, minify, validate.', '/tools/json'),
  t('regex', 'Regex tester', 'Regex', 'Utilities', 'Test patterns live.', '/tools/regex'),
  t('markdown-preview', 'Markdown previewer', 'FileCode2', 'Utilities', 'Render markdown instantly.', '/tools/markdown-preview'),
  t('timestamp', 'Timestamp converter', 'History', 'Utilities', 'Unix time to ISO and back.', '/tools/timestamp'),
  t('timezone', 'Timezone meeting planner', 'Globe', 'Utilities', 'Overlap across cities.', '/tools/timezone'),
  t('countdown-events', 'Event countdowns', 'AlarmClock', 'Utilities', 'Days until an event.', '/tools/countdown-events'),

  /* Organization and data */
  t('bookmarks', 'Bookmarks and resources', 'Bookmark', 'Organise', 'Links with tags.', '/tools/bookmarks'),
  t('files', 'File shortcuts', 'FolderOpen', 'Organise', 'Launch local files and folders.', '/tools/files'),
  t('contacts', 'Contacts-lite', 'Users', 'Organise', 'Study group and teachers.', '/tools/contacts'),
  t('budget', 'Budget / expense tracker', 'Wallet', 'Organise', 'Simple expense log.', '/tools/budget'),
  t('subscriptions', 'Subscriptions tracker', 'CreditCard', 'Organise', 'Renewal dates and costs.', '/tools/subscriptions'),
  t('packing', 'Packing / checklist lists', 'Backpack', 'Organise', 'Reusable checklists.', '/tools/packing'),
  t('search', 'Global search', 'Search', 'Organise', 'Search across everything.', '/tools/search'),
  t('tags', 'Tag manager', 'Tag', 'Organise', 'Rename and merge tags.', '/tools/tags'),
  t('saved-views', 'Saved views', 'Filter', 'Organise', 'Save filter combinations.', '/tools/saved-views'),
  t('backup', 'Backup scheduler', 'Database', 'Organise', 'Local backups with retention.', '/tools/backup'),
  t('export', 'Full data export / import', 'Download', 'Organise', 'JSON and CSV.', '/tools/export'),
  t('undo-history', 'Undo / redo history', 'Undo2', 'Organise', 'Recent state snapshots.', '/tools/undo-history'),
  t('activity', 'Activity log', 'Activity', 'Organise', 'Everything that happened.', '/tools/activity'),
  t('notification-center', 'Notification center', 'Bell', 'Organise', 'History and filters.', '/notifications'),
  t('shortcuts', 'Keyboard shortcut cheat sheet', 'Keyboard', 'Organise', 'Press ? anywhere.', '/tools/shortcuts'),
  t('appearance', 'Theme and font studio', 'Palette', 'Organise', 'Themes, fonts, density.', '/settings?tab=appearance'),
  t('widgets', 'Dashboard widget gallery', 'LayoutGrid', 'Organise', 'Add widgets to the dashboard.', '/tools/widgets'),
  t('app-lock', 'App lock with PIN', 'Lock', 'Organise', 'PIN protection.', '/settings?tab=security'),
  t('changelog', 'In-app changelog', 'History', 'Organise', 'What shipped when.', '/tools/changelog'),
];

export const TOOL_GROUPS = Array.from(new Set(TOOLS.map((x) => x.group)));

export function toolById(id: string) {
  return TOOLS.find((x) => x.id === id);
}

export const DEFAULT_SIDEBAR = NAV.map((n) => ({ id: n.id, label: n.label, icon: n.icon, route: n.route, hidden: false, group: n.group === 'System' ? 'System' : 'Main' }));

export function navByRoute(route: string) {
  return NAV.find((n) => n.route === route);
}
