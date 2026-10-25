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

  const today = format(new Date(), 'yyyy-MM-dd');
  const dueCards = useMemo(() => db.decks.flatMap((d) => d.cards.filter((c) => c.due <= today).map((c) => ({ deck: d, card: c }))), [db.decks, today]);
  const deck = db.decks.find((d) => d.id === activeDeck);
  const queue = deck ? deck.cards.filter((c) => c.due <= today) : [];
  const current = queue[index];

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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
