import React from 'react';
import type { Config } from '../types';

interface SettingsProps {
  config: Config;
  fetchConfig: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
}

const Settings: React.FC<SettingsProps> = ({ config, fetchConfig, notify }) => {
  const updateMapping = (ch: string, value: string) => {
    config.mappings[ch] = value;
  };

  const saveMappings = async () => {
    const res = await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config.mappings)
    });
    if (res.ok) {
      notify('Mappings saved successfully');
      fetchConfig();
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Channel Mapping</h2>
      </div>

      <div className="glass-panel rounded-2xl p-6 sm:p-8">
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          Assign friendly names to your 3 hardware channels. These names will appear throughout the dashboard and timers to help you identify which room or device you are controlling.
        </p>
        
        <div className="space-y-4 mb-8">
          {[1, 2, 3].map(ch => (
            <div key={ch} className="flex items-center space-x-5 bg-gray-50 border border-gray-200 p-4 rounded-xl transition-all hover:bg-white hover:border-gray-300 focus-within:ring-2 focus-within:ring-blue-500/30">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg shadow-sm border ${
                ch === 1 ? 'bg-blue-50 text-blue-600 border-blue-200' : 
                ch === 2 ? 'bg-purple-50 text-purple-600 border-purple-200' : 
                'bg-orange-50 text-orange-600 border-orange-200'
              }`}>
                CH{ch}
              </div>
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5 block">Room / Device Name</label>
                <input 
                  type="text" 
                  defaultValue={config.mappings[ch.toString()] || ''} 
                  onChange={e => updateMapping(ch.toString(), e.target.value)} 
                  placeholder="e.g. Living Room TV" 
                  className="w-full bg-transparent border-none text-gray-900 font-medium p-0 focus:ring-0 placeholder:text-gray-400 outline-none" 
                />
              </div>
            </div>
          ))}
        </div>
        
        <button 
          onClick={saveMappings} 
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-medium shadow-sm transition-colors focus:ring-2 focus:ring-blue-500/50"
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
};

export default Settings;
