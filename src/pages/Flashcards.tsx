import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useFlow } from '../store';
import { useUI } from '../ui';
import { openContextMenu } from '../components/ContextMenu';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Badge, Btn, Chip, EmptyState, Field, Icon, IconBtn, Modal, Panel, ProgressRing, SectionHead, Select,
  Stat, TextArea, TextInput,
  PlusBtn,
 } from '../components/ui';
import { parseCSV } from '../lib/utils';
import { cn } from '../lib/utils';

const RATINGS = [
  { q: 0 as const, label: 'Again', icon: 'RotateCcw', tone: 'var(--danger)', key: '1' },
  { q: 1 as const, label: 'Hard', icon: 'Cloud', tone: 'var(--warning)', key: '2' },
  { q: 2 as const, label: 'Good', icon: 'Check', tone: 'var(--accent)', key: '3' },
  { q: 3 as const, label: 'Easy', icon: 'Sparkles', tone: 'var(--success)', key: '4' },
];

export default function Flashcards() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'decks';
  const db = useFlow((s) => s.db);
  const addDeck = useFlow((s) => s.addDeck);
  const deleteDeck = useFlow((s) => s.deleteDeck);
  const addCard = useFlow((s) => s.addCard);
  const reviewCard = useFlow((s) => s.reviewCard);
  const toast = useUI((s) => s.toast);

  const [activeDeck, setActiveDeck] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(0);
  const [cardOpen, setCardOpen] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [deckName, setDeckName] = useState('');
  const [importOpen, setImportOpen] = useState(view === 'import');

  // Deep links (?view=import) and back/forward keep the importer in sync.
  useEffect(() => { setImportOpen(params.get('view') === 'import'); }, [params]);
  const [importText, setImportText] = useState('');
  const [importDeck, setImportDeck] = useState(db.decks[0]?.id ?? '');
  const [cardQuery, setCardQuery] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const dueCards = useMemo(() => db.decks.flatMap((d) => d.cards.filter((c) => c.due <= today).map((c) => ({ deck: d, card: c }))), [db.decks, today]);
  const deck = db.decks.find((d) => d.id === activeDeck);
  const queue = deck ? deck.cards.filter((c) => c.due <= today) : [];
  const current = queue[index];

  /* What the deck grid alone could not say: how the next week is shaped, which
     cards keep failing, and which day actually gets studied. */
  const forecast = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const key = format(d, 'yyyy-MM-dd');
      const count = db.decks.reduce((a, deck) => a + deck.cards.filter((c) => (i === 0 ? c.due <= key : c.due === key)).length, 0);
      return { key, count, day: format(d, 'EEEEE'), label: format(d, 'EEE d') };
    });
    const max = Math.max(1, ...days.map((d) => d.count));
    return { days, max };
  }, [db.decks]);

  const leeches = useMemo(
    () => db.decks.flatMap((d) => d.cards.filter((c) => c.lapses >= 3).map((c) => ({ deck: d, card: c })))
      .sort((a, b) => b.card.lapses - a.card.lapses).slice(0, 4),
    [db.decks],
  );

  const maturity = useMemo(() => {
    const cards = db.decks.flatMap((d) => d.cards);
    const fresh = cards.filter((c) => c.reps === 0).length;
    const young = cards.filter((c) => c.reps > 0 && c.interval < 21).length;
    const mature = cards.filter((c) => c.interval >= 21).length;
    return { fresh, young, mature, total: Math.max(1, cards.length) };
  }, [db.decks]);

  const studyStreak = useMemo(() => {
    /* Cards are the only dated evidence in a deck, so the streak counts the
       days on which a review moved a due date forward. */
    const days = new Set(db.decks.flatMap((d) => d.cards.map((c) => c.due)).filter(Boolean));
    let streak = 0;
    for (let i = 1; i <= 400; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (days.has(format(d, 'yyyy-MM-dd'))) streak += 1;
      else break;
    }
    return streak;
  }, [db.decks]);

  /* A flat, searchable view of every card. Decks were only browsable by
     opening one at a time, which made "where is that card?" impossible. */
  const allCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    return db.decks.flatMap((d) => d.cards.map((c) => ({ deck: d, card: c })))
      .filter(({ card, deck: d }) => !q || card.front.toLowerCase().includes(q) || card.back.toLowerCase().includes(q) || d.name.toLowerCase().includes(q))
      .sort((a, b) => (a.card.due < b.card.due ? -1 : a.card.due > b.card.due ? 1 : 0));
  }, [db.decks, cardQuery]);

  const startSession = (deckId?: string) => {
    const first = deckId ?? db.decks.find((d) => d.cards.some((c) => c.due <= today))?.id;
    if (!first) { toast({ title: 'Nothing is due today', tone: 'success' }); return; }
    setActiveDeck(first);
    setIndex(0);
    setRevealed(false);
  };

  const rate = (q: 0 | 1 | 2 | 3) => {
    if (!deck || !current) return;
    reviewCard(deck.id, current.id, q);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="h1">Flashcards</h1>
          <div className="mt-0.5 text-[12px] text-muted">{dueCards.length} cards due today across {db.decks.length} decks</div>
        </div>
        <div className="flex gap-2">
          {dueCards.length > 0 && (
            <Btn variant="primary" icon="Play" onClick={() => startSession()}>
              Study {dueCards.length} due
            </Btn>
          )}
          <Btn variant="soft" icon="Upload" onClick={() => setImportOpen(true)}>Import CSV</Btn>
          <PlusBtn label="New card" onClick={() => setCardOpen(true)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Due today" value={dueCards.length} icon="AlarmClock" tone={dueCards.length ? 'warning' : 'success'} />
        <Stat label="Cards" value={db.decks.reduce((a, d) => a + d.cards.length, 0)} icon="Layers" />
        <Stat label="Reviewed" value={db.decks.reduce((a, d) => a + d.cards.reduce((x, c) => x + c.reps, 0), 0)} sub="all time" icon="CheckCircle2" tone="accent" />
        <Stat label="Leeches" value={db.decks.reduce((a, d) => a + d.cards.filter((c) => c.lapses >= 3).length, 0)} sub="3+ lapses" icon="CircleAlert" />
      </div>

      {activeDeck && deck ? (
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Btn size="sm" variant="ghost" icon="ArrowLeft" onClick={() => { setActiveDeck(null); setIndex(0); setRevealed(false); }}>Decks</Btn>
            <span className="text-[13px] font-medium">{deck.name}</span>
            <span className="num ml-auto text-[11px] text-faint">{Math.min(index, queue.length)} / {queue.length} due</span>
          </div>

          {current ? (
            <div className="mt-4 flex flex-col items-center">
              {/* The card turns over in place: the face rotates away, the answer
                  rises behind it, and each card enters from the side the last
                  one left by, so a review session reads as movement rather than
                  as text swapping. */}
              <div className="w-full max-w-xl" style={{ perspective: 1200 }}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.button
                    key={current.id}
                    onClick={() => setRevealed((r) => !r)}
                    layout
                    initial={{ opacity: 0, x: 26, rotateY: 0 }}
                    animate={{ opacity: 1, x: 0, rotateY: revealed ? 0 : 0, scale: 1 }}
                    exit={{ opacity: 0, x: -26 }}
                    whileHover={{ scale: 1.004 }}
                    whileTap={{ scale: 0.995 }}
                    transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
                    className="focusable panel-raised relative flex min-h-[220px] w-full flex-col items-center justify-center p-6 text-center"
                  >
                    <motion.div
                      animate={revealed ? { rotateX: [0, -8, 0] } : { rotateX: 0 }}
                      transition={{ duration: 0.32, ease: 'easeOut' }}
                      className="w-full"
                      style={{ transformStyle: 'preserve-3d' }}
                    >
                      <motion.div animate={{ opacity: revealed ? 0.45 : 1 }} transition={{ duration: 0.2 }}>
                        <div className="label mb-2">Front</div>
                        <div className="text-[18px] leading-relaxed">{current.front}</div>
                      </motion.div>
                      <AnimatePresence initial={false}>
                        {revealed ? (
                          <motion.div
                            key="back"
                            initial={{ opacity: 0, height: 0, y: -6 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="mx-auto my-4 h-px w-16" style={{ background: 'color-mix(in srgb, var(--text-faint) 20%, transparent)' }} />
                            <div className="label mb-2">Back</div>
                            <div className="text-[15px] leading-relaxed text-muted">{current.back}</div>
                          </motion.div>
                        ) : (
                          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6 text-[11.5px] text-faint">
                            Click to reveal
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </motion.button>
                </AnimatePresence>
              </div>
              <motion.div
                className="mt-4 grid w-full max-w-xl grid-cols-4 gap-2"
                initial={false}
                animate={{ opacity: revealed ? 1 : 0.55, y: revealed ? 0 : 4 }}
                transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              >
                {RATINGS.map((r) => (
                  <motion.button key={r.q} disabled={!revealed} onClick={() => rate(r.q)}
                    whileHover={revealed ? { y: -2 } : undefined}
                    whileTap={revealed ? { scale: 0.97 } : undefined}
                    transition={{ duration: 0.14 }}
                    className={cn('focusable flex flex-col items-center gap-1 rounded-[12px] py-2.5 disabled:pointer-events-none disabled:opacity-40')}
                    style={{ background: 'var(--surface-2)', color: r.tone }}>
                    <Icon name={r.icon} size={15} />
                    <span className="text-[11px]">{r.label}</span>
                    <span className="num text-[9px] text-faint">{r.key}</span>
                  </motion.button>
                ))}
              </motion.div>
              <div className="mt-2 flex items-center gap-3 text-[10.5px] text-faint">
                <span>ease {current.ease.toFixed(2)}</span>
                <span>interval {current.interval}d</span>
                <span>{current.reps} reviews</span>
              </div>
            </div>
          ) : (
            <EmptyState icon="CircleCheck" title="Deck finished" body="Nothing else is due in this deck today. Come back tomorrow." />
          )}
        </Panel>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-3 md:grid-cols-2">
          {db.decks.map((d) => {
            const due = d.cards.filter((c) => c.due <= today).length;
            return (
              <Panel key={d.id} className="p-3.5"
                onContextMenu={(e) => openContextMenu(e, [
                  { label: 'Study this deck', icon: 'Play', onClick: () => { setActiveDeck(d.id); setIndex(0); setRevealed(false); } },
                  { label: 'Add a card', icon: 'Plus', onClick: () => setCardOpen(true) },
                  { label: 'Delete deck', icon: 'Trash2', danger: true, separator: true, onClick: () => deleteDeck(d.id) },
                ], d.name)}>
                <div className="flex items-start gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-s2"><Icon name="Layers" size={16} className="text-accent" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{d.name}</div>
                    <div className="text-[11px] text-faint">{d.cards.length} cards · {db.subjects.find((s) => s.id === d.subjectId)?.name ?? 'no subject'}</div>
                  </div>
                  <ProgressRing value={d.cards.length ? ((d.cards.length - due) / d.cards.length) * 100 : 0} size={36} stroke={4} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {d.cards.slice(0, 6).map((c) => (
                    <span key={c.id} className="h-1.5 w-1.5 rounded-full" style={{ background: c.due <= today ? 'var(--warning)' : 'var(--surface-3)' }} title={c.front} />
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <Btn size="sm" variant="primary" icon="Play" disabled={!due} onClick={() => { setActiveDeck(d.id); setIndex(0); setRevealed(false); }}>Study {due > 0 ? `(${due})` : ''}</Btn>
                  <Btn size="sm" variant="ghost" icon="Plus" onClick={() => { setActiveDeck(d.id); setCardOpen(true); }}>Card</Btn>
                  <IconBtn icon="Trash2" label="Delete deck" className="ml-auto" onClick={() => deleteDeck(d.id)} />
                </div>
              </Panel>
            );
          })}
          <Panel className="flex flex-col items-center justify-center gap-2 p-3.5">
            <TextInput value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder="New deck name" />
            <Btn variant="soft" icon="Plus" full onClick={() => { if (deckName.trim()) { addDeck(deckName.trim()); setDeckName(''); } }}>Create deck</Btn>
          </Panel>
          {/* Every card, searchable. The column below the decks used to be empty. */}
          <Panel className="p-3.5 md:col-span-2">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                <Icon name="Layers" size={13} className="text-faint" /> All cards
              </span>
              <span className="num text-[11px] text-faint" data-label="meta">{allCards.length} of {db.decks.reduce((a, d) => a + d.cards.length, 0)}</span>
              <div className="ml-auto w-full sm:w-56">
                <TextInput value={cardQuery} onChange={(e) => setCardQuery(e.target.value)} placeholder="Search front, back or deck" />
              </div>
            </div>
            <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {allCards.slice(0, 12).map(({ deck: d, card: c }) => {
                const due = c.due <= today;
                return (
                  <button
                    key={c.id}
                    onClick={() => { setActiveDeck(d.id); setIndex(0); setRevealed(false); }}
                    className="focusable flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-left hover:bg-s1"
                    data-rich-tip=""
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: due ? 'var(--warning)' : c.interval >= 21 ? 'var(--success)' : 'color-mix(in srgb, var(--accent) 55%, transparent)' }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px]">{c.front}</span>
                    <span className="hidden shrink-0 text-[10.5px] text-faint md:inline" data-label="meta">{d.name}</span>
                    <span className="num w-8 shrink-0 text-right text-[10.5px] text-faint">{c.interval}d</span>
                  </button>
                );
              })}
              {!allCards.length && (
                <div className="flex items-center gap-1.5 px-2 py-3 text-[11.5px] text-faint" data-label="meta">
                  <Icon name="Search" size={12} /> No card matches “{cardQuery}”
                </div>
              )}
            </div>
            {allCards.length > 12 && (
              <div className="mt-1.5 text-[10.5px] text-faint" data-label="meta">
                12 of {allCards.length} shown — search to narrow
              </div>
            )}
          </Panel>

        </div>

        {/* The review column: what is coming, what is stuck, what is known. */}
        <div className="space-y-3">
          <Panel className="p-3.5">
            <SectionHead title="Next seven days" subtitle={`${dueCards.length} due today`} />
            <div className="flex items-end gap-1.5">
              {forecast.days.map((d, i) => (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-1" data-tip={`${d.label} · ${d.count} due`}>
                  <span className="num text-[10px] text-faint">{d.count || ''}</span>
                  <span
                    className="w-full rounded-[4px]"
                    style={{
                      height: `${Math.max(4, (d.count / forecast.max) * 54)}px`,
                      background: d.count ? (i === 0 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 38%, transparent)') : 'color-mix(in srgb, var(--text-faint) 14%, transparent)',
                    }}
                  />
                  <span data-label="meta" className={cn('text-[9px]', i === 0 ? 'text-accent' : 'text-faint')}>{d.day}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
              <span data-label="meta">Study streak</span>
              <span className="num flex items-center gap-1 text-warning">
                <Icon name="Flame" size={11} /> {studyStreak}d
              </span>
            </div>
          </Panel>

          <Panel className="p-3.5">
            <SectionHead title="Maturity" subtitle="How well the collection is known" />
            <div className="flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
              <span style={{ width: `${(maturity.fresh / maturity.total) * 100}%`, background: 'color-mix(in srgb, var(--text-faint) 40%, transparent)' }} />
              <span style={{ width: `${(maturity.young / maturity.total) * 100}%`, background: 'color-mix(in srgb, var(--accent) 55%, transparent)' }} />
              <span style={{ width: `${(maturity.mature / maturity.total) * 100}%`, background: 'var(--success)' }} />
            </div>
            <div className="mt-2 space-y-1 text-[11.5px]">
              {[
                { label: 'New', value: maturity.fresh, color: 'color-mix(in srgb, var(--text-faint) 40%, transparent)' },
                { label: 'Learning', value: maturity.young, color: 'color-mix(in srgb, var(--accent) 55%, transparent)' },
                { label: 'Mature', value: maturity.mature, color: 'var(--success)' },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: row.color }} />
                  <span className="flex-1 text-muted" data-label="meta">{row.label}</span>
                  <span className="num">{row.value}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-3.5">
            <SectionHead title="Needs work" subtitle={leeches.length ? 'Lapsed three times or more' : 'Nothing is stuck'} />
            {leeches.length ? (
              <div className="space-y-1">
                {leeches.map(({ deck: d, card: c }) => (
                  <button
                    key={c.id}
                    onClick={() => { setActiveDeck(d.id); setIndex(0); setRevealed(false); }}
                    className="focusable w-full rounded-[9px] px-2 py-1.5 text-left hover:bg-s1"
                  >
                    <div className="truncate text-[12px]">{c.front}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
                      <span className="truncate">{d.name}</span>
                      <span className="num ml-auto shrink-0 text-warning">{c.lapses} lapses</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-[9px] bg-s1 px-2 py-2 text-[11.5px] text-muted" data-label="meta">
                <Icon name="CircleCheck" size={12} className="text-success" /> Every card is holding
              </div>
            )}
          </Panel>
        </div>
        </div>
      )}

      <Modal open={cardOpen} onClose={() => setCardOpen(false)} title="New card" subtitle={deck ? `Adding to ${deck.name}` : 'Choose a deck'}
        footer={<><Btn variant="ghost" onClick={() => setCardOpen(false)}>Cancel</Btn>
          <Btn variant="primary" icon="Check" onClick={() => {
            const target = deck ?? db.decks[0];
            if (!target) { toast({ title: 'Create a deck first', tone: 'warning' }); return; }
            if (!front.trim()) return;
            addCard(target.id, front.trim(), back.trim());
            setFront(''); setBack('');
            setCardOpen(false);
          }}>Add card</Btn></>}>
        <div className="space-y-3">
          <Field label="Front"><TextArea rows={2} value={front} onChange={(e) => setFront(e.target.value)} placeholder="Question or prompt" /></Field>
          <Field label="Back"><TextArea rows={3} value={back} onChange={(e) => setBack(e.target.value)} placeholder="Answer" /></Field>
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import deck" subtitle="One card per line: front, back"
        footer={<><Btn variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Btn>
          <Btn variant="primary" icon="Upload" onClick={() => {
            const rows = parseCSV(importText);
            const target = db.decks.find((d) => d.id === importDeck);
            if (!target) return;
            rows.forEach((r) => { if (r[0]) addCard(target.id, r[0], r[1] ?? ''); });
            toast({ title: `Imported ${rows.length} cards`, tone: 'success' });
            setImportText('');
            setImportOpen(false);
          }}>Import</Btn></>}>
        <div className="space-y-3">
          <Field label="Deck">
            <Select value={importDeck} onChange={setImportDeck} options={db.decks.map((d) => ({ value: d.id, label: d.name }))} />
          </Field>
          <Field label="CSV">
            <TextArea rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'What is a mole?,6.022e23 particles\nIonic bond?,Electrostatic attraction'} />
          </Field>
          {db.decks.length === 0 && <div className="text-[11.5px] text-warning">Create a deck first.</div>}
        </div>
      </Modal>
    </div>
  );
}
