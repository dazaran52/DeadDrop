/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, TrendingUp, Target, X, Wallet, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface EventsProps {
  balance: number;
}

interface Event {
  id: string;
  title: string;
  prize_pool: number;
  entry_fee: number;
  start_time: string;
  status: string;
}

export default function Events({ balance }: EventsProps) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [registeredEvents, setRegisteredEvents] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'upcoming')
        .order('start_time', { ascending: true });

      if (error) {
        console.error('Error loading events:', error);
        setEvents([]);
      } else {
        setEvents(data || []);
      }
    } catch (err) {
      console.error('Error loading events:', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEnterEvent = (eventId: string) => {
    setSelectedEvent(eventId);
  };

  const handleConfirmRegistration = () => {
    if (selectedEvent !== null) {
      setRegisteredEvents(prev => new Set(prev).add(selectedEvent));
      setSelectedEvent(null);
    }
  };

  const handleCloseModal = () => {
    setSelectedEvent(null);
  };

  const getTimeUntilEvent = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = start.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) {
      return `STARTS IN ${diffMins} MINS`;
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `STARTS IN ${hours} HOURS`;
    } else {
      const days = Math.floor(diffMins / 1440);
      return `STARTS IN ${days} DAYS`;
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto pb-32 bg-bg-deep">
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
                  <Clock className="w-4 h-4 text-red-500" />
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                    {getTimeUntilEvent(event.start_time)}
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

              {/* Enter Button */}
              {registeredEvents.has(event.id) ? (
                <button
                  disabled
                  className="w-full py-4 bg-gray-700 text-gray-400 font-black text-lg rounded-full cursor-not-allowed border border-white/10"
                >
                  REGISTERED ✓
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
        {selectedEvent !== null && (
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
              className="bg-[#1C1C1E] rounded-3xl p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">CONFIRM ENTRY</h2>
                  <p className="text-sm text-text-muted mt-2">
                    Deduct {events.find(e => e.id === selectedEvent)?.entry_fee.toLocaleString()} CZK from your balance?
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
                <button
                  onClick={handleConfirmRegistration}
                  className="flex-1 py-3 bg-green-500 text-white font-bold rounded-full hover:bg-green-600 transition-colors"
                >
                  CONFIRM
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
