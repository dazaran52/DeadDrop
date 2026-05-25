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
import Profile from './components/Profile';
import AliasInit from './components/AliasInit';
import AdminPanel from './components/AdminPanel';
import Events from './components/Events';
import { ViewType } from './components/BottomNav';
import ActiveHunt from './components/ActiveHunt';
import { AnimatePresence } from 'framer-motion';
import { ShieldAlert, Loader2, Map as MapIcon, User, Trophy, Shield } from 'lucide-react';
import { supabase } from './lib/supabase';
import { Socket } from 'socket.io-client';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAppReady, setIsAppReady] = useState(false);
  const [view, setView] = useState<ViewType>('events');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dd_theme') as 'dark' | 'light') || 'dark';
    }
    return 'dark';
  });
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [socketInstance] = useState<Socket | null>(null);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(() => typeof window !== 'undefined' ? localStorage.getItem('activeOperationId') : null);
  const [registeredEvents, setRegisteredEvents] = useState<Array<{ id: string; start_time: string }>>([]);

  // Calculate isAwaitingDeployment based on registered events
  const isAwaitingDeployment = registeredEvents.length > 0 && registeredEvents.some(event => {
    const now = new Date();
    const start = new Date(event.start_time);
    const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
    return diffMinutes > 5; // Still waiting for deployment window
  });

  // Save activeOperationId to localStorage
  useEffect(() => {
    if (activeOperationId) {
      localStorage.setItem('activeOperationId', activeOperationId);
    } else {
      localStorage.removeItem('activeOperationId');
    }
  }, [activeOperationId]);

  const { coords, error, loading } = useGeolocation();

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('dd_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (error || !coords) {
      const timeout = setTimeout(() => {
        setShowError(true);
      }, 5000);
      return () => clearTimeout(timeout);
    } else {
      setShowError(false);
    }
  }, [error, coords]);

  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthLoading(false);
      setIsLoggedIn(!!session);

      // If logged in, load initial data from Supabase
      if (session) {
        loadInitialData(session.user.id);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthLoading(false);
      setIsLoggedIn(!!session);

      if (session) {
        loadInitialData(session.user.id);
      } else {
        setIsAppReady(false);
        setBalance(0);
        setUsername(null);
        setUserId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadInitialData = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('balance, username, role, avatar_url')
        .eq('id', uid)
        .maybeSingle();

      if (error) {
        console.error('Supabase DB Error:', error);
        setUserId(uid);
        setIsAppReady(true);
        return;
      }

      // data is null when profile doesn't exist yet — show AliasInit
      setBalance(data?.balance ?? 0);
      setUsername(data?.username ?? null);
      setRole(data?.role ?? null);
      setAvatarUrl(data?.avatar_url ?? null);
      setIsSuperUser(data?.role === 'admin');
      setUserId(uid);
      setIsAppReady(true);
    } catch (err) {
      console.error('Error loading initial data:', err);
      setIsAppReady(true);
    }
  };


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

  // FORCE ALIAS: block all access until username is set
  if (isLoggedIn && userId && (!username || username.trim() === '')) {
    return (
      <AliasInit
        userId={userId}
        onComplete={(newUsername) => setUsername(newUsername)}
      />
    );
  }

  if ((error || !coords) && showError) {
    return (
      <div className="min-h-screen bg-bg-deep flex flex-col items-center justify-center p-8 text-center space-y-8">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-border-main shadow-2xl">
          <ShieldAlert className="w-8 h-8 text-white/40" />
        </div>
        <div className="space-y-4">
          <h1 className="text-text-main font-black text-4xl tracking-tighter uppercase leading-none">Location Required</h1>
          <p className="text-text-muted font-medium text-xs uppercase tracking-widest max-w-[240px]">Please enable location access to play DeadDrop.</p>
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
          onBack={() => setView('events')}
          onNavigate={(view, operationId) => {
            if (operationId) {
              setActiveOperationId(operationId);
            }
            setView(view as any);
          }}
          theme={theme}
          balance={balance}
          activeOperationId={activeOperationId}
          registeredEvents={registeredEvents}
          isAwaitingDeployment={isAwaitingDeployment}
        />
      );
    }

    switch (view) {
      case 'events': return <Events
        balance={balance}
        socket={socketInstance}
        activeOperationId={activeOperationId}
        onNavigate={(view, operationId) => {
          if (operationId) {
            setActiveOperationId(operationId);
          }
          setView(view as any);
        }}
        onRegisteredEventsChange={setRegisteredEvents}
        theme={theme}
      />;
      case 'profile': return <Profile onLogout={() => {
        supabase.auth.signOut();
        setIsLoggedIn(false);
      }} balance={balance} username={username} userId={userId} avatarUrl={avatarUrl} onUsernameChange={setUsername} onAvatarChange={setAvatarUrl} theme={theme} onThemeChange={setTheme} />;
      case 'admin': return <AdminPanel role={role} theme={theme} />;
      default: return <Events balance={balance} socket={socketInstance} onNavigate={(view, operationId) => {
        if (operationId) {
          setActiveOperationId(operationId);
        }
        setView(view as any);
      }} onRegisteredEventsChange={setRegisteredEvents} theme={theme} />;
    }
  };

  return (
    <div className={`fixed inset-0 w-full h-full overflow-hidden font-sans ${theme === 'dark' ? 'bg-[#0A0A0A] text-white' : 'bg-[#F2F2F7] text-gray-900'}`}>
      <div className={`relative w-full h-full lg:w-[400px] lg:h-full lg:mx-auto lg:rounded-[48px] border-none lg:border-[8px] lg:shadow-[0_40px_100px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-[#0A0A0A] lg:border-[#1a1a1a]' : 'bg-[#F2F2F7] lg:border-[#e0e0e0]'}`}>
        
        {/* Notch Simulation */}
        <div className="hidden lg:flex absolute top-0 w-full justify-center items-start z-[60] pt-2">
          <div className="w-[124px] h-[30px] bg-[#1a1a1a] rounded-full"></div>
        </div>

        <div className="flex-1 flex flex-col pt-4 lg:pt-12 relative overflow-hidden">
          {/* Reconnecting Badge */}

          {view !== 'hunt' && (
            <header className={`px-6 flex justify-between items-end pb-4 mb-2 border-b ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}>
              <div className="flex flex-col">
                <span className={`text-2xl font-black uppercase tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {view === 'events' ? 'Events' : view === 'profile' ? 'Profile' : view === 'admin' ? 'Admin' : 'Events'}
                </span>
              </div>
            </header>
          )}

          <main className="flex-1 flex flex-col min-h-0 bg-bg-deep">
            <AnimatePresence mode="wait">
              {renderContent()}
            </AnimatePresence>
          </main>

          {/* Global Floating Pill Navigation - Always Visible */}
          <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 w-[85%] max-w-sm rounded-full backdrop-blur-xl border shadow-2xl flex justify-between items-center px-6 py-3 z-[9999] ${theme === 'dark' ? 'bg-white/10 border-white/10' : 'bg-white/80 border-black/10'}`}>
            <button onClick={() => setView('events')} className={`flex flex-col items-center gap-1 transition-all ${view === 'events' ? 'opacity-100 text-accent-orange scale-105' : theme === 'dark' ? 'opacity-40' : 'opacity-40 text-gray-500'}`}>
              <Trophy size={22} strokeWidth={view === 'events' ? 2.5 : 2} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Events</span>
            </button>
            <button onClick={() => setView('hunt')} className={`flex flex-col items-center gap-1 transition-all ${view === 'hunt' ? 'opacity-100 text-blue-500 scale-105' : theme === 'dark' ? 'opacity-40' : 'opacity-40 text-gray-500'}`}>
              <MapIcon size={24} strokeWidth={view === 'hunt' ? 3 : 2} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Map</span>
            </button>
            <button onClick={() => setView('profile')} className={`flex flex-col items-center gap-1 transition-all ${view === 'profile' ? 'opacity-100 text-blue-500 scale-105' : theme === 'dark' ? 'opacity-40' : 'opacity-40 text-gray-500'}`}>
              <User size={22} strokeWidth={view === 'profile' ? 2.5 : 2} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Profile</span>
            </button>
            {isSuperUser && (
              <button onClick={() => setView('admin')} className={`flex flex-col items-center gap-1 transition-all ${view === 'admin' ? 'opacity-100 text-red-400 scale-105' : theme === 'dark' ? 'opacity-40' : 'opacity-40 text-gray-500'}`}>
                <Shield size={22} strokeWidth={view === 'admin' ? 2.5 : 2} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Admin</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}


