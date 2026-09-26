import React from 'react';
const PATHS = {
  // Remote functions
  on: <><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></>,
  off: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 15.5l7-7" /></>,
  brighter: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  darker: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  white: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /></>,
  warmer: <path d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.4 2.6-5.2 3.6-8.7 2.9 1.9 3.5 4.4 3.2 6.2 1-.6 1.7-1.8 1.9-3.1 1.9 1.7 3.3 3.5 3.3 5.6 0 3.3-2.4 5.8-6 5.8z" />,
  button: <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="12" cy="12" r="3" /></>,
  // Navigation
  home: <><path d="M3.5 11L12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /></>,
  routines: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  // Actions
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></>,
  up: <path d="M6 14.5l6-6 6 6" />,
  down: <path d="M6 9.5l6 6 6-6" />,
  back: <path d="M14.5 6l-6 6 6 6" />,
  chevron: <path d="M9.5 6l6 6-6 6" />,
  record: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" fill="currentColor" /></>,
  signal: <><path d="M5 19a10 10 0 0 1 0-14M8.5 15.5a5 5 0 0 1 0-7M19 5a10 10 0 0 1 0 14M15.5 8.5a5 5 0 0 1 0 7" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.01" /></>,
} as const;

export type IconName = keyof typeof PATHS;

const Icon: React.FC<{ name: IconName; className?: string }> = ({ name, className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>
);

export default Icon;
