import type { GradeCategory, Mark, Subject } from './types';

export type GradeOpts = {
  treatPendingAsZero?: boolean;
  treatMissingAsZero?: boolean;
  weighting?: 'category' | 'points' | 'equal';
};

export type CategoryBreakdown = {
  categoryId: string;
  name: string;
  weightPct: number;
  avg: number | null;
  contribution: number;
  effectiveWeight: number;
  count: number;
  color: string;
  marks: Mark[];
};

export type SubjectGrade = {
  pct: number | null;
  letter: string;
  gpa: number;
  breakdown: CategoryBreakdown[];
  weightTotal: number;
  gradedCount: number;
  pendingCount: number;
  missingCount: number;
};

export const LETTER_SCALE: Array<{ min: number; letter: string; gpa: number }> = [
  { min: 93, letter: 'A', gpa: 4.0 }, { min: 90, letter: 'A-', gpa: 3.7 },
  { min: 87, letter: 'B+', gpa: 3.3 }, { min: 83, letter: 'B', gpa: 3.0 },
  { min: 80, letter: 'B-', gpa: 2.7 }, { min: 77, letter: 'C+', gpa: 2.3 },
  { min: 73, letter: 'C', gpa: 2.0 }, { min: 70, letter: 'C-', gpa: 1.7 },
  { min: 67, letter: 'D+', gpa: 1.3 }, { min: 63, letter: 'D', gpa: 1.0 },
  { min: 60, letter: 'D-', gpa: 0.7 }, { min: 0, letter: 'F', gpa: 0.0 },
];

export function letterFor(pct: number, scale: Subject['scale'] = 'af'): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  if (scale === 'percent') return `${pct.toFixed(1)}%`;
  if (scale === 'gpa5') {
    if (pct >= 90) return '5.0';
    if (pct >= 85) return '4.5';
    if (pct >= 80) return '4.0';
    if (pct >= 75) return '3.5';
    if (pct >= 70) return '3.0';
    if (pct >= 65) return '2.5';
    if (pct >= 60) return '2.0';
    return '1.0';
  }
  return LETTER_SCALE.find((s) => pct >= s.min)?.letter ?? 'F';
}

export function gpaFor(pct: number | null, scale: Subject['scale'] = 'gpa4'): number {
  if (pct == null) return 0;
  if (scale === 'gpa5') return Math.min(5, Math.max(0, (pct / 100) * 5));
  return LETTER_SCALE.find((s) => pct >= s.min)?.gpa ?? 0;
}

function gradeable(mark: Mark, opts: GradeOpts) {
  if (mark.status === 'graded') return true;
  if (mark.status === 'excused') return false;
  if (mark.status === 'pending') return !!opts.treatPendingAsZero;
  if (mark.status === 'missing') return !!opts.treatMissingAsZero;
  return false;
}

/** Apply drop-lowest / best-N / extra-credit rules to a category's marks. */
export function applyCategoryRules(marks: Mark[], category: GradeCategory): Mark[] {
  let list = marks.filter((m) => m.status !== 'excused');
  const scored = list.filter((m) => m.status === 'graded' || m.status === 'missing');
  if (category.dropLowest && category.dropLowest > 0 && scored.length > category.dropLowest) {
    const sorted = [...scored].sort((a, b) => pctOf(a) - pctOf(b));
    const drop = new Set(sorted.slice(0, category.dropLowest).map((m) => m.id));
    list = list.filter((m) => !drop.has(m.id));
  }
  if (category.bestN && category.bestN > 0 && scored.length > category.bestN) {
    const sorted = [...scored].sort((a, b) => pctOf(b) - pctOf(a));
    const keep = new Set(sorted.slice(0, category.bestN).map((m) => m.id));
    list = list.filter((m) => keep.has(m.id) || m.status !== 'graded');
  }
  return list;
}

export function pctOf(mark: Mark): number {
  if (mark.status === 'missing') return 0;
  if (mark.score == null || !mark.max) return 0;
  return (mark.score / mark.max) * 100;
}

