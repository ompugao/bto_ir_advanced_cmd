import React, { useEffect, useRef } from 'react';

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
}

const TimePicker: React.FC<TimePickerProps> = ({ value, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<any>(null);

  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (inputRef.current && (window as any).TimepickerUI) {
      pickerRef.current = new (window as any).TimepickerUI(inputRef.current, {
        clock: { type: '24h' },
        callbacks: {
          onConfirm: (data: any) => {
            const h = String(data.hour).padStart(2, '0');
            const m = String(data.minutes).padStart(2, '0');
            onChangeRef.current(`${h}:${m}`);
          }
        }
      });
      pickerRef.current.create();
    }

    return () => {
      // timepicker-ui cleanup
    };
  }, []);

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        readOnly
        className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2.5 rounded-lg font-mono cursor-pointer hover:bg-gray-50 transition-colors focus:ring-2 focus:ring-blue-500/50 outline-none"
        placeholder="Select time"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      </div>
    </div>
  );
};

export default TimePicker;
