import React, { useState } from 'react';
import type { Config, Notify, Timer, TimerStep } from '../../types';
import { api } from '../../api';
import { equivalentCommand, heading, inputClass, label, muted, primaryButton, roomCommands, roomName, routineRoom, secondaryButton, useBusy, warningBox, roleIcon } from '../../ui';
import Icon from '../ui/Icon';
import Sheet from '../ui/Sheet';
import { Chip, Stepper, TimeField } from '../ui/Controls';

interface EditorStep extends TimerStep {
  key: number;
  roomId: string;
  missing?: string; // label of a button the room doesn't have
}

let nextKey = 0;

interface Props {
  config: Config;
  /** Timer to edit (with id), or a template for a new one (without id). */
  initial: Timer;
  notify: Notify;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const RoutineEditor: React.FC<Props> = ({ config, initial, notify, onClose, onSaved }) => {
  const { busy, run } = useBusy(notify);
  const firstRoom = config.rooms[0]?.id ?? '';
  const initialRoom = routineRoom(config, initial);
  const [name, setName] = useState(initial.name);
  const [time, setTime] = useState(initial.time);
  const [roomId, setRoomId] = useState<string>(initialRoom && initialRoom !== 'mixed' ? initialRoom : firstRoom);
  const [steps, setSteps] = useState<EditorStep[]>(() => initial.steps.map(s => ({
    ...s,
    key: nextKey++,
    roomId: config.commands.find(c => c.id === s.command_id)?.room_id ?? firstRoom,
  })));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const newStep = (room: string): EditorStep =>
    ({ key: nextKey++, roomId: room, command_id: '', repeats: 1, interval_ms: 100, delay_after_ms: 0 });

  const update = (key: number, patch: Partial<EditorStep>) =>
    setSteps(ss => ss.map(s => (s.key === key ? { ...s, ...patch } : s)));

  /** Moves a step to another room, keeping the same function where that room has it. */
  const retarget = (step: EditorStep, room: string): EditorStep => {
    const cmd = config.commands.find(c => c.id === step.command_id);
    if (!cmd) return { ...step, roomId: room };
    const match = equivalentCommand(config, cmd, room);
    return match
      ? { ...step, roomId: room, command_id: match.id, missing: undefined }
      : { ...step, roomId: room, command_id: '', missing: label(cmd) };
  };

  const switchRoom = (room: string) => {
    setRoomId(room);
    setSteps(ss => ss.map(s => retarget(s, room)));
  };

  const move = (index: number, delta: number) => setSteps(ss => {
    const next = [...ss];
    const [s] = next.splice(index, 1);
    next.splice(index + delta, 0, s);
    return next;
  });

  const toggleExpanded = (key: number) => setExpanded(e => {
    const next = new Set(e);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const incomplete = steps.some(s => !s.command_id);
  const canSave = name.trim() && steps.length > 0 && !incomplete;

  const save = () => run('save', async () => {
    const body = {
      name: name.trim(), time, enabled: initial.enabled,
      steps: steps.map(({ command_id, repeats, interval_ms, delay_after_ms }) => ({ command_id, repeats, interval_ms, delay_after_ms })),
    };
    if (initial.id) await api('PUT', `/timers/${initial.id}`, body);
    else await api('POST', '/timers', body);
    notify(initial.id ? 'Routine saved' : 'Routine added');
    await onSaved();
    onClose();
  });

  return (
    <Sheet
      title={initial.id ? 'Edit routine' : 'New routine'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <button onClick={onClose} className={`${secondaryButton} flex-1`}>Cancel</button>
          <button onClick={save} disabled={!canSave || busy !== null} className={`${primaryButton} flex-1`}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <label className={`text-xs font-semibold ${muted} mb-1.5 block`}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="e.g. Prepare sleep" className={inputClass} />
        </div>
        <div>
          <label className={`text-xs font-semibold ${muted} mb-1.5 block`}>Every day at</label>
          <TimeField value={time} onChange={setTime} />
        </div>
      </div>

      <div>
        <label className={`text-xs font-semibold ${muted} mb-1.5 block`}>Room</label>
        <div className="flex flex-wrap gap-2">
          {config.rooms.map(r => (
            <Chip key={r.id} selected={r.id === roomId} onClick={() => switchRoom(r.id)}>{r.name}</Chip>
          ))}
        </div>
        {steps.length > 0 && <p className={`text-xs ${muted} mt-1.5`}>Choosing a room moves every step to the same button there.</p>}
      </div>

      <div className="space-y-3">
        <label className={`text-xs font-semibold ${muted} block`}>Steps</label>
        {steps.map((step, index) => {
          const buttons = roomCommands(config, step.roomId);
          const open = expanded.has(step.key);
          return (
            <div key={step.key} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-semibold flex items-center justify-center ${muted}`}>{index + 1}</span>
                {step.roomId !== roomId && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">{roomName(config, step.roomId)}</span>
                )}
                <div className="flex-1" />
                <button onClick={() => move(index, -1)} disabled={index === 0} className={`p-1 ${muted} disabled:opacity-30`} aria-label="Move up"><Icon name="up" className="w-4 h-4" /></button>
                <button onClick={() => move(index, 1)} disabled={index === steps.length - 1} className={`p-1 ${muted} disabled:opacity-30`} aria-label="Move down"><Icon name="down" className="w-4 h-4" /></button>
                <button onClick={() => setSteps(ss => ss.filter(s => s.key !== step.key))} className={`p-1 ${muted} hover:text-red-600`} aria-label="Remove step"><Icon name="x" className="w-4 h-4" /></button>
              </div>

              {step.missing && !step.command_id && (
                <div className={warningBox}>{roomName(config, step.roomId)} has no “{step.missing}”. Pick another button or room.</div>
              )}

              <div className="flex flex-wrap gap-2">
                {buttons.map(c => (
                  <Chip key={c.id} selected={c.id === step.command_id} onClick={() => update(step.key, { command_id: c.id, missing: undefined })}>
                    <Icon name={roleIcon(c.role)} className="w-4 h-4" />{label(c)}
                  </Chip>
                ))}
                {buttons.length === 0 && <span className={`text-sm ${muted}`}>This room has no buttons.</span>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${muted}`}>Press</span>
                  <Stepper value={step.repeats} min={1} max={50} suffix="×" onChange={v => update(step.key, { repeats: v })} />
                </div>
                <button onClick={() => toggleExpanded(step.key)} className={`text-xs font-medium ${muted} hover:underline`}>
                  {open ? 'Fewer options' : 'More options'}
                </button>
              </div>

              {open && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <label className={`text-xs ${muted}`}>
                    Room
                    <select value={step.roomId} onChange={e => update(step.key, retarget(step, e.target.value))} className={`${inputClass} mt-1 text-sm py-1.5`}>
                      {config.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>
                  <label className={`text-xs ${muted}`}>
                    Gap between presses (ms)
                    <input type="number" min={0} max={60000} step={50} value={step.interval_ms} disabled={step.repeats < 2}
                           onChange={e => update(step.key, { interval_ms: Math.min(60000, Math.max(0, parseInt(e.target.value) || 0)) })}
                           className={`${inputClass} mt-1 text-sm py-1.5 disabled:opacity-40`} />
                  </label>
                  <label className={`text-xs ${muted}`}>
                    Then wait (s)
                    <input type="number" min={0} max={600} step={0.5} value={step.delay_after_ms / 1000} disabled={index === steps.length - 1}
                           onChange={e => update(step.key, { delay_after_ms: Math.round(Math.min(600, Math.max(0, parseFloat(e.target.value) || 0)) * 1000) })}
                           className={`${inputClass} mt-1 text-sm py-1.5 disabled:opacity-40`} />
                  </label>
                </div>
              )}
            </div>
          );
        })}
        <button onClick={() => setSteps(ss => [...ss, newStep(roomId)])}
                className={`w-full py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium ${muted} hover:text-blue-600 hover:border-blue-400`}>
          + Add step
        </button>
        {incomplete && steps.length > 0 && <p className={`text-xs ${heading} opacity-70`}>Pick a button for every step to save.</p>}
      </div>
    </Sheet>
  );
};

export default RoutineEditor;
