import { useState, useEffect, useCallback } from 'react';
import type { Config, Notify, Status } from './types';
import { api, errorMessage } from './api';
import Dashboard from './components/Dashboard';
import Record from './components/Record';
import Timers from './components/Timers';
import Rooms from './components/Rooms';
import Toasts, { type Toast } from './components/Toast';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'record', label: 'Record' },
  { id: 'timers', label: 'Timers' },
  { id: 'rooms', label: 'Rooms' },
] as const;
type Tab = typeof TABS[number]['id'];

const STATUS_POLL_MS = 20_000;
let nextToastId = 0;

const initialTab = (): Tab => {
  const hash = window.location.hash.slice(1);
  return (TABS.find(t => t.id === hash)?.id) ?? 'dashboard';
};

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify: Notify = useCallback((message, type = 'success') => {
    const id = nextToastId++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), type === 'error' ? 6000 : 3000);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api<Status>('GET', '/status'));
    } catch {
      setStatus(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setConfig(await api<Config>('GET', '/config'));
    } catch (e) {
      notify(`Failed to load settings: ${errorMessage(e)}`, 'error');
    }
    refreshStatus();
  }, [notify, refreshStatus]);

  useEffect(() => {
    api<Config>('GET', '/config').then(setConfig, e => notify(`Failed to load settings: ${errorMessage(e)}`, 'error'));
    api<Status>('GET', '/status').then(setStatus, () => setStatus(null));
    const id = setInterval(refreshStatus, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [notify, refreshStatus]);

  const selectTab = (tab: Tab) => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };

  const props = config ? { config, status, refresh, notify } : null;

  return (
    <div className="min-h-screen text-gray-900 pb-12 font-sans relative">
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200 mb-8 py-4">
        <div className="container mx-auto px-4 max-w-3xl flex flex-wrap gap-3 justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">IR Hub</h1>
            {status?.device_connected === false && (
              <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">USB device not found</span>
            )}
          </div>

          <div className="flex space-x-1 sm:space-x-2 bg-gray-100 p-1 rounded-xl">
            {TABS.map(item => (
              <button
                key={item.id}
                onClick={() => selectTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === item.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 max-w-3xl relative z-10">
        {!props && <p className="text-center text-gray-500 py-12">Loading…</p>}
        {props && activeTab === 'dashboard' && <Dashboard {...props} goTo={selectTab} />}
        {props && activeTab === 'record' && <Record {...props} />}
        {props && activeTab === 'timers' && <Timers {...props} />}
        {props && activeTab === 'rooms' && <Rooms {...props} />}
      </main>

      <Toasts toasts={toasts} />
    </div>
  );
}

export default App;
