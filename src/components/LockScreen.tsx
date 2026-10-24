import { useState } from 'react';
import { useFlow } from '../store';
import { Btn, Icon } from './ui';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const pin = useFlow((s) => s.db.settings.behavior.appLock.pin);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (entry === pin) onUnlock();
    else { setError(true); setEntry(''); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center" style={{ background: 'var(--surface)' }}>
      <div className="panel-raised w-full max-w-xs p-6 text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] bg-s2 text-muted">
          <Icon name="Lock" size={18} />
        </span>
        <div className="text-[14px] font-medium">Flow is locked</div>
        <p className="mt-1 text-[12px] text-muted">Enter your PIN to continue.</p>
        <input
          autoFocus
          type="password"
          value={entry}
          onChange={(e) => { setEntry(e.target.value); setError(false); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="input num mt-4 text-center text-[18px] tracking-[0.4em]"
          placeholder="••••"
          aria-label="PIN"
        />
        {error && <div className="mt-2 text-[11.5px] text-danger">That PIN does not match.</div>}
        <Btn variant="primary" full className="mt-3" onClick={submit}>Unlock</Btn>
      </div>
    </div>
  );
}
