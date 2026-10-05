export interface Room {
  id: string;
  name: string;
  channel: number;
  brightness_steps: number;
  color_steps: number;
}

export type Role = 'on' | 'off' | 'brighter' | 'darker' | 'white' | 'warmer';

export interface Command {
  id: string;
  room_id: string;
  name: string;
  raw_data: string;
  derived: boolean;
  role: Role | null;
}

export interface TimerStep {
  command_id: string;
  repeats: number;
  interval_ms: number;
  delay_after_ms: number;
}

export interface Timer {
  id?: string;
  name: string;
  time: string;
  enabled: boolean;
  steps: TimerStep[];
}

export interface Config {
  version: number;
  rooms: Room[];
  commands: Command[];
  timers: Timer[];
}

export interface RunResult {
  timer_id: string;
  trigger: 'schedule' | 'manual';
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  errors: string[];
}

export interface Status {
  now: string;
  device_connected: boolean | null;
  recording: { active: boolean; started_at: string | null; expires_at: string | null; expired: boolean };
  timers: Record<string, { next_run: string | null; last_result: RunResult | null }>;
}

export interface Decoded {
  frames: string[];
  light_channel: number | null;
  function: Role | null;
}

export type Notify = (message: string, type?: 'success' | 'error') => void;

export interface PageProps {
  config: Config;
  status: Status | null;
  refresh: () => Promise<void>;
  notify: Notify;
  navigate: (route: string) => void;
}
