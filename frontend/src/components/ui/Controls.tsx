import React, { useState } from 'react';
import Icon from './Icon';
import { channelStyle } from '../../ui';

export const Switch: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean; label: string }> =
  ({ checked, onChange, disabled, label }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
    </button>
  );

export const Stepper: React.FC<{ value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }> =
  ({ value, min, max, onChange, suffix }) => (
    <div className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
              className="px-2.5 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30" aria-label="Decrease">
        <Icon name="minus" className="w-4 h-4" />
      </button>
      <span className="min-w-[3rem] text-center text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{suffix}{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
              className="px-2.5 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30" aria-label="Increase">
        <Icon name="plus" className="w-4 h-4" />
      </button>
    </div>
  );

export const Chip: React.FC<{ selected?: boolean; onClick?: () => void; children: React.ReactNode; className?: string }> =
  ({ selected, onClick, children, className = '' }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        selected
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
      } ${className}`}
    >
      {children}
    </button>
  );

export const ChannelBadge: React.FC<{ channel: number }> = ({ channel }) => (
  <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md border ${channelStyle(channel)}`}>CH{channel}</span>
);

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 24-hour HH:MM picker: tap the time, then an hour and a 5-minute slot; ±1 fine-tunes the minute.
 * (Native time inputs follow the OS locale and may show AM/PM; long selects need scrolling.)
 */
export const TimeField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':').map(Number);
  const set = (hour: number, minute: number) => onChange(`${pad(hour)}:${pad(minute)}`);
  const shiftMinute = (delta: number) => {
    const total = (h * 60 + m + delta + 1440) % 1440;
    set(Math.floor(total / 60), total % 60);
  };
  const cell = (selected: boolean) =>
    `py-1.5 rounded-lg text-sm font-mono tabular-nums transition-colors ${selected
      ? 'bg-blue-600 text-white'
      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`;

  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
              className={`font-mono text-lg tabular-nums px-3 py-1.5 rounded-lg border ${open
                ? 'border-blue-500 ring-2 ring-blue-500/30'
                : 'border-gray-300 dark:border-gray-700'} bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100`}>
        {value}
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-3 w-72 max-w-full">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Hour</div>
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: 24 }, (_, i) => (
                <button key={i} type="button" onClick={() => set(i, m)} className={cell(i === h)}>{pad(i)}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Minute</div>
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: 12 }, (_, i) => i * 5).map(min => (
                <button key={min} type="button" onClick={() => set(h, min)} className={cell(min === m)}>{pad(min)}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftMinute(-1)} className={`${cell(false)} px-3`}>−1 min</button>
            <button type="button" onClick={() => shiftMinute(1)} className={`${cell(false)} px-3`}>+1 min</button>
            <div className="flex-1" />
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-blue-600 dark:text-blue-400 px-2 py-1">Done</button>
          </div>
        </div>
      )}
    </div>
  );
};
