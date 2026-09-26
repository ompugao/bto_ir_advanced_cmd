import { useCallback, useState } from 'react';
import type { Config } from './types';
import { errorMessage } from './api';

export const channelStyle = (channel: number) => {
  if (channel === 1) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (channel === 2) return 'bg-purple-50 text-purple-700 border-purple-200';
  return 'bg-orange-50 text-orange-700 border-orange-200';
};

export const roomName = (config: Config, roomId: string) =>
  config.rooms.find(r => r.id === roomId)?.name ?? '?';

export const commandLabel = (config: Config, commandId: string) => {
  const cmd = config.commands.find(c => c.id === commandId);
  return cmd ? `${roomName(config, cmd.room_id)} › ${cmd.name}` : '(deleted command)';
};

export const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

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

export const inputClass =
  'w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none';
export const primaryButton =
  'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryButton =
  'bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
