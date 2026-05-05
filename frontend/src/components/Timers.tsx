import React, { useState } from 'react';
import type { Config, Timer, TimerStep } from '../types';
import TimePicker from './TimePicker';

interface TimersProps {
  config: Config;
  fetchConfig: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
}

const initialTimer: Timer = {
  name: '',
  steps: [{ command_name: '', repeats: 1, interval_ms: 100 }],
  time: '07:00',
  enabled: true
};

const Timers: React.FC<TimersProps> = ({ config, fetchConfig, notify }) => {
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [newTimer, setNewTimer] = useState<Timer>(initialTimer);

  const sortedTimers = [...config.timers].sort((a, b) => a.time.localeCompare(b.time));

  const updateStep = (index: number, field: keyof TimerStep, value: any) => {
    const steps = [...newTimer.steps];
    steps[index] = { ...steps[index], [field]: value };
    setNewTimer({ ...newTimer, steps });
  };

  const removeStep = (index: number) => {
    const steps = [...newTimer.steps];
    steps.splice(index, 1);
    setNewTimer({ ...newTimer, steps });
  };

  const addStep = () => {
    setNewTimer({ ...newTimer, steps: [...newTimer.steps, { command_name: '', repeats: 1, interval_ms: 100 }] });
  };

  const cancelEdit = () => {
    setEditingTimerId(null);
    setNewTimer(initialTimer);
  };

  const editTimer = (timer: Timer) => {
    setEditingTimerId(timer.id || null);
    setNewTimer(JSON.parse(JSON.stringify(timer))); // deep copy
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveTimer = async () => {
    if (!newTimer.name || !newTimer.time || newTimer.steps.length === 0) {
      notify('Please fill in name, time, and at least one step', 'error');
      return;
    }

    const url = editingTimerId ? `/api/timers/${editingTimerId}` : '/api/timers';
    const method = editingTimerId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTimer)
      });
      if (res.ok) {
        notify(editingTimerId ? 'Routine updated' : 'Routine added');
        fetchConfig();
        cancelEdit();
      } else {
        const err = await res.json();
        notify(err.detail || 'Failed to save routine', 'error');
      }
    } catch (e) {
      notify('Network error', 'error');
    }
  };

  const toggleTimer = async (timer: Timer) => {
    const updated = { ...timer, enabled: !timer.enabled };
    const res = await fetch(`/api/timers/${timer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    if (res.ok) {
      notify(updated.enabled ? 'Routine enabled' : 'Routine disabled');
      fetchConfig();
    }
  };

  const deleteTimer = async (id?: string) => {
    if (!id) return;
    if (!window.confirm('Delete this routine?')) return;
    await fetch(`/api/timers/${id}`, { method: 'DELETE' });
    fetchConfig();
  };

  const executeTimer = async (id?: string, name?: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/timers/${id}/execute`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      notify(`Executing: ${name}`);
    } catch (e) {
      notify(`Failed to execute: ${name}`, 'error');
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Daily Routines</h2>
      </div>

      <div className={`glass-panel rounded-2xl p-6 transition-all ${editingTimerId ? 'ring-2 ring-blue-500 shadow-md' : ''}`}>
        <h3 className="text-lg font-semibold mb-5 text-gray-900">
          {editingTimerId ? 'Edit Routine' : 'Add New Routine'}
        </h3>

        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Routine Name</label>
            <input
              type="text"
              value={newTimer.name}
              onChange={e => setNewTimer({ ...newTimer, name: e.target.value })}
              placeholder="e.g. Good Morning"
              className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-600 block">Sequence Steps</label>
            {newTimer.steps.map((step, index) => (
              <div key={index} className="relative bg-gray-50 border border-gray-200 p-4 rounded-xl flex flex-col md:flex-row md:items-center gap-4">
                <button
                  onClick={() => removeStep(index)}
                  className="absolute -top-2 -right-2 bg-white border border-gray-200 text-gray-400 hover:text-red-500 p-1.5 rounded-full shadow-sm transition-colors z-10"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>

                <div className="flex items-center justify-center bg-white border border-gray-200 w-7 h-7 rounded-full text-xs font-semibold text-gray-500 shrink-0 shadow-sm">
                  {index + 1}
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 w-full">
                  <div className="md:col-span-6">
                    <label className="text-[10px] uppercase font-semibold text-gray-500 mb-1 block">Command</label>
                    <select
                      value={step.command_name}
                      onChange={e => updateStep(index, 'command_name', e.target.value)}
                      className="w-full bg-white border border-gray-300 text-gray-900 px-2 py-1.5 rounded-md focus:ring-2 focus:ring-blue-500/50 outline-none text-sm"
                    >
                      <option value="">Select Command</option>
                      {Object.entries(config.commands).map(([name, cmd]) => (
                        <option key={name} value={name}>{name} (CH{cmd.channel})</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-[10px] uppercase font-semibold text-gray-500 mb-1 block">Repeats</label>
                    <input
                      type="number"
                      value={step.repeats}
                      onChange={e => updateStep(index, 'repeats', parseInt(e.target.value) || 1)}
                      className="w-full bg-white border border-gray-300 text-gray-900 px-2 py-1.5 rounded-md focus:ring-2 focus:ring-blue-500/50 outline-none text-sm text-center"
                      min="1"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-[10px] uppercase font-semibold text-gray-500 mb-1 block">Delay (ms)</label>
                    <input
                      type="number"
                      value={step.interval_ms}
                      onChange={e => updateStep(index, 'interval_ms', parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-gray-300 text-gray-900 px-2 py-1.5 rounded-md focus:ring-2 focus:ring-blue-500/50 outline-none text-sm text-center"
                      min="0" step="100"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addStep}
              className="w-full py-2.5 border border-dashed border-gray-300 hover:border-blue-400 text-gray-500 hover:text-blue-600 rounded-xl font-medium transition-colors bg-gray-50 hover:bg-blue-50 text-sm"
            >
              + Add Step
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Execution Time</label>
            <TimePicker value={newTimer.time} onChange={(time) => setNewTimer(prev => ({ ...prev, time }))} />
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              onClick={saveTimer}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-colors focus:ring-2 focus:ring-blue-500/50"
            >
              {editingTimerId ? 'Update Routine' : 'Save Routine'}
            </button>
            {editingTimerId && (
              <button
                onClick={cancelEdit}
                className="px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {sortedTimers.map(timer => (
          <div key={timer.id} className={`glass-panel rounded-xl overflow-hidden transition-all hover:shadow-md ${timer.enabled ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-gray-300 bg-gray-50'}`}>
            <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border ${timer.enabled ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                  <span className="text-lg font-bold leading-none mb-1">{timer.time}</span>
                  <span className="text-[9px] uppercase font-semibold">Daily</span>
                </div>
                <div>
                  <h4 className={`text-lg font-semibold mb-0.5 ${timer.enabled ? 'text-gray-900' : 'text-gray-500'}`}>{timer.name}</h4>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span>{timer.steps.length} {timer.steps.length === 1 ? 'step' : 'steps'}</span>
                    <span>•</span>
                    <button
                      onClick={() => toggleTimer(timer)}
                      className={`font-medium transition-colors ${timer.enabled ? 'text-blue-600 hover:text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      {timer.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 md:ml-auto">
                <button
                  onClick={() => executeTimer(timer.id, timer.name)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg text-xs font-medium transition-colors border border-transparent hover:border-blue-200"
                >
                  Test
                </button>
                <div className="w-px h-5 bg-gray-200 mx-1"></div>
                <button
                  onClick={() => editTimer(timer)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button
                  onClick={() => deleteTimer(timer.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            </div>

            <div className="bg-gray-50 p-3 px-4 border-t border-gray-100">
              <div className="space-y-1.5">
                {timer.steps.map((step, sIdx) => (
                  <div key={sIdx} className="flex items-center text-xs text-gray-500">
                    <span className="w-4 font-medium text-gray-400 mr-1">{sIdx + 1}.</span>
                    <span className="font-medium text-gray-700">{step.command_name}</span>
                    <span className="ml-1.5 px-1 py-0.5 rounded bg-white border border-gray-200 text-[9px] font-medium">CH{config.commands[step.command_name]?.channel || '?'}</span>
                    <div className="flex-1 border-b border-dotted border-gray-300 mx-2"></div>
                    <span className="text-gray-500">{step.repeats}x <span className="text-gray-400 text-[10px]">({step.interval_ms}ms)</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
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
