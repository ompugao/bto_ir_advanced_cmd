import React from 'react';
import type { Command, PageProps, Room } from '../types';
import { api } from '../api';
import { channelStyle, useBusy } from '../ui';

interface DashboardProps extends PageProps {
  goTo: (tab: 'record' | 'rooms') => void;
}

const Dashboard: React.FC<DashboardProps> = ({ config, refresh, notify, goTo }) => {
  const { busy, run } = useBusy(notify);

  const send = (cmd: Command) => run(`send:${cmd.id}`, async () => {
    await api('POST', `/commands/${cmd.id}/send`);
    notify(`Sent: ${cmd.name}`);
  });

  const rename = (cmd: Command) => {
    const name = window.prompt('New name', cmd.name)?.trim();
    if (!name || name === cmd.name) return;
    run(`edit:${cmd.id}`, async () => {
      await api('PATCH', `/commands/${cmd.id}`, { name });
      await refresh();
    });
  };

  const remove = (cmd: Command) => {
    if (!window.confirm(`Delete ${cmd.name}?`)) return;
    run(`edit:${cmd.id}`, async () => {
      await api('DELETE', `/commands/${cmd.id}`);
      notify(`Deleted ${cmd.name}`);
      await refresh();
    });
  };

  const copyTo = (cmd: Command, room: Room) => run(`edit:${cmd.id}`, async () => {
    await api('POST', `/commands/${cmd.id}/derive`, { room_id: room.id });
    notify(`Created ${cmd.name} for ${room.name} (CH${room.channel})`);
    await refresh();
  });

  if (config.rooms.length === 0) {
    return (
      <div className="glass-panel border-dashed rounded-2xl p-12 text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-1">No rooms yet</h3>
        <p className="text-sm text-gray-500 mb-4">Add a room and set the channel its light's remote uses.</p>
        <button onClick={() => goTo('rooms')} className="text-blue-600 font-medium text-sm">Go to Rooms →</button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">Quick Control</h2>

      {config.rooms.map(room => {
        const commands = config.commands.filter(c => c.room_id === room.id);
        const others = config.rooms.filter(r => r.id !== room.id);
        return (
          <section key={room.id} className="space-y-3">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-semibold text-gray-900">{room.name}</h3>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${channelStyle(room.channel)}`}>
                CH{room.channel}
              </span>
            </div>

            {commands.length === 0 && (
              <p className="text-sm text-gray-500">
                No buttons yet. <button onClick={() => goTo('record')} className="text-blue-600 font-medium">Record one</button>
                {others.length > 0 && <> or copy them from another room in <button onClick={() => goTo('rooms')} className="text-blue-600 font-medium">Rooms</button></>}.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {commands.map(cmd => {
                const missingIn = others.filter(r => !config.commands.some(c => c.room_id === r.id && c.name.toLowerCase() === cmd.name.toLowerCase()));
                return (
                  <div key={cmd.id} className="glass-panel rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4 gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate" title={cmd.name}>{cmd.name}</div>
                        {cmd.derived && (
                          <span className="text-[10px] text-gray-500" title="Generated from another room's recording">generated</span>
                        )}
                      </div>
                      <div className="flex items-center shrink-0">
                        {missingIn.length > 0 && (
                          <select
                            value=""
                            disabled={busy !== null}
                            onChange={e => { const r = others.find(o => o.id === e.target.value); if (r) copyTo(cmd, r); }}
                            className="text-xs text-gray-500 bg-transparent border border-gray-200 rounded-lg px-1 py-1 mr-1 max-w-[6.5rem]"
                            title="Create this button for another room"
                          >
                            <option value="">Copy to…</option>
                            {missingIn.map(r => <option key={r.id} value={r.id}>{r.name} (CH{r.channel})</option>)}
                          </select>
                        )}
                        <button onClick={() => rename(cmd)} disabled={busy !== null} className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50" title="Rename">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button onClick={() => remove(cmd)} disabled={busy !== null} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => send(cmd)}
                      disabled={busy === `send:${cmd.id}`}
                      className="w-full bg-gray-50 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 hover:border-blue-200 text-gray-700 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                      {busy === `send:${cmd.id}` ? 'Sending…' : 'Send Signal'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default Dashboard;
