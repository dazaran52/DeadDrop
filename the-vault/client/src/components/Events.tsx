/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Shield, Key as KeyIcon, Users, Clock, TrendingUp, RefreshCw, AlertTriangle } from 'lucide-react';

interface Event {
  id: string;
  title: string;
  status: 'upcoming' | 'live' | 'ended';
  prize_pool: number;
  entry_fee: number;
  required_keys: number;
  min_participants: number;
  max_participants: number;
  start_time: string;
  participants: { user_id: string; username: string }[];
}

interface EventsProps {
  onDeploy: (eventId: string) => void;
}

function getTimeUntilEvent(startTime: string): string {
  const now = new Date();
  const start = new Date(startTime);
  const diff = start.getTime() - now.getTime();
  if (diff <= 0) return 'NOW';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Events({ onDeploy }: EventsProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registeredEvents, setRegisteredEvents] = useState<Set<string>>(new Set());
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('events')
        .select('id, title, status, prize_pool, entry_fee, required_keys, min_participants, max_participants, start_time, participants')
        .neq('status', 'ended')
        .order('start_time', { ascending: true });
      if (err) throw err;
      setEvents((data as Event[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load operations');
    } finally {
      setLoading(false);
    }
  };

  const loadRegistered = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from('event_participants')
      .select('event_id')
      .eq('user_id', session.user.id);
    if (data) setRegisteredEvents(new Set(data.map((r: { event_id: string }) => r.event_id)));
  };

  useEffect(() => {
    loadEvents();
    loadRegistered();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = async (event: Event) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { showToast('NOT AUTHENTICATED'); return; }
    if (registeredEvents.has(event.id)) { showToast('ALREADY REGISTERED'); return; }
    if (event.participants.length >= event.max_participants) { showToast('OPERATION FULL'); return; }

    setJoiningId(event.id);
    try {
      const { error: err } = await supabase
        .from('event_participants')
        .insert({ event_id: event.id, user_id: session.user.id });
      if (err) throw err;
      setRegisteredEvents(prev => new Set([...prev, event.id]));
      setEvents(prev => prev.map(e =>
        e.id === event.id
          ? { ...e, participants: [...e.participants, { user_id: session.user.id, username: 'You' }] }
          : e
      ));
      showToast('REGISTERED — STANDBY FOR DEPLOYMENT');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'JOIN FAILED');
    } finally {
      setJoiningId(null);
    }
  };

  const statusColor = (s: string) => {
    if (s === 'live') return 'text-green-400 border-green-400/30 bg-green-400/10';
    if (s === 'upcoming') return 'text-accent-orange border-accent-orange/30 bg-accent-orange/10';
    return 'text-text-muted border-border-main bg-white/5';
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto pb-24 bg-bg-deep">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-main pb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent-orange" />
          <h1 className="text-xs font-black text-text-main uppercase tracking-widest italic">Active Drops</h1>
        </div>
        <button onClick={() => { loadEvents(); loadRegistered(); }} className="p-2 text-text-muted hover:text-text-main transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[200] bg-accent-orange text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <div className="w-6 h-6 border-2 border-accent-orange border-t-transparent rounded-full animate-spin" />
          <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Loading Operations...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 opacity-60" />
          <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">{error}</span>
          <button onClick={loadEvents} className="text-[9px] font-black text-accent-orange uppercase tracking-widest underline">RETRY</button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && events.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
          <Shield className="w-8 h-8 text-text-muted opacity-30" />
          <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">No Active Operations</span>
        </div>
      )}

      {/* Event Cards */}
      {!loading && !error && events.map((event, i) => {
        const isRegistered = registeredEvents.has(event.id);
        const isFull = event.participants.length >= event.max_participants;
        const isLive = event.status === 'live';
        const isJoining = joiningId === event.id;

        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="premium-panel bg-gradient-to-br from-bg-card to-bg-inner border border-border-main rounded-xl overflow-hidden"
          >
            {/* Card Header */}
            <div className="flex items-start justify-between p-4 pb-3 border-b border-border-main">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-black text-text-main uppercase tracking-tight leading-none">{event.title}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${statusColor(event.status)}`}>
                    {isLive ? '● LIVE' : `T-${getTimeUntilEvent(event.start_time)}`}
                  </span>
                </div>
              </div>
              {isRegistered && (
                <span className="text-[8px] font-black text-green-400 uppercase tracking-widest bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded">
                  ENLISTED
                </span>
              )}
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 divide-x divide-border-main">
              {/* REWARD POOL */}
              <div className="flex flex-col items-center justify-center p-3 gap-1">
                <TrendingUp className="w-3 h-3 text-accent-orange opacity-60" />
                <span className="text-[7px] font-black text-text-muted uppercase tracking-widest">REWARD POOL</span>
                <span className="text-[11px] font-black text-text-main">{event.prize_pool.toLocaleString()} <span className="text-accent-orange">DOX</span></span>
              </div>

              {/* TARGET KEYS */}
              <div className="flex flex-col items-center justify-center p-3 gap-1">
                <KeyIcon className="w-3 h-3 text-accent-orange opacity-60" />
                <span className="text-[7px] font-black text-text-muted uppercase tracking-widest">TARGET</span>
                <span className="text-[11px] font-black text-text-main">{event.required_keys} <span className="text-accent-orange">KEYS</span></span>
              </div>

              {/* HUNTERS */}
              <div className="flex flex-col items-center justify-center p-3 gap-1">
                <Users className="w-3 h-3 text-accent-orange opacity-60" />
                <span className="text-[7px] font-black text-text-muted uppercase tracking-widest">HUNTERS</span>
                <span className="text-[11px] font-black text-text-main">
                  {event.participants.length}/{event.max_participants}
                </span>
                <span className="text-[7px] font-mono text-text-muted">MIN: {event.min_participants}</span>
              </div>
            </div>

            {/* Footer: entry fee + time + action */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-main bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-text-muted" />
                  <span className="text-[9px] font-black text-text-muted uppercase">{new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {event.entry_fee > 0 && (
                  <span className="text-[9px] font-black text-accent-orange uppercase">{event.entry_fee} DOX</span>
                )}
              </div>

              {isLive && isRegistered ? (
                <button
                  onClick={() => onDeploy(event.id)}
                  className="px-4 py-2 bg-green-500 text-black text-[9px] font-black uppercase tracking-widest rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-green-500/20"
                >
                  DEPLOY
                </button>
              ) : isRegistered ? (
                <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">STANDBY</span>
              ) : isFull ? (
                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">FULL</span>
              ) : (
                <button
                  onClick={() => handleJoin(event)}
                  disabled={isJoining}
                  className="px-4 py-2 bg-accent-orange text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isJoining ? '...' : 'ENLIST'}
                </button>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
