import { useCallback, useState } from 'react';
import type { Command, Config, Role, Timer } from './types';
import { errorMessage } from './api';
import type { IconName } from './components/ui/Icon';

// --- Button functions ---

export const ROLE_LABEL: Record<Role, string> = {
  on: 'On', off: 'Off', brighter: 'Brighter', darker: 'Darker', white: 'White', warmer: 'Warmer',
};

/** Rows of the remote, as on the physical light remote. */
export const REMOTE_ROWS: Role[][] = [['on', 'off'], ['brighter', 'darker'], ['white', 'warmer']];
export const ROLES: Role[] = REMOTE_ROWS.flat();

/** Buttons that step a level (brightness, colour); holding them on Home keeps sending. */
export const REPEATABLE_ROLES: ReadonlySet<Role> = new Set<Role>(['brighter', 'darker', 'white', 'warmer']);

export const roleIcon = (role: Role | null): IconName => role ?? 'button';

export const label = (cmd: Command) => (cmd.role ? ROLE_LABEL[cmd.role] : cmd.name);

export const roomCommands = (config: Config, roomId: string) => {
  const cmds = config.commands.filter(c => c.room_id === roomId);
  const rank = (c: Command) => (c.role ? ROLES.indexOf(c.role) : ROLES.length);
  return cmds.sort((a, b) => rank(a) - rank(b));
};

/** The button in `roomId` that does the same thing: same role, else same name (mirrors the backend). */
export const equivalentCommand = (config: Config, cmd: Command, roomId: string) => {
  const inRoom = config.commands.filter(c => c.room_id === roomId);
  return (cmd.role && inRoom.find(c => c.role === cmd.role))
    || inRoom.find(c => c.name.toLowerCase() === cmd.name.toLowerCase());
};

export const roomName = (config: Config, roomId: string) =>
  config.rooms.find(r => r.id === roomId)?.name ?? '?';

/** The room all steps use, 'mixed', or null when there are no usable steps. */
export const routineRoom = (config: Config, timer: Timer): string | 'mixed' | null => {
  const rooms = new Set(timer.steps
    .map(s => config.commands.find(c => c.id === s.command_id)?.room_id)
    .filter((r): r is string => !!r));
  if (rooms.size === 0) return null;
  return rooms.size === 1 ? [...rooms][0] : 'mixed';
};

export const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === today.toDateString()) return `today ${time}`;
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
};

// --- Actions ---

/**
 * Tracks which action is in flight so its button can be disabled, and turns
 * thrown errors into error toasts.
 */
export function useBusy(notify: (m: string, t?: 'success' | 'error') => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }, [notify]);
  return { busy, run };
}

// --- Styles (light + dark) ---

export const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm';
export const muted = 'text-gray-500 dark:text-gray-400';
export const heading = 'text-gray-900 dark:text-gray-100';
export const inputClass =
  'w-full bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none';
export const primaryButton =
  'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryButton =
  'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const ghostButton =
  'text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40';
export const warningBox =
  'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 rounded-xl p-3 text-sm';

export const channelStyle = (channel: number) => {
  if (channel === 1) return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900';
  if (channel === 2) return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-900';
  return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900';
};
