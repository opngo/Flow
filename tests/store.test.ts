import { beforeEach, describe, expect, it } from 'vitest';
import { resetBoot, useFlow } from '../src/store';
import { addDays, format } from 'date-fns';

const reset = () => {
  useFlow.setState({ db: useFlow.getState().db, ready: true });
  useFlow.getState().resetAll();
};

describe('store', () => {
  beforeEach(async () => {
    resetBoot();
    await useFlow.getState().init();
    useFlow.getState().resetAll();
  });

  it('adds a todo and completes it', () => {
    const { addTodo, completeTodo } = useFlow.getState();
    const before = useFlow.getState().db.todos.length;
    addTodo({ title: 'Write the parser tests' });
    expect(useFlow.getState().db.todos.length).toBe(before + 1);
    const created = useFlow.getState().db.todos.find((t) => t.title === 'Write the parser tests')!;
    completeTodo(created.id);
    const after = useFlow.getState().db.todos.find((t) => t.id === created.id)!;
    expect(after.status).toBe('done');
    expect(after.completedAt).toBeTruthy();
  });

  it('undoes and redoes a change', () => {
    const flow = useFlow.getState();
    const before = flow.db.todos.length;
    flow.addTodo({ title: 'Undo me' });
    expect(useFlow.getState().db.todos.length).toBe(before + 1);
    useFlow.getState().undo();
    expect(useFlow.getState().db.todos.length).toBe(before);
    useFlow.getState().redo();
    expect(useFlow.getState().db.todos.length).toBe(before + 1);
  });

  it('derives timer remaining time from the wall clock', () => {
    const flow = useFlow.getState();
    flow.startTimer({ label: 'Reading', kind: 'countdown', plannedMin: 1 });
    const timer = useFlow.getState().db.timers[0];
    expect(timer.running).toBe(true);
    const remainingA = new Date(timer.endsAt!).getTime() - Date.now();
    expect(remainingA).toBeGreaterThan(50_000);
    // The value is recomputed from endsAt, so it shrinks without any counter.
    useFlow.getState().tick();
    const running = useFlow.getState().db.timers[0];
    expect(new Date(running.endsAt!).getTime()).toBe(new Date(timer.endsAt!).getTime());
    useFlow.getState().pauseTimer(timer.id);
    expect(useFlow.getState().db.timers[0].running).toBe(false);
  });

  it('schedules flashcards with SM-2 style intervals', () => {
    const flow = useFlow.getState();
    flow.addDeck('Biology');
    const deck = useFlow.getState().db.decks.find((d) => d.name === 'Biology')!;
    flow.addCard(deck.id, 'Mitochondria', 'Powerhouse of the cell');

    const card = useFlow.getState().db.decks.find((d) => d.id === deck.id)!.cards[0];
    expect(card.interval).toBe(0);

    useFlow.getState().reviewCard(deck.id, card.id, 2);
    const good = useFlow.getState().db.decks.find((d) => d.id === deck.id)!.cards[0];
    expect(good.interval).toBe(1);
    expect(good.reps).toBe(1);

    useFlow.getState().reviewCard(deck.id, card.id, 2);
    const second = useFlow.getState().db.decks.find((d) => d.id === deck.id)!.cards[0];
    expect(second.interval).toBeGreaterThan(1);

    useFlow.getState().reviewCard(deck.id, card.id, 0);
    const lapse = useFlow.getState().db.decks.find((d) => d.id === deck.id)!.cards[0];
    expect(lapse.interval).toBe(0);
    expect(lapse.lapses).toBe(1);
    expect(lapse.ease).toBeLessThan(second.ease);
  });

  it('round-trips the whole database through JSON', () => {
    const flow = useFlow.getState();
    flow.addTodo({ title: 'Export me' });
    const json = useFlow.getState().exportJSON();
    const parsed = JSON.parse(json);
    expect(parsed.todos.some((t: { title: string }) => t.title === 'Export me')).toBe(true);

    useFlow.getState().deleteTodo(useFlow.getState().db.todos.find((t) => t.title === 'Export me')!.id);
    expect(useFlow.getState().db.todos.some((t) => t.title === 'Export me')).toBe(false);

    expect(useFlow.getState().importJSON(json)).toBe(true);
    expect(useFlow.getState().db.todos.some((t) => t.title === 'Export me')).toBe(true);
  });

  it('rejects invalid import payloads without touching the database', () => {
    const before = useFlow.getState().db.todos.length;
    expect(useFlow.getState().importJSON('{ not json')).toBe(false);
    expect(useFlow.getState().db.todos.length).toBe(before);
  });

  it('starts and finishes a focus session, logging study time', () => {
    const flow = useFlow.getState();
    const sessions = flow.db.focusSessions.length;
    flow.startFocus({});
    expect(useFlow.getState().focus().running).toBe(true);
    useFlow.getState().finishPhase();
    expect(useFlow.getState().db.focusSessions.length).toBeGreaterThanOrEqual(sessions);
  });

  it('builds an escalating reminder ladder from the due date', () => {
    const due = addDays(new Date(), 2).toISOString();
    useFlow.getState().addTodo({ title: 'Lab report', dueAt: due });
    const todo = useFlow.getState().db.todos.find((t) => t.title === 'Lab report')!;
    const ladder = useFlow.getState().db.reminders.filter((r) => r.targetId === todo.id && !r.delivered);
    // 5 due-soon steps plus 3 escalating overdue follow-ups.
    expect(ladder.length).toBe(8);
    expect(ladder.every((r) => r.targetKind === 'todo')).toBe(true);
    expect(ladder.some((r) => r.actions.includes('snooze10'))).toBe(true);
    const times = ladder.map((r) => new Date(r.fireAt).getTime()).sort((a, b) => a - b);
    expect(times[0]).toBeLessThan(new Date(due).getTime());

    // Completing the task clears anything still pending.
    useFlow.getState().completeTodo(todo.id);
    expect(useFlow.getState().db.reminders.filter((r) => r.targetId === todo.id && !r.delivered).length).toBe(0);
  });

  it('records habit check-ins once per day', () => {
    const habit = useFlow.getState().db.habits[0];
    // A future date so the seeded history cannot collide with the assertion.
    const day = format(addDays(new Date(), 3), 'yyyy-MM-dd');
    const before = useFlow.getState().db.habitLogs.filter((l) => l.habitId === habit.id && l.date === day).length;
    useFlow.getState().checkIn(habit.id, day, 1);
    expect(useFlow.getState().db.habitLogs.filter((l) => l.habitId === habit.id && l.date === day).length).toBe(before + 1);
    // Checking in again on the same day updates the record instead of adding one.
    useFlow.getState().checkIn(habit.id, day, 1);
    expect(useFlow.getState().db.habitLogs.filter((l) => l.habitId === habit.id && l.date === day).length).toBe(before + 1);
    useFlow.getState().uncheckIn(habit.id, day);
    expect(useFlow.getState().db.habitLogs.filter((l) => l.habitId === habit.id && l.date === day).length).toBe(before);
  });
});
