import { useState, useEffect } from 'react';
import type { Config } from './types';
import Dashboard from './components/Dashboard';
import Record from './components/Record';
import Timers from './components/Timers';
import Settings from './components/Settings';
import Toast from './components/Toast';

export type Notification = { show: boolean; message: string; type: 'success' | 'error' };

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'record' | 'timers' | 'settings'>('dashboard');
  const [config, setConfig] = useState<Config>({ commands: {}, timers: [], mappings: { "1": "", "2": "", "3": "" } });
  const [notification, setNotification] = useState<Notification>({ show: false, message: '', type: 'success' });

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (!data.mappings["1"]) data.mappings["1"] = "";
      if (!data.mappings["2"]) data.mappings["2"] = "";
      if (!data.mappings["3"]) data.mappings["3"] = "";
      setConfig(data);
    } catch (e) {
      console.error(e);
      notify("Failed to fetch config", "error");
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'record', label: 'Record' },
    { id: 'timers', label: 'Timers' },
    { id: 'settings', label: 'Settings' }
  ] as const;

  return (
    <div className="min-h-screen text-gray-900 pb-12 font-sans relative">
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200 mb-8 py-4">
        <div className="container mx-auto px-4 max-w-3xl flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">IR Hub</h1>
          </div>
          
          <div className="flex space-x-1 sm:space-x-2 bg-gray-100 p-1 rounded-xl">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === item.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 max-w-3xl relative z-10">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {activeTab === 'dashboard' && <Dashboard config={config} fetchConfig={fetchConfig} notify={notify} />}
          {activeTab === 'record' && <Record config={config} fetchConfig={fetchConfig} notify={notify} />}
          {activeTab === 'timers' && <Timers config={config} fetchConfig={fetchConfig} notify={notify} />}
          {activeTab === 'settings' && <Settings config={config} fetchConfig={fetchConfig} notify={notify} />}
        </div>
      </main>

      <Toast notification={notification} />
    </div>
  );
}

export default App;
