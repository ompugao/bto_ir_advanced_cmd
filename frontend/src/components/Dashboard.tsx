import React from 'react';
import type { Config } from '../types';

interface DashboardProps {
  config: Config;
  fetchConfig: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
}

const Dashboard: React.FC<DashboardProps> = ({ config, fetchConfig, notify }) => {
  const sendCommand = async (name: string) => {
    try {
      const res = await fetch(`/api/commands/send/${name}`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      notify(`Sent: ${name}`);
    } catch (e: any) {
      notify(e.message, 'error');
    }
  };

  const deleteCommand = async (name: string) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    await fetch(`/api/commands/${name}`, { method: 'DELETE' });
    fetchConfig();
  };

  const commandEntries = Object.entries(config.commands);

  const getChannelStyle = (channel: number) => {
    if (channel === 1) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (channel === 2) return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-orange-50 text-orange-700 border-orange-200';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Quick Control</h2>
        <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
          {commandEntries.length} {commandEntries.length === 1 ? 'Command' : 'Commands'}
        </span>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {commandEntries.map(([name, cmd]) => (
          <div
            key={name}
            className="glass-panel rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md"
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex flex-col">
                <span className="font-semibold text-gray-900 truncate max-w-[180px]">{name}</span>
                <div className="flex items-center mt-1.5 space-x-2">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${getChannelStyle(cmd.channel)}`}>
                    CH{cmd.channel}
                  </span>
                  {config.mappings[cmd.channel] && (
                    <span className="text-xs text-gray-500 font-medium truncate max-w-[120px]">
                      {config.mappings[cmd.channel]}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => deleteCommand(name)}
                className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                title="Delete command"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
            
            <button
              onClick={() => sendCommand(name)}
              className="w-full bg-gray-50 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 hover:border-blue-200 text-gray-700 py-2.5 rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              Send Signal
            </button>
          </div>
        ))}
      </div>
      {commandEntries.length === 0 && (
        <div className="glass-panel border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No commands yet</h3>
          <p className="text-sm text-gray-500 max-w-sm">You haven't registered any IR commands. Switch to the Record tab to add some.</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
