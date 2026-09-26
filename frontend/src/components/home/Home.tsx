import React from 'react';
import type { PageProps } from '../../types';
import { REMOTE_ROWS, REPEATABLE_ROLES, card, heading, muted, roomCommands } from '../../ui';
import { ChannelBadge } from '../ui/Controls';
import RemoteButton from './RemoteButton';

const Home: React.FC<PageProps> = ({ config, notify, navigate }) => {
  if (config.rooms.length === 0) {
    return (
      <div className={`${card} p-10 text-center`}>
        <p className={`${muted} mb-3`}>No rooms yet.</p>
        <button onClick={() => navigate('settings')} className="text-blue-600 dark:text-blue-400 font-medium">Set up rooms →</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {config.rooms.map(room => {
        const cmds = roomCommands(config, room.id);
        const byRole = new Map(cmds.filter(c => c.role).map(c => [c.role, c]));
        const custom = cmds.filter(c => !c.role);
        const rows = REMOTE_ROWS.map(row => row.map(role => byRole.get(role))).filter(row => row.some(Boolean));
        return (
          <section key={room.id} className={`${card} p-4 space-y-3`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${heading}`}>{room.name}</h2>
              <ChannelBadge channel={room.channel} />
            </div>
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                {row.map((cmd, j) => cmd
                  ? <RemoteButton key={cmd.id} cmd={cmd} notify={notify} repeatable={!!cmd.role && REPEATABLE_ROLES.has(cmd.role)} />
                  : <div key={j} />)}
              </div>
            ))}
            {custom.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                {custom.map(cmd => <RemoteButton key={cmd.id} cmd={cmd} notify={notify} />)}
              </div>
            )}
            {cmds.length === 0 && (
              <p className={`text-sm ${muted}`}>
                No buttons yet. <button onClick={() => navigate(`settings/${room.id}`)} className="text-blue-600 dark:text-blue-400 font-medium">Add buttons</button>
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default Home;
