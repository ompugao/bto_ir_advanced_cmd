import React, { useState } from 'react';
import type { PageProps, Timer } from '../../types';
import { api } from '../../api';
import { card, formatDateTime, heading, label, muted, primaryButton, roomName, routineRoom, useBusy } from '../../ui';
import Icon from '../ui/Icon';
import { Switch } from '../ui/Controls';
import RoutineEditor from './RoutineEditor';

const Routines: React.FC<PageProps> = ({ config, status, refresh, notify, navigate }) => {
  const { busy, run } = useBusy(notify);
  const [editing, setEditing] = useState<Timer | null>(null);
  const timers = [...config.timers].sort((a, b) => a.time.localeCompare(b.time));

  const describeSteps = (timer: Timer) => timer.steps.map(s => {
    const cmd = config.commands.find(c => c.id === s.command_id);
    return `${cmd ? label(cmd) : '(missing)'}${s.repeats > 1 ? ` ×${s.repeats}` : ''}`;
  }).join(' → ');

  const toggle = (t: Timer) => run(`row:${t.id}`, async () => {
    await api('PUT', `/timers/${t.id}`, { name: t.name, time: t.time, steps: t.steps, enabled: !t.enabled });
    await refresh();
  });

  const runNow = (t: Timer) => run(`row:${t.id}`, async () => {
    await api('POST', `/timers/${t.id}/execute`);
    notify(`Running “${t.name}”`);
    setTimeout(refresh, 2500);
  });

  const remove = (t: Timer) => {
    if (!window.confirm(`Delete “${t.name}”?`)) return;
    run(`row:${t.id}`, async () => {
      await api('DELETE', `/timers/${t.id}`);
      await refresh();
    });
  };

  const newRoutine = (): Timer => ({ name: '', time: '07:00', enabled: true, steps: [] });

  if (config.rooms.length === 0) {
    return (
      <div className={`${card} p-10 text-center`}>
        <p className={`${muted} mb-3`}>Add a room with buttons before creating routines.</p>
        <button onClick={() => navigate('settings')} className="text-blue-600 dark:text-blue-400 font-medium">Set up rooms →</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className={`text-2xl font-bold tracking-tight ${heading}`}>Routines</h1>
        <button onClick={() => setEditing(newRoutine())} className={`${primaryButton} !py-2 flex items-center gap-1.5`}>
          <Icon name="plus" className="w-4 h-4" /> New
        </button>
      </div>

      {timers.length === 0 && (
        <div className={`${card} p-10 text-center ${muted}`}>No routines yet.</div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {timers.map(t => {
          const info = t.id ? status?.timers[t.id] : undefined;
          const last = info?.last_result;
          const room = routineRoom(config, t);
          const rowBusy = busy === `row:${t.id}`;
          return (
            <article key={t.id} className={`${card} p-4 min-w-0 ${t.enabled ? '' : 'opacity-70'}`}>
              <div className="flex items-start gap-4">
                <div className={`text-3xl font-semibold tabular-nums leading-none ${t.enabled ? heading : muted}`}>{t.time}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className={`font-semibold ${heading} truncate`}>{t.name}</h2>
                    {room && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {room === 'mixed' ? 'Several rooms' : roomName(config, room)}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${muted} mt-1 truncate`} title={describeSteps(t)}>{describeSteps(t) || 'No steps'}</p>
                  <p className={`text-xs ${muted} mt-1.5 flex flex-wrap gap-x-3`}>
                    {t.enabled && info?.next_run && <span>Next {formatDateTime(info.next_run)}</span>}
                    {!t.enabled && <span>Off</span>}
                    {last?.ok === null && <span className="text-blue-600 dark:text-blue-400">Running…</span>}
                    {last && last.ok !== null && (
                      <span className={last.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} title={last.errors.join('\n')}>
                        Last {formatDateTime(last.started_at)} {last.ok ? '✓' : '✗ failed'}
                      </span>
                    )}
                  </p>
                </div>
                <Switch checked={t.enabled} onChange={() => toggle(t)} disabled={rowBusy} label={`${t.name} enabled`} />
              </div>
              <div className="flex items-center gap-1 mt-3 -mb-1 -ml-2">
                <button onClick={() => runNow(t)} disabled={rowBusy} className="text-sm font-medium flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-40">
                  <Icon name="play" className="w-4 h-4" /> Run now
                </button>
                <div className="flex-1" />
                <button onClick={() => setEditing(structuredClone(t))} className={`p-2 rounded-lg ${muted} hover:bg-gray-100 dark:hover:bg-gray-800`} title="Edit" aria-label="Edit">
                  <Icon name="edit" className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing({ ...structuredClone(t), id: undefined, name: `${t.name} (copy)` })} className={`p-2 rounded-lg ${muted} hover:bg-gray-100 dark:hover:bg-gray-800`} title="Duplicate" aria-label="Duplicate">
                  <Icon name="copy" className="w-4 h-4" />
                </button>
                <button onClick={() => remove(t)} disabled={rowBusy} className={`p-2 rounded-lg ${muted} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950`} title="Delete" aria-label="Delete">
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {editing && (
        <RoutineEditor config={config} initial={editing} notify={notify} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
    </div>
  );
};

export default Routines;
