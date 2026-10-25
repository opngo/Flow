import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { marked } from 'marked';
import { motion } from 'framer-motion';
import { openContextMenu } from '../components/ContextMenu';
import { useFlow } from '../store';
import {
  Badge, Btn, Chip, EmptyState, Field, Icon, IconBtn, MenuBtn, Modal, Panel, SectionHead, Select,
  TextInput, Toggle,
} from '../components/ui';
import { download } from '../lib/platform';
import { cn, timeAgo } from '../lib/utils';

const MOODS = [
  { value: 1, icon: 'CloudRain', label: 'Rough' },
  { value: 2, icon: 'Cloud', label: 'Low' },
  { value: 3, icon: 'CloudSun', label: 'Okay' },
  { value: 4, icon: 'Sun', label: 'Good' },
  { value: 5, icon: 'Sparkles', label: 'Great' },
];

export default function Notes() {
  const [params, setParams] = useSearchParams();
  const db = useFlow((s) => s.db);
  const addNote = useFlow((s) => s.addNote);
  const updateNote = useFlow((s) => s.updateNote);
  const deleteNote = useFlow((s) => s.deleteNote);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('all');
  const [preview, setPreview] = useState(true);
  const [zen, setZen] = useState(false);
  // The note list lives on the right and folds away; the choice sticks.
  const [listOpen, setListOpen] = useState(() => {
    try { return localStorage.getItem('flow:notes:list') !== 'closed'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('flow:notes:list', listOpen ? 'open' : 'closed'); } catch { /* private mode */ }
  }, [listOpen]);
  const [tagInput, setTagInput] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const selectedId = params.get('open') ?? db.notes[0]?.id;
  const note = db.notes.find((n) => n.id === selectedId);

  useEffect(() => {
    if (params.get('new')) {
      const n = addNote({ title: 'Untitled', folder: 'Inbox' });
      setParams({ open: n.id }, { replace: true });
    }
  }, [params, setParams, addNote]);

  const folders = Array.from(new Set(['Inbox', 'School', 'Work', 'Journal', 'System', ...db.notes.map((n) => n.folder)]));
  const list = useMemo(() => db.notes
    .filter((n) => (folder === 'all' ? true : n.folder === folder))
    .filter((n) => `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt)), [db.notes, folder, query]);

  const words = note ? note.body.trim().split(/\s+/).filter(Boolean).length : 0;
  const readingTime = Math.max(1, Math.round(words / 220));
  const backlinks = note ? db.notes.filter((n) => n.id !== note.id && n.body.includes(`[[${note.title}]]`)) : [];
  const outgoing = note ? Array.from(note.body.matchAll(/\[\[([^\]]+)\]\]/g)).map((m) => m[1]) : [];

  const html = useMemo(() => (note ? marked.parse(note.body, { async: false, gfm: true, breaks: true }) as string : ''), [note]);

  /** Insert [[Title]] at the caret in the raw markdown editor. */
  const insertLink = (title: string) => {
    if (!note) return;
    const el = bodyRef.current;
    const snippet = `[[${title}]]`;
    if (!el) {
      updateNote(note.id, { body: `${note.body}${note.body.endsWith('\n') || !note.body ? '' : '\n'}${snippet}` });
      setPreview(false);
      return;
    }
    const start = el.selectionStart ?? note.body.length;
    const end = el.selectionEnd ?? start;
    const next = `${note.body.slice(0, start)}${snippet}${note.body.slice(end)}`;
    updateNote(note.id, { body: next });
    setPreview(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  return (
    <div className={cn('flex h-full min-h-0 gap-3', zen && 'fixed inset-0 z-[60] bg-surface p-6')}>
      {note ? (
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="mb-2 flex items-center gap-2">
            <TextInput value={note.title} onChange={(e) => updateNote(note.id, { title: e.target.value })}
              className="flex-1 bg-transparent text-[18px] font-semibold tracking-[-0.01em]" />
            <IconBtn icon={note.pinned ? 'Pin' : 'Bookmark'} label="Pin note" active={note.pinned} onClick={() => updateNote(note.id, { pinned: !note.pinned })} />
            <IconBtn icon={preview ? 'PenLine' : 'Eye'} label={preview ? 'Edit markdown' : 'Preview'} onClick={() => setPreview(!preview)} />
            <IconBtn icon="Link" label="Insert link to another note" onClick={() => setLinkOpen(true)} />
            <IconBtn icon={zen ? 'Minimize2' : 'Maximize2'} label="Distraction-free" onClick={() => setZen(!zen)} />
            <MenuBtn trigger={<IconBtn icon="MoreHorizontal" label="Note actions" />} items={[
              { label: 'Export markdown', icon: 'Download', onClick: () => download(`${note.title}.md`, note.body, 'text/markdown') },
              { label: 'Make it a task', icon: 'CheckSquare', onClick: () => useFlow.getState().addTodo({ title: note.title, notes: note.body, categoryId: 'cat-personal' }) },
              { label: 'Duplicate', icon: 'Copy', onClick: () => { const n = addNote({ ...note, title: `${note.title} copy` }); setParams({ open: n.id }); } },
              { label: 'Delete', icon: 'Trash2', danger: true, separator: true, onClick: () => { deleteNote(note.id); setParams({}); } },
            ]} />
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Select value={note.folder} onChange={(v) => updateNote(note.id, { folder: v })} options={folders.map((f) => ({ value: f, label: f }))} className="w-32" />
            {note.tags.map((t) => (
              <Chip key={t} onClick={() => updateNote(note.id, { tags: note.tags.filter((x) => x !== t) })}>#{t} <Icon name="X" size={9} /></Chip>
            ))}
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && tagInput.trim()) { updateNote(note.id, { tags: [...new Set([...note.tags, tagInput.trim()])] }); setTagInput(''); } }}
              placeholder="+ tag" className="w-20 bg-transparent text-[11.5px] text-muted placeholder:text-faint" />
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => updateNote(note.id, { journal: !note.journal })} className={cn('focusable chip', note.journal && 'text-accent')} style={note.journal ? { background: 'var(--accent-soft)' } : undefined}>
                <Icon name="Smile" size={10} /> Journal
              </button>
              {note.journal && MOODS.map((m) => (
                <button key={m.value} onClick={() => updateNote(note.id, { mood: m.value })} title={m.label}
                  className="focusable flex h-6 w-6 items-center justify-center rounded-[7px]"
                  style={{ background: note.mood === m.value ? 'var(--accent-soft)' : 'var(--surface-2)', color: note.mood === m.value ? 'var(--accent)' : 'var(--text-faint)' }}>
                  <Icon name={m.icon} size={12} />
                </button>
              ))}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[1fr_240px]">
            <div className="min-h-0 overflow-hidden rounded-[var(--radius)] bg-s1/60">
              {preview ? (
                <div className="markdown notebook h-full overflow-y-auto px-5 py-4"
                  dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <textarea
                  ref={bodyRef}
                  value={note.body}
                  onChange={(e) => updateNote(note.id, { body: e.target.value })}
                  className="notebook-editor h-full w-full resize-none bg-transparent px-5 py-4"
                  spellCheck={false}
                  placeholder="Write in markdown. [[Double brackets]] create links between notes."
                />
              )}
            </div>
            {!zen && (
              <div className="space-y-2 overflow-y-auto">
                <Panel className="p-3">
                  <div className="label mb-1.5">Stats</div>
                  <div className="space-y-1 text-[11.5px] text-muted">
                    <div className="flex justify-between"><span>Words</span><span className="num">{words}</span></div>
                    <div className="flex justify-between"><span>Characters</span><span className="num">{note.body.length}</span></div>
                    <div className="flex justify-between"><span>Reading time</span><span className="num">{readingTime} min</span></div>
                    <div className="flex justify-between"><span>Updated</span><span>{format(new Date(note.updatedAt), 'MMM d, h:mm a')}</span></div>
                  </div>
                </Panel>
                <Panel className="p-3">
                  <div className="label mb-1.5">Links</div>
                  {outgoing.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10.5px] text-faint">Outgoing</div>
                      {outgoing.map((o) => (
                        <button key={o} onClick={() => { const target = db.notes.find((n) => n.title.toLowerCase() === o.toLowerCase()); if (target) setParams({ open: target.id }); else { const n = addNote({ title: o }); setParams({ open: n.id }); } }}
                          className="focusable block w-full truncate rounded-[8px] px-1.5 py-1 text-left text-[11.5px] text-accent hover:bg-s1">
                          {o}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-[10.5px] text-faint">Backlinks</div>
                  {backlinks.map((b) => (
                    <button key={b.id} onClick={() => setParams({ open: b.id })} className="focusable block w-full truncate rounded-[8px] px-1.5 py-1 text-left text-[11.5px] hover:bg-s1">{b.title}</button>
                  ))}
                  {!backlinks.length && !outgoing.length && <div className="text-[11px] text-faint">No links yet. Type [[another note]] to connect.</div>}
                </Panel>
              </div>
            )}
          </div>
        </section>
      ) : (
        <EmptyState icon="NotebookPen" title="No note selected" body="Create a note to start writing." action={<Btn variant="primary" icon="Plus" onClick={() => addNote({})}>New note</Btn>} />
      )}

      {/* The list is a right rail: it can be folded to nothing and brought back
          from the button in the note header. */}
      {!zen && !listOpen && (
        <IconBtn icon="PanelRightOpen" label="Show the list" onClick={() => setListOpen(true)} className="order-2 shrink-0" />
      )}
      {!zen && listOpen && (
        <motion.aside
          initial={false}
          animate={{ width: listOpen ? 256 : 0, opacity: listOpen ? 1 : 0 }}
          transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
          className="order-2 flex shrink-0 flex-col gap-2 overflow-hidden"
          aria-label="Notes list"
        >
          <div className="flex w-64 items-center gap-2 pt-1">
            <div className="h1 flex-1">Notes</div>
            <IconBtn icon="Plus" label="New note" onClick={() => { const n = addNote({ title: 'Untitled', folder: folder === 'all' ? 'Inbox' : folder }); setParams({ open: n.id }, { replace: true }); }} />
            <IconBtn icon="PanelRightClose" label="Hide the list" onClick={() => setListOpen(false)} />
          </div>
          <div className="flex w-64 items-center gap-1.5 rounded-[10px] bg-s1 px-2.5">
            <Icon name="Search" size={13} className="text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" className="h-9 flex-1 bg-transparent text-[12.5px] placeholder:text-faint" />
          </div>
          <div className="flex w-64 flex-wrap gap-1">
            <button onClick={() => setFolder('all')} className={cn('focusable chip', folder === 'all' && 'text-accent')} style={folder === 'all' ? { background: 'var(--accent-soft)' } : undefined}>All</button>
            {folders.map((f) => (
              <button key={f} onClick={() => setFolder(f)} className={cn('focusable chip', folder === f && 'text-accent')} style={folder === f ? { background: 'var(--accent-soft)' } : undefined}>{f}</button>
            ))}
          </div>
          <div className="flex w-64 min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {list.map((n) => (
              <button key={n.id} onClick={() => setParams({ open: n.id }, { replace: true })}
                onContextMenu={(e) => openContextMenu(e, [
                  { label: 'Open', icon: 'Notebook', onClick: () => setParams({ open: n.id }, { replace: true }) },
                  { label: n.pinned ? 'Unpin' : 'Pin to the top', icon: 'Pin', onClick: () => updateNote(n.id, { pinned: !n.pinned }) },
                  { label: 'Duplicate', icon: 'Copy', onClick: () => { const copy = addNote({ ...n, title: `${n.title} copy` }); setParams({ open: copy.id }, { replace: true }); } },
                  { label: 'Delete', icon: 'Trash2', danger: true, separator: true, onClick: () => deleteNote(n.id) },
                ], n.title)}
                className={cn('focusable w-full rounded-[11px] px-2.5 py-2 text-left transition-colors', n.id === selectedId ? 'bg-s2' : 'hover:bg-s1')}>
                <div className="flex items-center gap-1.5">
                  {n.pinned && <Icon name="Pin" size={10} className="text-accent" />}
                  {n.journal && <Icon name="Sun" size={10} className="text-warning" />}
                  <span className="flex-1 truncate text-[12.5px]">{n.title}</span>
                </div>
                <div className="mt-0.5 truncate text-[10.5px] text-faint">{n.body.replace(/[#*`>\-]/g, '').slice(0, 60) || 'Empty note'}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                  <span>{n.folder}</span><span>·</span><span>{timeAgo(n.updatedAt)}</span>
                </div>
              </button>
            ))}
            {!list.length && <div className="py-8 text-center text-[12px] text-faint">No notes match.</div>}
          </div>
        </motion.aside>
      )}
      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Link to a note" subtitle="Inserts a [[wikilink]] at the cursor position">
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {db.notes.filter((n) => n.id !== note?.id).map((n) => (
            <button key={n.id} onClick={() => { insertLink(n.title); setLinkOpen(false); }}
              className="focusable flex w-full items-center gap-2 rounded-[10px] bg-s1 px-2.5 py-1.5 text-left text-[12px] hover:bg-s2">
              <Icon name={n.journal ? 'NotebookPen' : 'Notebook'} size={12} className="text-muted" />
              <span className="flex-1 truncate">{n.title}</span>
              <span className="text-[10px] text-faint">{n.folder}</span>
            </button>
          ))}
          {db.notes.length <= 1 && <div className="py-4 text-center text-[11.5px] text-faint">Create a second note to link it.</div>}
        </div>
      </Modal>
    </div>
  );
}
