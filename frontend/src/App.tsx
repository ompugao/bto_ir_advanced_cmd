import { useState, useEffect, useCallback } from 'react';
import type { Config, Notify, PageProps, Status } from './types';
import { api, errorMessage } from './api';
import { muted } from './ui';
import Home from './components/home/Home';
import Routines from './components/routines/Routines';
import Settings from './components/settings/Settings';
import Toasts, { type Toast } from './components/Toast';
import Icon, { type IconName } from './components/ui/Icon';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'routines', label: 'Routines', icon: 'routines' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const STATUS_POLL_MS = 20_000;
let nextToastId = 0;

const currentRoute = () => window.location.hash.slice(1) || 'home';

function App() {
  const [route, setRoute] = useState(currentRoute);
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify: Notify = useCallback((message, type = 'success') => {
    const id = nextToastId++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), type === 'error' ? 6000 : 2500);
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
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => {
      clearInterval(id);
      window.removeEventListener('hashchange', onHash);
    };
  }, [notify, refreshStatus]);

  const navigate = useCallback((to: string) => {
    window.location.hash = to;
    window.scrollTo({ top: 0 });
  }, []);

  const [tab, sub] = route.split('/');
  const props: PageProps | null = config ? { config, status, refresh, notify, navigate } : null;

  const tabButton = (t: typeof TABS[number], mobile: boolean) => {
    const active = tab === t.id;
    return (
      <button
        key={t.id}
        onClick={() => navigate(t.id)}
        aria-current={active ? 'page' : undefined}
        className={mobile
          ? `flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-blue-600 dark:text-blue-400' : muted}`
          : `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm' : `${muted} hover:text-gray-900 dark:hover:text-gray-100`}`}
      >
        <Icon name={t.icon} className={mobile ? 'w-6 h-6' : 'w-4 h-4'} />
        {t.label}
      </button>
    );
  };

  return (
    <div className="min-h-screen pb-24 md:pb-12">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <Icon name="signal" className="w-4 h-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">IR Hub</span>
          </div>
          <nav className="hidden md:flex gap-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">{TABS.map(t => tabButton(t, false))}</nav>
        </div>
      </header>

      {status?.device_connected === false && (
        <div className="bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
          <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-2">
            <Icon name="alert" className="w-4 h-4 shrink-0" /> USB IR receiver not found — buttons and routines can't be sent.
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pt-6">
        {!props && <p className={`text-center py-12 ${muted}`}>Loading…</p>}
        {props && tab === 'home' && <Home {...props} />}
        {props && tab === 'routines' && <Routines {...props} />}
        {props && tab === 'settings' && <Settings {...props} roomId={sub} />}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 flex pb-[env(safe-area-inset-bottom)]">
        {TABS.map(t => tabButton(t, true))}
      </nav>

      <Toasts toasts={toasts} />
    </div>
  );
}

export default App;
