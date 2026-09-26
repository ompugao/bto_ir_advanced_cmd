import React, { useEffect, useState } from 'react';
import type { Decoded, PageProps, Status } from '../types';
import { api, ApiError } from '../api';
import { channelStyle, inputClass, primaryButton, secondaryButton, useBusy } from '../ui';

interface Capture {
  raw_data: string;
  same_as_previous: boolean;
  decoded: Decoded;
}

type RecordingState = Status['recording'];

const secondsLeft = (expiresAt: string | null) =>
  expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0;

const RecordComponent: React.FC<PageProps> = ({ config, refresh, notify }) => {
  const { busy, run } = useBusy(notify);
  const [roomId, setRoomId] = useState(config.rooms[0]?.id ?? '');
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [name, setName] = useState('');

  const room = config.rooms.find(r => r.id === roomId);
  const detected = capture?.decoded.light_channel ?? null;
  const mismatch = room && detected !== null && detected !== room.channel;

  // Pick up a recording that is already running (e.g. started in another tab).
  useEffect(() => {
    api<RecordingState>('GET', '/record').then(s => s.active && setRecording(s)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!recording?.active) return;
    const tick = () => {
      const left = secondsLeft(recording.expires_at);
      setRemaining(left);
      if (left === 0) {
        setRecording(null);
        notify('Recording timed out', 'error');
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
      setCapture(await api<Capture>('POST', '/record/stop'));
    } finally {
      setRecording(null);
    }
  });

  const testSend = () => run('test', async () => {
    if (!capture) return;
    await api('POST', '/ir/send', { raw_data: capture.raw_data });
    notify('Test signal sent');
  });

  const save = () => run('save', async () => {
    if (!capture || !room || !name.trim()) return;
    const body = { room_id: room.id, name: name.trim(), raw_data: capture.raw_data, allow_channel_mismatch: !!mismatch, replace: false };
    try {
      await api('POST', '/commands', body);
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'exists') throw e;
      if (!window.confirm(`${e.message}. Replace it? Timers using it will send the new code.`)) return;
      await api('POST', '/commands', { ...body, replace: true });
    }
    notify(`Saved ${name.trim()} for ${room.name}`);
    setCapture(null);
    setName('');
    await refresh();
  });

  if (config.rooms.length === 0) {
    return <p className="glass-panel rounded-2xl p-10 text-center text-gray-500 text-sm">Add a room in the Rooms tab before recording.</p>;
  }

  const isRecording = !!recording?.active;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">Record IR Command</h2>

      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">1. Room</label>
          <div className="flex flex-wrap gap-2">
            {config.rooms.map(r => (
              <button
                key={r.id}
                onClick={() => setRoomId(r.id)}
                className={`px-3 py-2 rounded-lg font-medium text-sm border transition-colors ${
                  r.id === roomId ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r.name} <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${channelStyle(r.channel)}`}>CH{r.channel}</span>
              </button>
            ))}
          </div>
          {room && <p className="text-xs text-gray-500 mt-2">Set the remote to CH{room.channel} before pressing the button.</p>}
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">2. Capture</label>
          {!isRecording ? (
            <button onClick={start} disabled={busy !== null} className={`${primaryButton} w-full`}>
              {busy === 'start' ? 'Starting…' : capture ? 'Record again' : 'Start Recording'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center space-x-3 bg-red-50 p-3 rounded-xl border border-red-100">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                <span className="text-red-600 font-medium text-sm">Point the remote at the receiver and press the button once… ({remaining}s)</span>
              </div>
              <button onClick={stop} disabled={busy !== null} className={`${secondaryButton} w-full`}>
                {busy === 'stop' ? 'Reading…' : 'Stop & Read'}
              </button>
            </div>
          )}
        </div>

        {capture && room && (
          <div className="space-y-4 border-t border-gray-100 pt-6">
            <label className="text-xs font-semibold text-gray-600 block">3. Check and save</label>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm space-y-1">
              {capture.decoded.frames.length > 0 ? (
                <div>Decoded: <span className="font-mono">{capture.decoded.frames.join(' / ')}</span></div>
              ) : (
                <div className="text-gray-500">Unknown format ({capture.raw_data.split(',').length} bytes); it can still be sent as recorded.</div>
              )}
              {detected !== null && <div>Code is for <strong>CH{detected}</strong></div>}
            </div>
            {mismatch && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
                This code is for CH{detected}, but {room.name} is on CH{room.channel}. Was the remote set to the wrong channel?
                Saving anyway will control whichever light listens on CH{detected}.
              </div>
            )}
            {capture.same_as_previous && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
                This is identical to the previous capture. If you pressed a different button, it may not have been received; record again.
              </div>
            )}
            <button onClick={testSend} disabled={busy !== null} className={`${secondaryButton} w-full`}>
              {busy === 'test' ? 'Sending…' : 'Test: send this signal'}
            </button>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Button name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. DARKEN" className={inputClass} maxLength={60} />
            </div>
            <button onClick={save} disabled={busy !== null || !name.trim()} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {busy === 'save' ? 'Saving…' : `Save to ${room.name}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordComponent;
