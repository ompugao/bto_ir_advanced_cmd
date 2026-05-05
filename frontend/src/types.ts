export interface IRCommand {
  raw_data: string;
  channel: number;
}

export interface TimerStep {
  command_name: string;
  repeats: number;
  interval_ms: number;
}

export interface Timer {
  id?: string;
  name: string;
  steps: TimerStep[];
  time: string;
  enabled: boolean;
}

export interface Config {
  commands: Record<string, IRCommand>;
  timers: Timer[];
  mappings: Record<string, string>;
}
