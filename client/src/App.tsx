/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useGeolocation } from './hooks/useGeolocation';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Profile from './components/Profile';
import AdminPanel from './components/AdminPanel';
import BottomNav, { ViewType } from './components/BottomNav';
import ActiveHunt from './components/ActiveHunt';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Loader2, Map, User, Trophy, Shield } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAppReady, setIsAppReady] = useState(false);
  const [view, setView] = useState<ViewType>('hunt');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isSuperUser, setIsSuperUser] = useState(false);
  const { coords, error, loading } = useGeolocation();

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthLoading(false);
      setIsLoggedIn(!!session);

      // If logged in, set app ready after a short delay to allow socket connection
      if (session) {
        setTimeout(() => setIsAppReady(true), 1500);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthLoading(false);
      setIsLoggedIn(!!session);

      // If logged in, set app ready after a short delay
      if (session) {
        setTimeout(() => setIsAppReady(true), 1500);
      } else {
        setIsAppReady(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-[#0A0A0A]">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-white/50 font-mono text-sm uppercase tracking-widest animate-pulse">DEADDROP</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-bg-deep flex flex-col items-center justify-center p-0 lg:p-8">
        <div className="relative w-full h-screen lg:w-[400px] lg:h-[840px] bg-bg-card lg:rounded-[48px] border-none lg:border-[8px] lg:border-[#1a1a1a] flex flex-col overflow-hidden">
          <Login onLogin={() => setIsLoggedIn(true)} />
        </div>
      </div>
    );
  }

  if (!isAppReady) {
    return (
      <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-[#0A0A0A]">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-white/50 font-mono text-sm uppercase tracking-widest animate-pulse">DEADDROP</p>
      </div>
    );
  }

  if (error || !coords) {
    return (
      <div className="min-h-screen bg-bg-deep flex flex-col items-center justify-center p-8 text-center space-y-8">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-border-main shadow-2xl">
          <ShieldAlert className="w-8 h-8 text-white/40" />
        </div>
        <div className="space-y-4">
          <h1 className="text-text-main font-black text-4xl tracking-tighter uppercase leading-none">Uplink.Failure</h1>
          <p className="text-text-muted font-medium text-xs uppercase tracking-widest max-w-[240px]">Geospatial authorization is required to access the central terminal.</p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-10 py-4 bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-colors rounded-xl"
        >
          RETRY CONNECTION
        </button>
      </div>
    );
  }

  const renderContent = () => {
    if (view === 'hunt') {
      return (
        <ActiveHunt 
          initialCoords={{ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }}
          onBack={() => setView('dashboard')}
          theme={theme}
        />
      );
    }

    switch (view) {
      case 'dashboard': return <Dashboard onStartHunt={() => setView('hunt')} onToggleSuperUser={() => setIsSuperUser(!isSuperUser)} />;
      case 'profile': return <Profile onLogout={() => {
        supabase.auth.signOut();
        setIsLoggedIn(false);
      }} theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />;
      case 'admin': return <AdminPanel />;
      default: return <Dashboard onStartHunt={() => setView('hunt')} onToggleSuperUser={() => setIsSuperUser(!isSuperUser)} />;
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-[#0A0A0A] text-white font-sans">
      <div className="relative w-full h-full lg:w-[400px] lg:h-full lg:mx-auto bg-[#0A0A0A] lg:rounded-[48px] border-none lg:border-[8px] lg:border-[#1a1a1a] lg:shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
        
        {/* Notch Simulation */}
        <div className="hidden lg:flex absolute top-0 w-full justify-center items-start z-[60] pt-2">
          <div className="w-[124px] h-[30px] bg-[#1a1a1a] rounded-full"></div>
        </div>

        <div className="flex-1 flex flex-col pt-4 lg:pt-12 relative overflow-hidden">
          {view !== 'hunt' && (
            <header className="px-6 flex justify-between items-end border-b border-white/10 pb-4 mb-2">
              <div className="flex flex-col">
                <span className="text-2xl font-black uppercase tracking-tighter text-white">OPERATIVE DOSSIER</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Latency</span>
                <span className="text-xs font-black italic text-white">0.02ms</span>
              </div>
            </header>
          )}

          <main className="flex-1 flex flex-col min-h-0 bg-bg-deep">
            <AnimatePresence mode="wait">
              {renderContent()}
            </AnimatePresence>
          </main>

          {/* Global Floating Pill Navigation - Always Visible */}
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[85%] max-w-sm rounded-full bg-white/10 backdrop-blur-xl border border-white/10 shadow-2xl flex justify-between items-center px-6 py-4 z-[9999]">
            <button onClick={() => setView('dashboard')} className={`flex flex-col items-center gap-1 transition-opacity ${view === 'dashboard' ? 'opacity-100 text-blue-400' : 'opacity-50'}`}>
              <Trophy size={24} strokeWidth={view === 'dashboard' ? 2.5 : 2} />
            </button>
            <button onClick={() => setView('hunt')} className={`flex flex-col items-center gap-1 transition-opacity ${view === 'hunt' ? 'opacity-100 text-blue-400 scale-110' : 'opacity-50'}`}>
              <Map size={28} strokeWidth={view === 'hunt' ? 3 : 2} />
            </button>
            <button onClick={() => setView('profile')} className={`flex flex-col items-center gap-1 transition-opacity ${view === 'profile' ? 'opacity-100 text-blue-400' : 'opacity-50'}`}>
              <User size={24} strokeWidth={view === 'profile' ? 2.5 : 2} />
            </button>
            {isSuperUser && (
              <button onClick={() => setView('admin')} className={`flex flex-col items-center gap-1 transition-opacity ${view === 'admin' ? 'opacity-100 text-red-400' : 'opacity-50'}`}>
                <Shield size={24} strokeWidth={view === 'admin' ? 2.5 : 2} />
              </button>
            )}
          </div>
        </div>

        {/* Global Grainy Overlay */}
        <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.02] mix-blend-overlay overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-noise" />
        </div>
      </div>

      <div className="absolute top-10 right-10 text-right opacity-10 pointer-events-none hidden lg:block text-[10px] leading-relaxed uppercase font-mono tracking-widest">
        VAULT TERMINAL OS v4.1.0<br/>
        ENCRYPTION: 4096-BIT RSA<br/>
        UPLINK: SECURE_ALPHA_9<br/>
        SESSION: {Math.random().toString(16).slice(2, 10).toUpperCase()}
      </div>
    </div>
  );
}