/** Current grade = weighted average of graded items (spec §12.4). */
export function computeSubjectGrade(
  subject: Subject,
  allMarks: Mark[],
  opts: GradeOpts = {},
): SubjectGrade {
  const weighting = opts.weighting ?? subject.weighting;
  const marks = allMarks.filter((m) => m.subjectId === subject.id);
  const graded = marks.filter((m) => gradeable(m, opts));
  const weightTotal = subject.categories.reduce((a, c) => a + c.weightPct, 0);

  const breakdown: CategoryBreakdown[] = subject.categories.map((cat) => {
    const catMarks = marks.filter((m) => m.categoryId === cat.id);
    const usable = applyCategoryRules(catMarks.filter((m) => gradeable(m, opts)), cat).filter((m) => m.status !== 'pending');
    const avg = usable.length ? usable.reduce((a, m) => a + pctOf(m), 0) / usable.length : null;
    const effectiveWeight = weightTotal > 0 ? cat.weightPct : 0;
    return {
      categoryId: cat.id,
      name: cat.name,
      weightPct: cat.weightPct,
      avg,
      contribution: avg != null ? (avg * effectiveWeight) / 100 : 0,
      effectiveWeight,
      count: usable.length,
      color: cat.color,
      marks: usable,
    };
  });

  let pct: number | null = null;

  if (weighting === 'category') {
    const active = breakdown.filter((b) => b.avg != null && b.weightPct > 0);
    const sumW = active.reduce((a, b) => a + b.weightPct, 0);
    pct = sumW > 0 ? active.reduce((a, b) => a + (b.avg ?? 0) * b.weightPct, 0) / sumW : null;
  } else if (weighting === 'points') {
    const usable = graded.filter((m) => m.status !== 'pending');
    const max = usable.reduce((a, m) => a + m.max, 0);
    const score = usable.reduce((a, m) => a + (m.score ?? 0), 0);
    pct = max > 0 ? (score / max) * 100 : null;
  } else {
    const usable = graded.filter((m) => m.status !== 'pending');
    pct = usable.length ? usable.reduce((a, m) => a + pctOf(m), 0) / usable.length : null;
  }

  if (pct != null) pct = Math.round(pct * 100) / 100;

  return {
    pct,
    letter: letterFor(pct ?? 0, subject.scale),
    gpa: gpaFor(pct, subject.scale === 'gpa5' ? 'gpa5' : subject.scale === 'percent' ? 'percent' : 'gpa4'),
    breakdown,
    weightTotal,
    gradedCount: marks.filter((m) => m.status === 'graded').length,
    pendingCount: marks.filter((m) => m.status === 'pending').length,
    missingCount: marks.filter((m) => m.status === 'missing').length,
  };
}

export function termGPA(subjects: Subject[], marks: Mark[]): number {
  const active = subjects.filter((s) => !s.archived);
  const totalCredits = active.reduce((a, s) => a + (s.credits || 1), 0);
  if (!totalCredits) return 0;
  const sum = active.reduce((a, s) => {
    const g = computeSubjectGrade(s, marks);
    return a + (g.pct == null ? 0 : gpaFor(g.pct, s.scale === 'gpa5' ? 'gpa5' : 'gpa4')) * (s.credits || 1);
  }, 0);
  return sum / totalCredits;
}

/** What-if: hypothetical marks do not touch the store. */
export type WhatIfItem = { categoryId: string; pct: number; weightHint?: number };

export function whatIfGrade(subject: Subject, marks: Mark[], items: WhatIfItem[], opts: GradeOpts = {}) {
  const fake: Mark[] = items.map((item, i) => ({
    id: `whatif-${i}`, subjectId: subject.id, categoryId: item.categoryId, title: 'Hypothetical',
    kind: 'other', score: item.pct, max: 100, status: 'graded', date: new Date().toISOString(), notes: '',
  }));
  return computeSubjectGrade(subject, [...marks, ...fake], opts).pct;
}

/** "What do I need on the final to get X%" */
export function neededOnFinal(
  subject: Subject, marks: Mark[], finalWeightPct: number, targetPct: number,
): number | null {
  const current = computeSubjectGrade(subject, marks);
  if (current.pct == null) return null;
  const currentWeight = subject.categories.reduce((a, c) => a + c.weightPct, 0) - finalWeightPct;
  const remaining = Math.max(0, finalWeightPct);
  if (remaining <= 0) return null;
  const needed = (targetPct * (currentWeight + remaining) - current.pct * currentWeight) / remaining;
  return Math.round(needed * 100) / 100;
}

/** Best and worst case if every pending item scores 100 / 0. */
export function projections(subject: Subject, marks: Mark[]) {
  const best = computeSubjectGrade(subject, marks, { treatPendingAsZero: false, treatMissingAsZero: false });
  const bestCase = computeSubjectGrade(
    subject,
    marks.map((m) => (m.status === 'pending' ? { ...m, status: 'graded' as const, score: m.max } : m)),
  );
  const worstCase = computeSubjectGrade(
    subject,
    marks.map((m) => (m.status === 'pending' || m.status === 'missing' ? { ...m, status: 'graded' as const, score: 0 } : m)),
  );
  return { current: best.pct, best: bestCase.pct, worst: worstCase.pct };
}

/** Per-assessment trend (oldest first) for sparklines and trend charts. */
export function gradeTrend(subject: Subject, marks: Mark[]) {
  return marks
    .filter((m) => m.subjectId === subject.id && m.status === 'graded')
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .map((m) => ({ date: m.date, pct: pctOf(m), title: m.title }));
}

export function normalizedWeights(categories: GradeCategory[]) {
  const total = categories.reduce((a, c) => a + c.weightPct, 0);
  if (total === 0) return categories.map(() => 0);
  return categories.map((c) => Math.round((c.weightPct / total) * 1000) / 10);
}
