import React, { useEffect, useState } from 'react';
import type { Config, Decoded, Notify, Role, Room, Status } from '../../types';
import { api } from '../../api';
import { ROLES, ROLE_LABEL, inputClass, muted, primaryButton, secondaryButton, useBusy, warningBox } from '../../ui';
import Icon from '../ui/Icon';
import Sheet from '../ui/Sheet';

interface Capture {
  raw_data: string;
  same_as_previous: boolean;
  decoded: Decoded;
}

type RecordingState = Status['recording'];

const secondsLeft = (expiresAt: string | null) =>
  expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0;

interface Props {
  config: Config;
  room: Room;
  notify: Notify;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const RecordSheet: React.FC<Props> = ({ config, room, notify, onClose, onSaved }) => {
  const { busy, run } = useBusy(notify);
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role | ''>('');

  const inRoom = config.commands.filter(c => c.room_id === room.id);
  const replacing = role ? inRoom.find(c => c.role === role) : inRoom.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
  const detected = capture?.decoded.light_channel ?? null;
  const mismatch = detected !== null && detected !== room.channel;

  useEffect(() => {
    if (!recording?.active) return;
    const tick = () => {
      const left = secondsLeft(recording.expires_at);
      setRemaining(left);
      if (left === 0) {
        setRecording(null);
        notify('Recording timed out; nothing was captured', 'error');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [recording, notify]);

  const start = () => run('start', async () => {
    setCapture(null);
    setRecording(await api<RecordingState>('POST', '/record/start'));
  });

  const stop = () => run('stop', async () => {
    try {
      const c = await api<Capture>('POST', '/record/stop');
      setCapture(c);
      const fn = c.decoded.function;
      setRole(fn ?? '');
      const existing = fn && inRoom.find(x => x.role === fn);
      setName(existing ? existing.name : fn ? ROLE_LABEL[fn] : '');
    } finally {
      setRecording(null);
    }
  });

  const test = () => run('test', async () => {
    if (!capture) return;
    await api('POST', '/ir/send', { raw_data: capture.raw_data });
    notify('Test signal sent');
  });

  const save = () => run('save', async () => {
    if (!capture) return;
    // Replacing keeps the button's id, so routines using it get the new code.
    await api('POST', '/commands', {
      room_id: room.id,
      name: replacing ? replacing.name : name.trim(),
      raw_data: capture.raw_data,
      role: role || null,
      replace: !!replacing,
      allow_channel_mismatch: mismatch,
    });
    notify(replacing ? `Replaced ${replacing.name}` : `Added ${name.trim()}`);
    await onSaved();
    onClose();
  });

  const close = () => {
    if (recording?.active) api('POST', '/record/stop').catch(() => {});
    onClose();
  };

  return (
    <Sheet
      title={`Add button · ${room.name}`}
      onClose={close}
      footer={capture && (
        <div className="flex gap-3">
          <button onClick={test} disabled={busy !== null} className={`${secondaryButton} flex-1`}>{busy === 'test' ? 'Sending…' : 'Test'}</button>
          <button onClick={save} disabled={busy !== null || (!replacing && !name.trim())} className={`${primaryButton} flex-1`}>
            {busy === 'save' ? 'Saving…' : replacing ? 'Replace' : 'Save'}
          </button>
        </div>
      )}
    >
      <ol className={`text-sm ${muted} list-decimal pl-5 space-y-1`}>
        <li>Set the remote to <strong className="text-gray-900 dark:text-gray-100">CH{room.channel}</strong>.</li>
        <li>Press Record, point the remote at the receiver and press the button once.</li>
        <li>Press Stop, check the result, test it, and save.</li>
      </ol>

      {!recording?.active ? (
        <button onClick={start} disabled={busy !== null} className={`${capture ? secondaryButton : primaryButton} w-full flex items-center justify-center gap-2`}>
          <Icon name="record" /> {busy === 'start' ? 'Starting…' : capture ? 'Record again' : 'Record'}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/50 p-3 rounded-xl border border-red-100 dark:border-red-900 text-red-700 dark:text-red-300 text-sm font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            Listening… press the button on the remote ({remaining}s)
          </div>
          <button onClick={stop} disabled={busy !== null} className={`${primaryButton} w-full`}>{busy === 'stop' ? 'Reading…' : 'Stop'}</button>
        </div>
      )}

      {capture && (
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-950/50 border border-gray-200 dark:border-gray-800 p-3 text-sm space-y-1">
            {capture.decoded.function
              ? <div className="font-medium text-gray-900 dark:text-gray-100">Recognised: {ROLE_LABEL[capture.decoded.function]} (CH{detected})</div>
              : <div className="font-medium text-gray-900 dark:text-gray-100">Unrecognised button — it will be sent exactly as recorded.</div>}
            {capture.decoded.frames.length > 0 && <div className={`font-mono text-xs ${muted}`}>{capture.decoded.frames.join(' / ')}</div>}
          </div>
          {mismatch && (
            <div className={warningBox}>
              This was recorded on CH{detected}, but {room.name} uses CH{room.channel}. Check the remote's channel and record again,
              or save anyway to control whichever light listens on CH{detected}.
            </div>
          )}
          {capture.same_as_previous && (
            <div className={warningBox}>Identical to the previous capture. If you pressed a different button, it may not have been received.</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className={`text-xs font-semibold ${muted}`}>
              Function
              <select value={role} onChange={e => setRole(e.target.value as Role | '')} className={`${inputClass} mt-1`}>
                <option value="">Custom button</option>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <label className={`text-xs font-semibold ${muted}`}>
              Name
              <input value={replacing ? replacing.name : name} disabled={!!replacing} onChange={e => setName(e.target.value)} maxLength={60}
                     placeholder="e.g. Night light" className={`${inputClass} mt-1 disabled:opacity-60`} />
            </label>
          </div>
          {replacing && <p className={`text-xs ${muted}`}>This replaces the current “{replacing.name}” button; routines using it will send the new code.</p>}
        </div>
      )}
    </Sheet>
  );
};

export default RecordSheet;
