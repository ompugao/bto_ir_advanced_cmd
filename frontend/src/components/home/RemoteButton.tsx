import React, { useEffect, useRef, useState } from 'react';
import type { Command, Notify } from '../../types';
import { api, errorMessage } from '../../api';
import { label, roleIcon } from '../../ui';
import Icon from '../ui/Icon';

const HOLD_DELAY_MS = 400; // press this long before repeating starts
const REPEAT_GAP_MS = 100; // pause between repeated sends (each send itself takes ~100 ms)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Feedback = 'idle' | 'sending' | 'ok' | 'error';

/**
 * One remote button. Tapping sends once; for repeatable buttons (brighter/darker/white/warmer)
 * holding keeps sending until released, like the physical remote.
 */
const RemoteButton: React.FC<{ cmd: Command; notify: Notify; repeatable?: boolean }> = ({ cmd, notify, repeatable }) => {
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [count, setCount] = useState(0);
  const holding = useRef(false);
  const running = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => {
    holding.current = false;
    clearTimeout(resetTimer.current);
  }, []);

  const sendOnce = async () => {
    try {
      await api('POST', `/commands/${cmd.id}/send`);
      setCount(c => c + 1);
      return true;
    } catch (e) {
      notify(`${label(cmd)}: ${errorMessage(e)}`, 'error');
      return false;
    }
  };

  const press = async () => {
    if (running.current) return;
    running.current = true;
    holding.current = true;
    clearTimeout(resetTimer.current);
    setCount(0);
    setFeedback('sending');
    let ok = await sendOnce();
    if (ok && repeatable) {
      await sleep(HOLD_DELAY_MS);
      while (ok && holding.current) {
        ok = await sendOnce();
        await sleep(REPEAT_GAP_MS);
      }
    }
    running.current = false;
    setFeedback(ok ? 'ok' : 'error');
    resetTimer.current = setTimeout(() => setFeedback('idle'), 1500);
  };

  const release = () => { holding.current = false; };

  const tone = {
    idle: 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800',
    sending: 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 scale-[0.97]',
    ok: 'bg-green-50 dark:bg-green-950/60 border-green-300 dark:border-green-800 text-green-700 dark:text-green-300',
    error: 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300',
  }[feedback];

  return (
    <button
      type="button"
      onPointerDown={e => { if (e.button === 0) { e.currentTarget.setPointerCapture(e.pointerId); press(); } }}
      onPointerUp={release}
      onPointerCancel={release}
      onClick={e => { if (e.detail === 0) press().then(release); /* keyboard activation */ }}
      onContextMenu={e => e.preventDefault()}
      className={`relative flex items-center justify-center gap-2 min-h-[3.25rem] px-3 rounded-xl border font-medium select-none touch-manipulation transition-all ${tone}`}
      title={repeatable ? 'Hold to repeat' : undefined}
    >
      <Icon name={feedback === 'ok' ? 'check' : feedback === 'error' ? 'alert' : roleIcon(cmd.role)} />
      <span className="truncate">{label(cmd)}</span>
      {count > 1 && feedback !== 'idle' && <span className="text-xs font-semibold opacity-70 tabular-nums">×{count}</span>}
    </button>
  );
};

export default RemoteButton;
