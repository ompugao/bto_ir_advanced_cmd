import React, { useState } from 'react';
import Icon from './Icon';
import ClockPicker from './ClockPicker';
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

/** Shows HH:MM; tapping opens the clock dial. */
export const TimeField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Time ${value}, change`}
              className="font-mono text-lg tabular-nums px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 hover:border-blue-500">
        {value}
      </button>
      {open && <ClockPicker value={value} onConfirm={v => { onChange(v); setOpen(false); }} onCancel={() => setOpen(false)} />}
    </>
  );
};
