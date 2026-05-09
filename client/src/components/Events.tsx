/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, TrendingUp, Target, X, Wallet, Activity, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Socket } from 'socket.io-client';

interface EventsProps {
  balance: number;
  socket: Socket | null;
  onNavigate?: (view: string, operationId?: string) => void;
  onRegisteredEventsChange?: (events: Array<{ id: string; start_time: string }>) => void;
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
}

export default function Events({ balance, socket, onNavigate, onRegisteredEventsChange }: EventsProps) {
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

  const canDeploy = (startTime: string): boolean => {
    const now = new Date();
    const start = new Date(startTime);
    const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
    return diffMinutes <= 5;
  };

  const handleDeploy = (eventId: string, startTime: string) => {
    if (!canDeploy(startTime)) {
      setToastMessage('Deployment authorized 5 minutes before T-Zero.');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    onNavigate?.('hunt', eventId);
  };

  useEffect(() => {
    loadEvents();
    loadRegisteredEvents();
    loadCurrentUser();
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
        .in('status', ['upcoming', 'live'])
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

  const handleConfirmJoin = async () => {
    setIsJoining(true);
    setModalError(null);

    try {
      if (!socket) {
        setModalError('Socket not connected');
        setIsJoining(false);
        return;
      }

      socket.emit('event:join', { eventId: selectedEvent });

      socket.on('event:join:success', () => {
        setIsJoining(false);
        setRegisteredEvents(prev => new Set([...prev, selectedEvent]));

        // Update local participants array immediately
        setEvents(prev => prev.map(event => {
          if (event.id === selectedEvent && currentUser) {
            return {
              ...event,
              participants: [...event.participants, { user_id: currentUser.id, username: currentUser.username || 'Unknown' }]
            };
          }
          return event;
        }));

        setSelectedEvent(null);
        loadRegisteredEvents();
      });

      socket.on('event:join:error', (error) => {
        setIsJoining(false);
        setModalError(error.message || 'Failed to join event');
      });
    } catch (err) {
      setIsJoining(false);
      setModalError('Failed to join event');
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
      return { text: '🔴 OPERATION LIVE', isLive: true };
    }

    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) {
      return { text: `STARTS IN ${diffMins} MINS`, isLive: false };
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return { text: `STARTS IN ${hours} HOURS`, isLive: false };
    } else {
      const days = Math.floor(diffMins / 1440);
      return { text: `STARTS IN ${days} DAYS`, isLive: false };
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-8 overflow-y-auto pb-32 bg-bg-deep relative">
      {/* Toast Message */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-4 right-4 z-50 bg-accent-orange text-white px-4 py-3 rounded-lg shadow-xl text-center font-black text-sm tracking-wider"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Hero Section - Statistics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
          <Wallet className="w-5 h-5 text-green-500" />
          <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">YOUR EQUITY</span>
          <span className="text-lg font-black text-green-500 tracking-tighter whitespace-nowrap">{balance.toLocaleString()} Kč</span>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
          <div className="relative">
            <Activity className="w-5 h-5 text-red-500" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          </div>
          <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">LIVE RUNNERS</span>
          <span className="text-lg font-black text-white tracking-tighter">142</span>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">GLOBAL BANK</span>
          <span className="text-lg font-black text-white tracking-tighter">125K</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col space-y-1">
        <h1 className="text-3xl font-black text-text-main tracking-tighter">ACTIVE DROPS</h1>
        <p className="text-xs font-medium text-text-muted uppercase tracking-widest">Live Operations</p>
      </div>

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
          {events.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-[#1C1C1E] rounded-[2.5rem] p-6 shadow-2xl space-y-6"
            >
              {/* Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${getTimeUntilEvent(event.start_time).isLive ? 'text-red-500' : 'text-red-500'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${getTimeUntilEvent(event.start_time).isLive ? 'text-red-500' : 'text-red-500'}`}>
                    {getTimeUntilEvent(event.start_time).text}
                  </span>
                </div>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-black text-white tracking-tight leading-none">
                {event.title}
              </h2>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">
                      PRIZE POOL
                    </span>
                  </div>
                  <span className="text-2xl font-black text-green-500 tracking-tighter">
                    {event.prize_pool.toLocaleString()} Kč
                  </span>
                </div>

                <div className="bg-black/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-text-muted" />
                    <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">
                      ENTRY
                    </span>
                  </div>
                  <span className="text-2xl font-black text-white tracking-tighter">
                    {event.entry_fee.toLocaleString()} Kč
                  </span>
                </div>
              </div>

              {/* FOMO Counter */}
              <div className="flex items-center justify-between bg-black/20 rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👥</span>
                  <span className="text-sm font-bold text-white">
                    {event.participants.length} / {event.max_participants} HUNTERS
                  </span>
                </div>
                <button
                  onClick={() => handleViewRoster(event.id)}
                  className="text-[10px] font-bold text-accent-orange hover:opacity-70 transition-opacity"
                >
                  + VIEW ROSTER
                </button>
              </div>

              {/* Enter Button */}
              {registeredEvents.has(event.id) ? (
                <button
                  onClick={() => handleDeploy(event.id, event.start_time)}
                  className={`w-full py-4 font-black text-lg rounded-full border border-white/10 transition-all ${
                    canDeploy(event.start_time)
                      ? 'bg-accent-orange text-white hover:brightness-110 active:scale-[0.98] shadow-xl shadow-accent-orange/10'
                      : 'bg-slate-800 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {canDeploy(event.start_time) ? 'DEPLOY TO ZONE' : 'REGISTERED ✓ (DEPLOY LOCKED)'}
                </button>
              ) : (
                <button
                  onClick={() => handleEnterEvent(event.id)}
                  className="w-full py-4 bg-accent-orange text-white font-black text-lg rounded-full hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-accent-orange/10 border border-white/10"
                >
                  ENTER EVENT
                </button>
              )}
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
                        ? `You are short ${shortage.toLocaleString()} CZK to enter this operation. Top up your balance.`
                        : modalError
                          ? modalError
                          : `Deduct ${event.entry_fee.toLocaleString()} CZK from your balance?`}
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
                      onClick={handleConfirmJoin}
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
                    <h2 className="text-xl font-black text-white tracking-tight">REGISTERED OPERATIVES</h2>
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
                      No operatives registered yet
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
  );
}
