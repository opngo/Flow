import { describe, expect, it } from 'vitest';
import {
  activeToken,
  applySuggestion,
  cleanLine,
  COMMAND_KEYS,
  parseCommands,
  readDate,
  readWhen,
  suggestionsFor,
  type CommandContext,
} from '../src/lib/commands';

const ctx: CommandContext = { categories: [], subjects: [], habits: [] };

describe('braced commands', () => {
  it('pulls every token out of the line and leaves the words behind', () => {
    const parsed = parseCommands('{type:habit} Read poetry {repeat:daily} {target:25}', ctx);
    expect(parsed.target).toBe('habit');
    expect(parsed.text).toBe('Read poetry');
    expect(parsed.name).toBe('Read poetry');
    expect(parsed.fields.repeat).toBe('daily');
    expect(parsed.fields.target).toBe('25');
    expect(parsed.tokens.map((t) => t.key)).toEqual(['type', 'repeat', 'target']);
  });

  it('keeps values that contain spaces', () => {
    const parsed = parseCommands('{name:Chemistry unit test} {place:Room B 214}', ctx);
    expect(parsed.fields.name).toBe('Chemistry unit test');
    expect(parsed.fields.place).toBe('Room B 214');
    // Nothing left in the line, so the name stands in for it.
    expect(parsed.text).toBe('Chemistry unit test');
  });

  it('drops placeholders that were never filled in', () => {
    const parsed = parseCommands('{name:} {when:}Finish the lab report', ctx);
    expect(parsed.text).toBe('Finish the lab report');
    expect(parsed.fields.name).toBeUndefined();
  });

  it('reads date and clock from one `when` value', () => {
    const from = new Date('2026-10-24T10:00:00');
    const parsed = parseCommands('{when:tomorrow 1830} Call the bank', ctx, from);
    expect(parsed.date).toBe('2026-10-25');
    expect(parsed.time).toBe('18:30');
    expect(parsed.dueAt).toBe(new Date('2026-10-25T18:30:00').toISOString());
  });

  it('defaults to a task and keeps loose text as the title', () => {
    const parsed = parseCommands('Buy milk {priority:high}', ctx);
    expect(parsed.target).toBe('task');
    expect(parsed.name).toBe('Buy milk');
  });
});

describe('date reading', () => {
  const from = new Date('2026-10-24T09:00:00');

  it('understands the words people type', () => {
    expect(readDate('today', from)).toBe('2026-10-24');
    expect(readDate('tomorrow', from)).toBe('2026-10-25');
    expect(readDate('in 3 days', from)).toBe('2026-10-27');
    expect(readDate('next week', from)).toBe('2026-10-31');
  });

  it('understands a weekday, ISO and a written month', () => {
    expect(readDate('friday', from)).toBe('2026-10-30');
    expect(readDate('2026-12-01', from)).toBe('2026-12-01');
    expect(readDate('28 oct', from)).toBe('2026-10-28');
    expect(readDate('10/28', from)).toBe('2026-10-28');
  });

  it('splits `when` into a date and a military time', () => {
    expect(readWhen('tomorrow 1830', from)).toEqual({ date: '2026-10-25', time: '18:30' });
    expect(readWhen('friday 6pm', from)).toEqual({ date: '2026-10-30', time: '18:00' });
    expect(readWhen('tomorrow', from)).toEqual({ date: '2026-10-25' });
  });
});

describe('suggestions', () => {
  it('lists the keys while the key is still being typed', () => {
    const list = suggestionsFor('{', ctx);
    expect(list.length).toBe(COMMAND_KEYS.length);
    const narrow = suggestionsFor('{pri', ctx);
    expect(narrow.map((s) => s.label)).toEqual(['priority']);
  });

  it('lists the values a key accepts, each labelled with where it lands', () => {
    const list = suggestionsFor('{priority:', ctx);
    expect(list.map((s) => s.label)).toEqual(['low', 'medium', 'high', 'urgent']);
    expect(list[0].hint).toBe('the priority flag');
  });

  it('closes the panel for a key with no fixed values', () => {
    expect(suggestionsFor('{name:', ctx)).toEqual([]);
  });

  it('ignores a token the caret has already left', () => {
    const text = '{when:tomorrow} call';
    expect(activeToken(text, text.length)).toBeNull();
    expect(activeToken(text, 7)?.key).toBe('when');
    expect(suggestionsFor(text, ctx, text.length)).toEqual([]);
  });

  it('opens a picked key with the caret inside its braces', () => {
    const next = applySuggestion('Draft essay ', '{when:}', 'Draft essay '.length);
    expect(next.text).toBe('Draft essay {when:}');
    expect(next.caret).toBe(next.text.length - 1);
  });

  it('replaces the unfinished token with a full value and moves past it', () => {
    const next = applySuggestion('{priority:hi', '{priority:high}', '{priority:hi'.length);
    expect(next.text).toBe('{priority:high}');
    expect(next.caret).toBe(next.text.length);
  });

  it('never leaves a brace in the text, even on a line made only of commands', () => {
    /* The bug this guards: a capture of `{type:task}{when:tomorrow }` saved
       its own syntax as the title, and every reminder repeated it back. */
    const parsed = parseCommands('{type:task}{when:tomorrow }{repeat:daily}{priority:low}{subject:History}', ctx);
    expect(parsed.fields.subject).toBe('History');
    expect(parsed.text).toBe('');
    expect(parsed.text).not.toContain('{');
  });

  it('drops a token whose key does not exist instead of passing it through', () => {
    const parsed = parseCommands('Call the bank {wen:tomorrow}', ctx);
    expect(parsed.text).toBe('Call the bank');
    expect(parsed.text).not.toMatch(/[{}]/);
  });

  it('cleans a half-typed token too', () => {
    expect(cleanLine('{type:task')).toBe('');
    expect(cleanLine('Read poetry {repeat:dai')).toBe('Read poetry');
    expect(cleanLine('Plans {when:tomorrow} and notes')).toBe('Plans and notes');
  });
});
