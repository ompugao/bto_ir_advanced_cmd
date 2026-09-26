import React, { useState } from 'react';
import type { PageProps, Timer, TimerStep } from '../types';
import { api } from '../api';
import { commandLabel, formatDateTime, inputClass, primaryButton, secondaryButton, useBusy } from '../ui';

const newStep = (): TimerStep => ({ command_id: '', repeats: 1, interval_ms: 100, delay_after_ms: 0 });
const initialTimer = (): Timer => ({ name: '', time: '07:00', enabled: true, steps: [newStep()] });

const numberInput = 'w-full bg-white border border-gray-300 text-gray-900 px-2 py-1.5 rounded-md focus:ring-2 focus:ring-blue-500/50 outline-none text-sm text-center';

const Timers: React.FC<PageProps> = ({ config, status, refresh, notify }) => {
  const { busy, run } = useBusy(notify);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Timer>(initialTimer);

  const sortedTimers = [...config.timers].sort((a, b) => a.time.localeCompare(b.time));
  const commandExists = (id: string) => config.commands.some(c => c.id === id);

  const updateStep = (index: number, patch: Partial<TimerStep>) =>
    setDraft(d => ({ ...d, steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  const removeStep = (index: number) => setDraft(d => ({ ...d, steps: d.steps.filter((_, i) => i !== index) }));
  const moveStep = (index: number, delta: number) => setDraft(d => {
    const steps = [...d.steps];
    const [s] = steps.splice(index, 1);
    steps.splice(index + delta, 0, s);
    return { ...d, steps };
  });

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(initialTimer());
  };

  const editTimer = (timer: Timer) => {
    setEditingId(timer.id ?? null);
    setDraft(structuredClone(timer));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveTimer = () => {
    if (!draft.name.trim() || draft.steps.length === 0 || draft.steps.some(s => !commandExists(s.command_id))) {
      notify('Enter a name and pick a command for every step', 'error');
      return;
    }
    run('save', async () => {
      const body = { name: draft.name, time: draft.time, enabled: draft.enabled, steps: draft.steps };
      if (editingId) await api('PUT', `/timers/${editingId}`, body);
      else await api('POST', '/timers', body);
      notify(editingId ? 'Routine updated' : 'Routine added');
      cancelEdit();
      await refresh();
    });
  };

  const toggleTimer = (timer: Timer) => run(`row:${timer.id}`, async () => {
    const { name, time, steps } = timer;
    await api('PUT', `/timers/${timer.id}`, { name, time, steps, enabled: !timer.enabled });
    notify(timer.enabled ? 'Routine disabled' : 'Routine enabled');
    await refresh();
  });

  const deleteTimer = (timer: Timer) => {
    if (!window.confirm(`Delete "${timer.name}"?`)) return;
    run(`row:${timer.id}`, async () => {
      await api('DELETE', `/timers/${timer.id}`);
      if (editingId === timer.id) cancelEdit();
      await refresh();
    });
  };

  const executeTimer = (timer: Timer) => run(`row:${timer.id}`, async () => {
    await api('POST', `/timers/${timer.id}/execute`);
    notify(`Running: ${timer.name}`);
    setTimeout(refresh, 3000);
  });

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">Daily Routines</h2>

      <div className={`glass-panel rounded-2xl p-6 transition-all ${editingId ? 'ring-2 ring-blue-500 shadow-md' : ''}`}>
        <h3 className="text-lg font-semibold mb-5 text-gray-900">{editingId ? 'Edit Routine' : 'Add New Routine'}</h3>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Routine Name</label>
              <input type="text" value={draft.name} maxLength={60} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Good Morning" className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Time (daily)</label>
              <input type="time" value={draft.time} required onChange={e => e.target.value && setDraft({ ...draft, time: e.target.value })} className={`${inputClass} font-mono`} />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-600 block">Sequence Steps</label>
            {draft.steps.map((step, index) => (
              <div key={index} className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center bg-white border border-gray-200 w-7 h-7 rounded-full text-xs font-semibold text-gray-500 shrink-0">{index + 1}</span>
                  <select
                    value={step.command_id}
                    onChange={e => updateStep(index, { command_id: e.target.value })}
                    className="flex-1 min-w-0 bg-white border border-gray-300 text-gray-900 px-2 py-1.5 rounded-md focus:ring-2 focus:ring-blue-500/50 outline-none text-sm"
                  >
                    <option value="">{step.command_id && !commandExists(step.command_id) ? '(deleted command) — pick another' : 'Select command'}</option>
                    {config.rooms.map(room => (
                      <optgroup key={room.id} label={`${room.name} (CH${room.channel})`}>
                        {config.commands.filter(c => c.room_id === room.id).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button onClick={() => moveStep(index, -1)} disabled={index === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1" title="Move up">↑</button>
                  <button onClick={() => moveStep(index, 1)} disabled={index === draft.steps.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1" title="Move down">↓</button>
                  <button onClick={() => removeStep(index)} className="text-gray-400 hover:text-red-500 px-1" title="Remove step">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-gray-500 mb-1 block">Repeats</label>
                    <input type="number" min={1} max={50} value={step.repeats} onChange={e => updateStep(index, { repeats: Math.min(50, Math.max(1, parseInt(e.target.value) || 1)) })} className={numberInput} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-gray-500 mb-1 block" title="Pause between repeats of this step">Gap (ms)</label>
                    <input type="number" min={0} max={60000} step={100} value={step.interval_ms} disabled={step.repeats < 2} onChange={e => updateStep(index, { interval_ms: Math.min(60000, Math.max(0, parseInt(e.target.value) || 0)) })} className={`${numberInput} disabled:opacity-40`} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-gray-500 mb-1 block" title="Pause before the next step">Then wait (ms)</label>
                    <input type="number" min={0} max={600000} step={500} value={step.delay_after_ms} disabled={index === draft.steps.length - 1} onChange={e => updateStep(index, { delay_after_ms: Math.min(600000, Math.max(0, parseInt(e.target.value) || 0)) })} className={`${numberInput} disabled:opacity-40`} />
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setDraft(d => ({ ...d, steps: [...d.steps, newStep()] }))} className="w-full py-2.5 border border-dashed border-gray-300 hover:border-blue-400 text-gray-500 hover:text-blue-600 rounded-xl font-medium transition-colors bg-gray-50 hover:bg-blue-50 text-sm">
              + Add Step
            </button>
          </div>

          <div className="flex space-x-3 pt-2">
            <button onClick={saveTimer} disabled={busy !== null} className={`flex-1 ${primaryButton}`}>
              {busy === 'save' ? 'Saving…' : editingId ? 'Update Routine' : 'Save Routine'}
            </button>
            {editingId && <button onClick={cancelEdit} className={secondaryButton}>Cancel</button>}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {sortedTimers.map(timer => {
          const info = timer.id ? status?.timers[timer.id] : undefined;
          const last = info?.last_result;
          const rowBusy = busy === `row:${timer.id}`;
          return (
            <div key={timer.id} className={`glass-panel rounded-xl overflow-hidden border-l-4 ${timer.enabled ? 'border-l-blue-500' : 'border-l-gray-300 bg-gray-50'}`}>
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className={`w-16 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border ${timer.enabled ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                    <span className="text-lg font-bold leading-none mb-1">{timer.time}</span>
                    <span className="text-[9px] uppercase font-semibold">Daily</span>
                  </div>
                  <div className="min-w-0">
                    <h4 className={`text-lg font-semibold mb-0.5 ${timer.enabled ? 'text-gray-900' : 'text-gray-500'}`}>{timer.name}</h4>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                      <button onClick={() => toggleTimer(timer)} disabled={rowBusy} className={`font-medium ${timer.enabled ? 'text-blue-600 hover:text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}>
                        {timer.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      {timer.enabled && info?.next_run && <span>· next {formatDateTime(info.next_run)}</span>}
                      {last && last.ok !== null && (
                        <span className={last.ok ? 'text-green-600' : 'text-red-600'} title={last.errors.join('\n')}>
                          · last run {formatDateTime(last.started_at)} {last.ok ? '✓' : '✗ failed'}
                        </span>
                      )}
                      {last && last.ok === null && <span className="text-blue-600">· running…</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 md:ml-auto">
                  <button onClick={() => executeTimer(timer)} disabled={rowBusy} className="px-3 py-1.5 bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg text-xs font-medium border border-transparent hover:border-blue-200 disabled:opacity-50">
                    Run now
                  </button>
                  <div className="w-px h-5 bg-gray-200 mx-1"></div>
                  <button onClick={() => editTimer(timer)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                  </button>
                  <button onClick={() => deleteTimer(timer)} disabled={rowBusy} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 p-3 px-4 border-t border-gray-100 space-y-1.5">
                {timer.steps.length === 0 && <div className="text-xs text-red-600">No steps — edit this routine to add some.</div>}
                {timer.steps.map((step, i) => (
                  <div key={i} className="flex items-center text-xs text-gray-500">
                    <span className="w-4 font-medium text-gray-400 mr-1">{i + 1}.</span>
                    <span className="font-medium text-gray-700 truncate">{commandLabel(config, step.command_id)}</span>
                    <div className="flex-1 border-b border-dotted border-gray-300 mx-2"></div>
                    <span className="shrink-0">
                      {step.repeats}x{step.repeats > 1 && <span className="text-gray-400 text-[10px]"> ({step.interval_ms}ms)</span>}
                      {step.delay_after_ms > 0 && i < timer.steps.length - 1 && <span className="text-gray-400 text-[10px]"> then wait {step.delay_after_ms / 1000}s</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {sortedTimers.length === 0 && (
          <div className="glass-panel border-dashed rounded-2xl p-10 text-center">
            <p className="text-gray-500 text-sm">No daily routines configured.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Timers;
