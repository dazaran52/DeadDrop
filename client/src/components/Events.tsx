/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, TrendingUp, Target, X, Wallet, Activity, User, RefreshCw, ArrowUp, ArrowDown, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Leaderboard from './Leaderboard';
import { Socket } from 'socket.io-client';

interface EventsProps {
  balance: number;
  socket: Socket | null;
  activeOperationId?: string | null;
  onNavigate?: (view: string, operationId?: string) => void;
  onRegisteredEventsChange?: (events: Array<{ id: string; start_time: string }>) => void;
  theme?: 'dark' | 'light';
  playerCoords?: { latitude: number; longitude: number } | null;
}

interface Participant {
  user_id: string;
  username: string;
}

interface Event {
  id: string;
  title: string;
  prize_pool: number;
  entry_fee: number;
  start_time: string;
  status: string;
  max_participants: number;
  participants: Participant[];
  required_keys?: number;
  city?: string | null;
  country?: string | null;
  country_code?: string | null;
  epicenter_lat?: number | null;
  epicenter_lng?: number | null;
}

export default function Events({ balance, socket, activeOperationId, onNavigate, onRegisteredEventsChange, theme = 'dark', playerCoords }: EventsProps) {
  const isDark = theme === 'dark';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [registeredEvents, setRegisteredEvents] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [rosterEventId, setRosterEventId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string | null } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'time' | 'entry' | 'diff'>('time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [touchStartY, setTouchStartY] = useState(0);
  const pullYRef = useRef(0);
  const [, setNowTick] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [liveCount, setLiveCount] = useState<number>(0);
  const [totalPrize, setTotalPrize] = useState<number>(0);
  const [countryFilter, setCountryFilter] = useState<string>('ALL');
  const [showAll, setShowAll] = useState(false);

  // 1s tick for live countdown
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Update live stats from real events data
  useEffect(() => {
    const live = events.filter(e => e.status === 'live').length;
    const prize = events.reduce((sum, e) => sum + (e.prize_pool || 0), 0);
    setLiveCount(live);
    setTotalPrize(prize);
  }, [events]);

  const getDifficulty = (requiredKeys?: number): { label: string; color: string; bg: string } => {
    if (!requiredKeys) return { label: 'N/A', color: 'text-gray-400', bg: 'bg-gray-500/20' };
    if (requiredKeys <= 2) return { label: 'EASY', color: 'text-green-400', bg: 'bg-green-500/20' };
    if (requiredKeys <= 4) return { label: 'MEDIUM', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
    return { label: 'HARD', color: 'text-red-500', bg: 'bg-red-500/20' };
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadEvents();
    await loadRegisteredEvents();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // iOS requires a native non-passive touchmove listener to call preventDefault
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      if (pullYRef.current > 10 && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  // Pull-to-Refresh handlers — attached to scroll container
  const handleTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) return;
    setTouchStartY(e.touches[0].clientY);
    setIsPulling(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!isPulling || !el || el.scrollTop > 0) {
      if (pullY > 0) setPullY(0);
      return;
    }
    const diff = e.touches[0].clientY - touchStartY;
    if (diff <= 0) {
      if (pullY > 0) setPullY(0);
      return;
    }
    // smooth resistance curve
    const d = Math.min(diff * 0.4, 80);
    setPullY(d);
    pullYRef.current = d;
    // preventDefault is handled by native listener above (iOS requirement)
  };

  const handleTouchEnd = () => {
    if (pullYRef.current > 45) handleRefresh();
    setPullY(0);
    pullYRef.current = 0;
    setIsPulling(false);
    setTouchStartY(0);
  };

  const canDeploy = (startTime: string): boolean => {
    const now = new Date();
    const start = new Date(startTime);
    const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
    return diffMinutes <= 5;
  };

  const handleDeploy = (eventId: string, startTime: string) => {
    if (!canDeploy(startTime)) {
      setToastMessage('Deployment opens 5 minutes before start');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    onNavigate?.('hunt', eventId);
  };

  const getEventDistance = (event: Event): number | null => {
    if (!playerCoords || !event.epicenter_lat || !event.epicenter_lng) return null;
    const R = 6371000;
    const dLat = (event.epicenter_lat - playerCoords.latitude) * Math.PI / 180;
    const dLng = (event.epicenter_lng - playerCoords.longitude) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(playerCoords.latitude * Math.PI / 180) * Math.cos(event.epicenter_lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    if (meters < 10000) return `${(meters / 1000).toFixed(1)}km`;
    return `${Math.round(meters / 1000)}km`;
  };

  const MAX_NEARBY_KM = 500_000; // 500km in meters

  const getSortedEvents = () => {
    const withDist = events.map(e => ({ e, dist: getEventDistance(e) }));

    // Primary sort: by distance if coords available, else by selected filter
    if (playerCoords && withDist.some(x => x.dist !== null)) {
      withDist.sort((a, b) => {
        if (a.dist === null && b.dist === null) return 0;
        if (a.dist === null) return 1;
        if (b.dist === null) return -1;
        return a.dist - b.dist;
      });
    } else {
      withDist.sort((a, b) => {
        if (filter === 'entry') return sortDirection === 'asc' ? a.e.entry_fee - b.e.entry_fee : b.e.entry_fee - a.e.entry_fee;
        if (filter === 'diff') return sortDirection === 'asc' ? (a.e.required_keys || 0) - (b.e.required_keys || 0) : (b.e.required_keys || 0) - (a.e.required_keys || 0);
        return sortDirection === 'asc'
          ? new Date(a.e.start_time).getTime() - new Date(b.e.start_time).getTime()
          : new Date(b.e.start_time).getTime() - new Date(a.e.start_time).getTime();
      });
    }

    const nearby = withDist.filter(x => x.dist === null || x.dist <= MAX_NEARBY_KM);
    const far = withDist.filter(x => x.dist !== null && x.dist > MAX_NEARBY_KM);

    return { nearby: nearby.map(x => x.e), far: far.map(x => x.e) };
  };

  const handleFilterClick = (newFilter: 'time' | 'entry' | 'diff') => {
    if (filter === newFilter) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setFilter(newFilter);
      setSortDirection('desc');
    }
  };

  useEffect(() => {
    loadEvents();
    loadRegisteredEvents();
    loadCurrentUser();

    // Surface any toast queued by other screens (e.g. ActiveHunt access denial)
    const queued = localStorage.getItem('lobbyToast');
    if (queued) {
      setToastMessage(queued);
      localStorage.removeItem('lobbyToast');
      setTimeout(() => setToastMessage(null), 3500);
    }
  }, []);

  const loadCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser({ id: user.id, username: user.user_metadata.username || null });
      }
    } catch (err) {
      console.error('Error loading current user:', err);
    }
  };

  const loadEvents = async () => {
    try {
      console.log('FETCH_START: Loading events');
      setFetchError(null);

      // Step 1: Load events without participants
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .in('status', ['live', 'upcoming'])
        .order('start_time', { ascending: true });

      console.log('FETCH_EVENTS_RESULT:', eventsData);
      console.log('FETCH_EVENTS_ERROR:', eventsError);

      if (eventsError) {
        console.error('FETCH_EVENTS_ERROR:', eventsError);
        setFetchError(JSON.stringify(eventsError));
        setEvents([]);
        setLoading(false);
        return;
      }

      if (!eventsData || eventsData.length === 0) {
        console.log('NO_EVENTS_FOUND');
        setEvents([]);
        setLoading(false);
        return;
      }

      // Step 2: Load participants for all events
      const eventIds = eventsData.map(e => e.id);
      const { data: participantsData, error: participantsError } = await supabase
        .from('event_participants')
        .select('event_id, user_id, profiles(username)')
        .in('event_id', eventIds);

      console.log('FETCH_PARTICIPANTS_RESULT:', participantsData);
      console.log('FETCH_PARTICIPANTS_ERROR:', participantsError);

      if (participantsError) {
        console.error('FETCH_PARTICIPANTS_ERROR:', participantsError);
        setFetchError(JSON.stringify(participantsError));
        setEvents([]);
        setLoading(false);
        return;
      }

      // Merge events with participants
      const eventsWithParticipants = eventsData.map(event => {
        const eventParticipants = (participantsData || [])
          .filter((p: any) => p.event_id === event.id)
          .map((p: any) => ({
            user_id: p.user_id,
            username: p.profiles?.username || 'Unknown'
          }));

        return {
          ...event,
          participants: eventParticipants
        };
      });

      console.log('PROCESSED_EVENTS:', eventsWithParticipants);
      setEvents(eventsWithParticipants);
      setFetchError(null);
    } catch (err) {
      console.error('FETCH_ERROR:', err);
      setFetchError(err instanceof Error ? err.message : String(err));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRegisteredEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('event_participants')
        .select('event_id')
        .eq('user_id', user.id);

      if (error) {
        console.error('Supabase DB Error:', error);
        return;
      }

      if (data) {
        const eventIds = data.map(p => p.event_id);
        setRegisteredEvents(new Set(eventIds));

        // Pass registered events with start times to parent
        const registeredEventsData = events
          .filter(e => eventIds.includes(e.id))
          .map(e => ({ id: e.id, start_time: e.start_time }));
        onRegisteredEventsChange?.(registeredEventsData);
      }
    } catch (err) {
      console.error('Error loading registered events:', err);
    }
  };

  const handleEnterEvent = (eventId: string) => {
    setSelectedEvent(eventId);
    setModalError(null);
  };

  const handleJoinEvent = async () => {
    setIsJoining(true);
    setModalError(null);

    try {
      const eventId = selectedEvent;
      if (!eventId) {
        setIsJoining(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setModalError('Not authenticated');
        setIsJoining(false);
        return;
      }

      // Atomic server-side transaction: balance check + insert participant
      const { error: rpcError } = await supabase.rpc('buy_ticket', {
        p_user_id: user.id,
        p_event_id: eventId,
      });

      if (rpcError) {
        alert(rpcError.message);
        setModalError(rpcError.message);
        setIsJoining(false);
        return;
      }

      // Success — optimistic local update so button flips to STANDBY immediately
      setRegisteredEvents((prev) => new Set([...prev, eventId]));
      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId && currentUser
            ? {
                ...event,
                participants: [
                  ...event.participants,
                  { user_id: currentUser.id, username: currentUser.username || 'Unknown' },
                ],
              }
            : event,
        ),
      );

      setSelectedEvent(null);
      setIsJoining(false);
      loadRegisteredEvents();
    } catch (err: any) {
      console.error('buy_ticket failed:', err);
      const msg = err?.message || 'Failed to buy ticket';
      alert(msg);
      setModalError(msg);
      setIsJoining(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedEvent(null);
    setModalError(null);
  };

  const handleViewRoster = (eventId: string) => {
    setRosterEventId(eventId);
  };

  const handleCloseRoster = () => {
    setRosterEventId(null);
  };

  const getTimeUntilEvent = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = start.getTime() - now.getTime();

    if (diffMs < 0) {
      return { text: 'WAITING FOR DEPLOYMENT', isLive: false };
    }

    const totalSec = Math.floor(diffMs / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');

    if (diffMs > 24 * 3600 * 1000) {
      const days = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      return { text: `IN ${days}D ${h}H`, isLive: false };
    }

    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return { text: `STARTS IN ${pad(h)}:${pad(m)}:${pad(s)}`, isLive: false };
  };

  const formatStartDate = (startTime: string): string => {
    const d = new Date(startTime);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex-1 flex flex-col relative overflow-hidden ${isDark ? 'bg-bg-deep' : 'bg-[#F2F2F7]'}`}>

      {/* Pull-to-refresh indicator — fixed above scroll content */}
      <div
        className="absolute top-0 left-0 right-0 flex justify-center items-end z-50 pointer-events-none"
        style={{
          height: Math.max(pullY, 0),
          opacity: Math.min(pullY / 45, 1),
          transition: pullY === 0 ? 'height 0.2s ease-out, opacity 0.2s ease-out' : 'none',
        }}
      >
        <RefreshCw
          className={`w-5 h-5 mb-2 ${isDark ? 'text-white/60' : 'text-gray-400'} ${pullY > 45 || isRefreshing ? 'animate-spin' : ''}`}
          style={{ transform: `rotate(${Math.min(pullY * 4, 360)}deg)` }}
        />
      </div>

      <div
        ref={scrollRef}
        className={`flex-1 flex flex-col p-6 gap-8 overflow-y-auto pb-32 relative`}
        style={{
          transform: `translateY(${pullY}px)`,
          transition: pullY === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
      {/* Toast Message */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-4 right-4 z-50 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-xl text-center text-sm"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Tabs */}
      <div className={`flex gap-2 rounded-xl p-1 ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
        {[
          { key: 'time' as const, label: 'TIME' },
          { key: 'entry' as const, label: 'ENTRY' },
          { key: 'diff' as const, label: 'KEYS' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleFilterClick(tab.key)}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              filter === tab.key
                ? 'bg-accent-orange text-white'
                : isDark ? 'text-white/40 hover:text-white/60' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
            {filter === tab.key && (
              sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
            )}
          </button>
        ))}
      </div>

      {/* Hero Section - Statistics */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`border rounded-2xl p-4 flex flex-col items-center justify-center space-y-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-black/10 shadow-sm'}`}>
          <Wallet className="w-5 h-5 text-green-500" />
          <span className={`text-[8px] font-bold uppercase tracking-widest ${isDark ? 'text-text-muted' : 'text-gray-500'}`}>Balance</span>
          <span className="text-lg font-black text-green-500 tracking-tighter whitespace-nowrap">{balance.toLocaleString()} DOX</span>
        </div>
        <div className={`border rounded-2xl p-4 flex flex-col items-center justify-center space-y-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-black/10 shadow-sm'}`}>
          <div className="relative">
            <Activity className="w-5 h-5 text-red-500" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          </div>
          <span className={`text-[8px] font-bold uppercase tracking-widest ${isDark ? 'text-text-muted' : 'text-gray-500'}`}>Live Events</span>
          <span className={`text-lg font-black tracking-tighter ${isDark ? 'text-white' : 'text-gray-900'}`}>{liveCount}</span>
        </div>
        <div className={`border rounded-2xl p-4 flex flex-col items-center justify-center space-y-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-black/10 shadow-sm'}`}>
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <span className={`text-[8px] font-bold uppercase tracking-widest ${isDark ? 'text-text-muted' : 'text-gray-500'}`}>Total Prizes</span>
          <span className={`text-lg font-black tracking-tighter ${isDark ? 'text-white' : 'text-gray-900'}`}>{totalPrize > 0 ? `${(totalPrize / 1000).toFixed(0)}K` : '—'} DOX</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col space-y-1">
          <h1 className={`text-3xl font-black tracking-tighter ${isDark ? 'text-text-main' : 'text-gray-900'}`}>Active Events</h1>
          <p className={`text-xs font-medium uppercase tracking-widest ${isDark ? 'text-text-muted' : 'text-gray-500'}`}>Find & join a game</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLeaderboard(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-yellow-300 hover:bg-yellow-400/15 transition-colors"
            title="Leaderboard"
          >
            <Trophy className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Leaders</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`p-2 rounded-full transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10'}`}
          >
            <RefreshCw className={`w-5 h-5 ${isDark ? 'text-white' : 'text-gray-700'} ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <Leaderboard
        open={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        currentUserId={currentUser?.id}
      />

      {/* Event Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-white/50 text-sm uppercase tracking-widest animate-pulse">Loading Operations...</div>
        </div>
      ) : fetchError ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-red-500 text-sm font-black font-mono uppercase tracking-widest text-center">
            SYSTEM ERROR: {fetchError}
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-text-muted text-sm font-black uppercase tracking-widest text-center">
            NO ACTIVE OPERATIONS.<br/>CHECK BACK LATER.
          </div>
        </div>
      ) : (
        <div className="space-y-6">

          {getSortedEvents().nearby.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`rounded-[2.5rem] p-6 shadow-md space-y-6 ${isDark ? 'bg-[#1C1C1E] shadow-black/50' : 'bg-white border border-black/[0.07] shadow-black/5'}`}
            >
              {/* Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {event.status === 'upcoming' ? (() => {
                    const t = getTimeUntilEvent(event.start_time);
                    const isWaiting = t.text === 'WAITING FOR DEPLOYMENT';
                    return (
                      <>
                        <Clock className={`w-4 h-4 ${isWaiting ? 'text-red-500' : 'text-yellow-400'}`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isWaiting ? 'text-red-500' : 'text-yellow-400'}`}>
                          {t.text}
                        </span>
                      </>
                    );
                  })() : (
                    <>
                      <Clock className="w-4 h-4 text-red-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-500">
                        🔴 OPERATION LIVE
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {event.status === 'upcoming' && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400 bg-yellow-500/10 border border-yellow-500/40 px-2 py-0.5 rounded">
                      SCHEDULED
                    </span>
                  )}
                  {event.status === 'live' && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/40 px-2 py-0.5 rounded animate-pulse">
                      LIVE
                    </span>
                  )}
                  {registeredEvents.has(event.id) && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-green-500">
                      ENTERED ✓
                    </span>
                  )}
                </div>
              </div>

              {/* Difficulty Row */}
              {event.required_keys && (
                <div className="flex flex-row gap-2 mb-2">
                  <span className={`${getDifficulty(event.required_keys).bg} ${getDifficulty(event.required_keys).color} px-2 py-1 rounded text-xs font-bold tracking-wide`}>
                    {getDifficulty(event.required_keys).label}
                  </span>
                  <span className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 px-2 py-1 rounded text-xs font-mono">
                    TARGET: {event.required_keys} KEYS
                  </span>
                </div>
              )}
              <h2 className={`text-2xl font-black tracking-tight leading-none ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {event.title}
              </h2>

              {/* Start date always visible */}
              <div className={`flex items-center gap-1.5 text-[10px] tracking-wider font-mono ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                <span>📅</span>
                <span>{formatStartDate(event.start_time)}</span>
              </div>

              {/* Location — always visible, styled by proximity */}
              {(() => {
                const dist = getEventDistance(event);
                const isNear = dist !== null && dist < 50_000;
                const hasLocation = event.city || event.country;
                if (isNear) {
                  return (
                    <div className="flex items-center gap-1.5 text-[10px] tracking-wider font-bold text-accent-orange">
                      <span>📍</span>
                      <span>
                        {[event.city, event.country_code].filter(Boolean).join(', ')}
                        {dist !== null && <span className="ml-1">· {formatDistance(dist)}</span>}
                      </span>
                    </div>
                  );
                }
                return (
                  <div className={`flex items-center gap-1.5 text-[10px] tracking-wider ${isDark ? 'text-white/25' : 'text-gray-400/60'}`}>
                    <span>📍</span>
                    <span>
                      {hasLocation
                        ? [event.city, event.country_code].filter(Boolean).join(', ')
                        : 'Location TBD'}
                      {dist !== null && <span className="ml-1">· {formatDistance(dist)}</span>}
                    </span>
                  </div>
                );
              })()}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`rounded-2xl p-4 space-y-2 ${isDark ? 'bg-black/20' : 'bg-gray-50 border border-black/[0.06]'}`}>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className={`text-[8px] font-bold uppercase tracking-widest ${isDark ? 'text-text-muted' : 'text-gray-500'}`}>
                      REWARD POOL
                    </span>
                  </div>
                  <span className="text-2xl font-black text-green-500 tracking-tighter">
                    {event.prize_pool.toLocaleString()} DOX
                  </span>
                </div>

                <div className={`rounded-2xl p-4 space-y-2 ${isDark ? 'bg-black/20' : 'bg-gray-50 border border-black/[0.06]'}`}>
                  <div className="flex items-center gap-2">
                    <Target className={`w-4 h-4 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} />
                    <span className={`text-[8px] font-bold uppercase tracking-widest ${isDark ? 'text-text-muted' : 'text-gray-500'}`}>
                      ENTRY
                    </span>
                  </div>
                  <span className={`text-2xl font-black tracking-tighter ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {event.entry_fee.toLocaleString()} DOX
                  </span>
                </div>
              </div>

              {/* FOMO Counter */}
              <div className={`flex items-center justify-between rounded-2xl p-4 ${isDark ? 'bg-black/20' : 'bg-gray-50 border border-black/[0.06]'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">👥</span>
                  <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {event.participants.length} / {event.max_participants} players
                  </span>
                </div>
                <button
                  onClick={() => handleViewRoster(event.id)}
                  className="text-[10px] font-bold text-accent-orange hover:opacity-70 transition-opacity"
                >
                  + VIEW ROSTER
                </button>
              </div>

              {/* Button state machine: separates ENTRY (payment) from ACCESS (deploy) */}
              {(() => {
                const isRegistered = registeredEvents.has(event.id);
                const isLive = event.status === 'live';
                const isActiveOp = activeOperationId === event.id;
                const timerText = getTimeUntilEvent(event.start_time).text;

                // Active operation in progress — RESUME wins
                if (isActiveOp) {
                  return (
                    <button
                      onClick={() => onNavigate?.('hunt', event.id)}
                      className="w-full py-4 font-black text-lg rounded-full border bg-green-500 text-white hover:brightness-110 active:scale-[0.98] shadow-md shadow-green-500/50 border-white/10 animate-pulse"
                    >
                      RESUME
                    </button>
                  );
                }

                // STATE 1: upcoming + !registered → BUY TICKET (active)
                if (!isLive && !isRegistered) {
                  return (
                    <button
                      onClick={() => handleEnterEvent(event.id)}
                      className="w-full py-4 bg-accent-orange text-white font-black text-lg rounded-full hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-accent-orange/10 border border-white/10"
                    >
                      BUY TICKET: {event.entry_fee.toLocaleString()} DOX
                    </button>
                  );
                }

                // STATE 2: upcoming + registered → STANDBY, but unlock at T-5 to PREPARE FOR DEPLOYMENT
                if (!isLive && isRegistered) {
                  const diffMs = new Date(event.start_time).getTime() - Date.now();
                  const isPreDeploy = diffMs <= 5 * 60 * 1000;
                  if (isPreDeploy) {
                    return (
                      <button
                        onClick={() => onNavigate?.('hunt', event.id)}
                        className="w-full py-4 font-black text-lg rounded-full border bg-green-500 text-white hover:brightness-110 active:scale-[0.98] shadow-md shadow-green-500/50 border-white/10 animate-pulse"
                      >
                        PREPARE FOR DEPLOYMENT
                      </button>
                    );
                  }
                  return (
                    <button
                      disabled
                      className="w-full py-4 bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 font-black text-lg rounded-full cursor-not-allowed tracking-wider"
                    >
                      STANDBY · {timerText.replace('STARTS IN ', '').replace('WAITING FOR DEPLOYMENT', 'AWAITING SIGNAL')}
                    </button>
                  );
                }

                // STATE 3: live + registered → DEPLOY TO MAP (active, green)
                if (isLive && isRegistered) {
                  return (
                    <button
                      onClick={() => onNavigate?.('hunt', event.id)}
                      className="w-full py-4 font-black text-lg rounded-full border bg-green-500 text-white hover:brightness-110 active:scale-[0.98] shadow-md shadow-green-500/50 border-white/10 animate-pulse"
                    >
                      DEPLOY TO MAP
                    </button>
                  );
                }

                // STATE 4: live + !registered → LATE ENTRY (active, orange)
                return (
                  <button
                    onClick={() => handleEnterEvent(event.id)}
                    className="w-full py-4 bg-accent-orange text-white font-black text-lg rounded-full hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-accent-orange/10 border border-white/10"
                  >
                    LATE ENTRY: {event.entry_fee.toLocaleString()} DOX
                  </button>
                );
              })()}
            </motion.div>
          ))}

          {/* Show All worldwide button */}
          {getSortedEvents().far.length > 0 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className={`w-full py-4 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all border ${
                isDark ? 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white' : 'bg-black/5 border-black/10 text-gray-500 hover:bg-black/10 hover:text-gray-700'
              }`}
            >
              🌍 Show all worldwide events ({getSortedEvents().far.length} more)
            </button>
          )}

          {/* Far events (other countries) */}
          {showAll && getSortedEvents().far.map((event, index) => (
            <motion.div
              key={event.id + '-far'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`rounded-[2.5rem] p-6 shadow-md space-y-3 opacity-80 ${isDark ? 'bg-[#1C1C1E] shadow-black/50' : 'bg-white border border-black/[0.07] shadow-black/5'}`}
            >
              <div className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-white/30' : 'text-gray-400'}`}>🌍 International</div>
              <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>{event.title}</h2>
              {(event.city || event.country) && (
                <div className={`flex items-center gap-1.5 text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                  <span>📍</span>
                  <span>
                    {[event.city, event.country].filter(Boolean).join(', ')}
                    {getEventDistance(event) !== null && (
                      <span className="ml-1 text-accent-orange font-bold"> · {formatDistance(getEventDistance(event)!)}</span>
                    )}
                  </span>
                </div>
              )}
              <div className={`flex gap-3 text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                <span className="text-green-500 font-bold">{event.prize_pool.toLocaleString()} DOX</span>
                <span>·</span>
                <span>Entry: {event.entry_fee.toLocaleString()} DOX</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Payment Modal */}
      <AnimatePresence>
        {selectedEvent !== null && (() => {
          const event = events.find(e => e.id === selectedEvent);
          if (!event) return null;

          const insufficientFunds = balance < event.entry_fee;
          const shortage = event.entry_fee - balance;

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6"
              onClick={handleCloseModal}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className={`rounded-3xl p-6 w-full max-w-sm ${insufficientFunds ? 'bg-red-950/50 border-2 border-red-500/50' : 'bg-[#1C1C1E]'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className={`text-2xl font-black tracking-tight ${insufficientFunds ? 'text-red-500' : 'text-white'}`}>
                      {insufficientFunds ? 'INSUFFICIENT FUNDS' : 'CONFIRM ENTRY'}
                    </h2>
                    <p className="text-sm text-text-muted mt-2">
                      {insufficientFunds
                        ? `You are short ${shortage.toLocaleString()} DOX to enter this operation. Top up your balance.`
                        : modalError
                          ? modalError
                          : `Deduct ${event.entry_fee.toLocaleString()} DOX from your balance?`}
                    </p>
                  </div>
                  <button
                    onClick={handleCloseModal}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleCloseModal}
                    className="flex-1 py-3 bg-gray-700 text-white font-bold rounded-full hover:bg-gray-600 transition-colors"
                  >
                    CANCEL
                  </button>
                  {!insufficientFunds && !modalError && (
                    <button
                      onClick={handleJoinEvent}
                      disabled={isJoining}
                      className={`flex-1 py-3 font-bold rounded-full transition-colors ${isJoining ? 'bg-green-600 text-white/70 cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'}`}
                    >
                      {isJoining ? 'PROCESSING...' : 'CONFIRM'}
                    </button>
                  )}
                  {insufficientFunds && (
                    <button
                      onClick={handleCloseModal}
                      className="flex-1 py-3 bg-red-500 text-white font-bold rounded-full hover:bg-red-600 transition-colors"
                    >
                      TOP UP BALANCE
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Roster Modal (Bottom Sheet) */}
      <AnimatePresence>
        {rosterEventId !== null && (() => {
          const event = events.find(e => e.id === rosterEventId);
          if (!event) return null;

          return (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md z-[99999]"
                onClick={handleCloseRoster}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 z-[99999] bg-[#18181B] rounded-t-3xl border-t border-white/10 p-6"
              >
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-black text-white tracking-tight">REGISTERED PLAYERS</h2>
                    <p className="text-sm text-text-muted mt-1">
                      {event.participants.length} / {event.max_participants}
                    </p>
                  </div>
                  <button
                    onClick={handleCloseRoster}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto pb-8">
                  {event.participants.length === 0 ? (
                    <div className="text-center py-8 text-text-muted text-sm">
                      No players registered yet
                    </div>
                  ) : (
                    event.participants.map((participant) => {
                      const isCurrentUser = currentUser?.id === participant.user_id;
                      return (
                        <div
                          key={participant.user_id}
                          className={`flex items-center gap-3 p-3 rounded-xl ${isCurrentUser ? 'bg-green-500/10 border border-green-500/30' : 'bg-white/5'}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                            <User size={16} className={isCurrentUser ? 'text-green-500' : 'text-white'} />
                          </div>
                          <span className={`font-mono text-sm ${isCurrentUser ? 'text-green-500 font-bold' : 'text-white'}`}>
                            {participant.username}
                            {isCurrentUser && <span className="ml-2 text-xs font-normal">(YOU)</span>}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>
      </div>
    </div>
  );
}
