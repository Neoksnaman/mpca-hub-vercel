import React, { useState, createContext, useMemo, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Engagements from './pages/Engagements';
import Operations from './pages/Operations';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import LoginPage from './components/LoginPage';
import { User, AppData, RetainerEngagement, SpecialEngagement, TaxCompliance, Client, ClientCredential, DeliverableLog, Service, ServiceTaxCompliance, RetainerDeadline, ProjectTask, ProjectActivity } from './types';
import { fetchAllData, logout as apiLogout } from './services/googleSheetsService';
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface AppContextType extends AppData {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  user: User | null;
  setUser: (user: User | null) => void;
  isLoading: boolean;
  refreshData: (silent?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  showToast: (message: string, type: 'success' | 'error') => void;
  playAudioCue: (type: 'success' | 'click' | 'chime', force?: boolean) => void;
  allUsers: User[]; // Rename from 'users' in AppData for clarity if needed, but AppData has 'users'
}

export const AppContext = createContext<AppContextType | null>(null);

const RootRedirect: React.FC = () => {
  const startTab = localStorage.getItem('startTab') || 'dashboard';
  if (startTab === 'engagements') return <Navigate to="/retainers" replace />;
  if (startTab === 'operations') return <Navigate to="/transmittals" replace />;
  return <Navigate to={`/${startTab}`} replace />;
};

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<User | null>(() => {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
  });
  
  const [appData, setAppData] = useState<AppData>({
    retainers: [],
    specials: [],
    taxes: [],
    users: [],
    clients: [],
    deliverables: [],
    services: [],
    taxCompliances: [],
    deadlines: [],
    retainerLogs: [],
    taskLog: [],
    activityLog: [],
    credentials: [],
    transmittals: [],
    meetings: [],
    notifications: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const playAudioCue = useCallback((type: 'success' | 'click' | 'chime', force = false) => {
    const isSoundEnabled = localStorage.getItem('pref_sound') !== 'false';
    if (!isSoundEnabled && !force) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      if (type === 'success') {
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now); // C5
        gain1.gain.setValueAtTime(0.08, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.3);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, now + 0.1); // E5
        gain2.gain.setValueAtTime(0.08, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.4);
      } else if (type === 'chime') {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.4);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'click') {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      }
    } catch (error) {
    }
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    if (type === 'success') {
      playAudioCue('success');
    } else {
      playAudioCue('chime');
    }
    setTimeout(() => setToast(null), 4000);
  }, [playAudioCue]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const refreshData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchAllData();
      setAppData(data);
    } catch (err: any) {
      if (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized')) {
          handleLogout();
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [user]);

  const handleLogout = useCallback(async () => {
      try {
          await apiLogout();
      } catch (e) {
      } finally {
          setUser(null);
          localStorage.removeItem('user');
      }
  }, []);

  const handleSetUser = (u: User | null) => {
      setUser(u);
      if (u) {
          localStorage.setItem('user', JSON.stringify(u));
      } else {
          localStorage.removeItem('user');
      }
  };

  useEffect(() => {
      if (user) {
          refreshData();
      }
  }, [user, refreshData]);
  
  const contextValue = useMemo(() => ({
      ...appData,
      allUsers: appData.users, // Mapping for backward compatibility
      theme,
      toggleTheme,
      user,
      setUser: handleSetUser,
      isLoading,
      refreshData,
      logout: handleLogout,
      showToast,
      playAudioCue
  }), [theme, user, appData, isLoading, refreshData, handleLogout, showToast, playAudioCue]);

  return (
    <AppContext.Provider value={contextValue}>
        <HashRouter>
          <div className="flex h-screen bg-neutral-light dark:bg-neutral-dark font-sans text-neutral-dark dark:text-neutral-light transition-colors duration-300">
            {user && <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />}
            <div className={`flex-1 flex flex-col overflow-hidden relative ${user ? '' : 'w-full'}`}>
              {user && <Header isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />}
              
              {isLoading && (
                  <div className="absolute inset-0 bg-white/30 dark:bg-gray-900/30 z-[15000] flex items-center justify-center backdrop-blur-[2px]">
                      <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-xl shadow-lg border border-neutral-medium dark:border-gray-700 flex items-center gap-3">
                        <Loader2 className="animate-spin text-primary" size={24} />
                        <span className="font-medium text-neutral-dark dark:text-white">Syncing database...</span>
                      </div>
                  </div>
              )}

              <main className={`flex-1 overflow-x-hidden overflow-y-auto ${user ? 'p-6' : ''}`}>
                <Routes>
                  <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
                  <Route path="/" element={user ? <RootRedirect /> : <Navigate to="/login" />} />
                  <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
                  <Route path="/clients" element={user ? <Clients /> : <Navigate to="/login" />} />
                  <Route path="/engagements" element={user ? <Navigate to="/retainers" replace /> : <Navigate to="/login" />} />
                  <Route path="/retainers" element={user ? <Engagements /> : <Navigate to="/login" />} />
                  <Route path="/special-projects" element={user ? <Engagements /> : <Navigate to="/login" />} />
                  <Route path="/operations" element={user ? <Navigate to="/transmittals" replace /> : <Navigate to="/login" />} />
                  <Route path="/transmittals" element={user ? <Operations /> : <Navigate to="/login" />} />
                  <Route path="/meetings" element={user ? <Operations /> : <Navigate to="/login" />} />
                  <Route path="/reports" element={user ? (user.role === 'Admin' ? <Reports /> : <Navigate to="/" />) : <Navigate to="/login" />} />
                  <Route path="/settings" element={user ? <Settings /> : <Navigate to="/login" />} />
                </Routes>
              </main>
            </div>
          </div>

          {/* Global Toast Notification */}
          {toast && (
            <div className="fixed top-6 right-6 z-[20000] animate-in slide-in-from-right-full duration-300">
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border ${
                toast.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800' 
                  : 'bg-rose-50 border-rose-200 dark:bg-rose-900/30 dark:border-rose-800'
              }`}>
                <div className={`p-1 rounded-full ${
                  toast.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-800/50' : 'bg-rose-100 dark:bg-rose-800/50'
                }`}>
                  {toast.type === 'success' ? (
                    <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={18} />
                  ) : (
                    <AlertCircle className="text-rose-600 dark:text-rose-400" size={18} />
                  )}
                </div>
                <p className={`text-sm font-semibold ${
                  toast.type === 'success' ? 'text-emerald-900 dark:text-emerald-100' : 'text-rose-900 dark:text-rose-100'
                }`}>
                  {toast.message}
                </p>
                <button 
                  onClick={() => setToast(null)}
                  className="ml-4 p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-secondary"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </HashRouter>
    </AppContext.Provider>
  );
};

export default App;
