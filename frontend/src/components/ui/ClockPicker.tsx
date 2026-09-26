import React, { useEffect, useRef, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

// Dial geometry in SVG units
const SIZE = 256;
const C = SIZE / 2;
const OUTER = 100; // outer ring radius (hours 00–11, minutes)
const INNER = 64; // inner ring radius (hours 12–23)
const KNOB = 20;

const polar = (angle: number, r: number) => ({ x: C + r * Math.sin(angle), y: C - r * Math.cos(angle) });

interface Props {
  value: string; // "HH:MM"
  onConfirm: (v: string) => void;
  onCancel: () => void;
}

/** Material 3 style 24-hour clock dial: pick the hour on two rings, then the minute. */
const ClockPicker: React.FC<Props> = ({ value, onConfirm, onCancel }) => {
  const [h0, m0] = value.split(':').map(Number);
  const [hour, setHour] = useState(h0);
  const [minute, setMinute] = useState(m0);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const dragging = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const pick = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE - C;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE - C;
    const angle = (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI); // 0 at 12 o'clock, clockwise
    if (mode === 'hour') {
      const idx = Math.round(angle / (Math.PI / 6)) % 12;
      const inner = Math.hypot(x, y) < (OUTER + INNER) / 2;
      setHour(inner ? idx + 12 : idx);
    } else {
      setMinute(Math.round(angle / (Math.PI / 30)) % 60);
    }
  };

  const onDown = (e: React.PointerEvent) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    pick(e);
  };
  const onMove = (e: React.PointerEvent) => { if (dragging.current) pick(e); };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (mode === 'hour') setMode('minute');
  };

  // Selected position
  const selAngle = mode === 'hour' ? (hour % 12) * (Math.PI / 6) : minute * (Math.PI / 30);
  const selRadius = mode === 'hour' && hour >= 12 ? INNER : OUTER;
  const knob = polar(selAngle, selRadius);

  const labels = mode === 'hour'
    ? [...Array.from({ length: 12 }, (_, i) => ({ v: i, r: OUTER })), ...Array.from({ length: 12 }, (_, i) => ({ v: i + 12, r: INNER }))]
    : Array.from({ length: 12 }, (_, i) => ({ v: i * 5, r: OUTER }));
  const isSelected = (v: number) => (mode === 'hour' ? v === hour : v === minute);

  const segment = (m: 'hour' | 'minute', text: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`w-24 h-20 rounded-xl text-5xl font-normal tabular-nums transition-colors ${mode === m
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-100'
        : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'}`}
      aria-label={m === 'hour' ? 'Hour' : 'Minute'}
      aria-pressed={mode === m}
    >
      {text}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Select time">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-[20rem] max-w-full rounded-3xl bg-white dark:bg-gray-900 shadow-xl p-6">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-5">Select time</div>

        <div className="flex items-center justify-center gap-1.5 mb-6">
          {segment('hour', pad(hour))}
          <span className="text-5xl text-gray-900 dark:text-gray-100 pb-1">:</span>
          {segment('minute', pad(minute))}
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-64 h-64 max-w-full mx-auto block touch-none select-none cursor-pointer"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <circle cx={C} cy={C} r={C} className="fill-gray-100 dark:fill-gray-800" />
          <line x1={C} y1={C} x2={knob.x} y2={knob.y} strokeWidth={2} className="stroke-blue-600" />
          <circle cx={C} cy={C} r={3.5} className="fill-blue-600" />
          <circle cx={knob.x} cy={knob.y} r={KNOB} className="fill-blue-600" />
          {mode === 'minute' && minute % 5 !== 0 && <circle cx={knob.x} cy={knob.y} r={2.5} className="fill-white" />}
          {labels.map(({ v, r }) => {
            const p = polar((mode === 'hour' ? v % 12 : v / 5) * (Math.PI / 6), r);
            return (
              <text key={`${r}:${v}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
                    className={`pointer-events-none ${r === INNER ? 'text-[13px]' : 'text-[15px]'} ${isSelected(v)
                      ? 'fill-white'
                      : r === INNER ? 'fill-gray-500 dark:fill-gray-400' : 'fill-gray-800 dark:fill-gray-200'}`}>
                {pad(v)}
              </text>
            );
          })}
        </svg>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-full text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950">Cancel</button>
          <button type="button" onClick={() => onConfirm(`${pad(hour)}:${pad(minute)}`)} className="px-4 py-2 rounded-full text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950">OK</button>
        </div>
      </div>
    </div>
  );
};

export default ClockPicker;
