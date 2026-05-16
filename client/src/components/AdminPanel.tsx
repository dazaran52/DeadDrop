/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import {
  Shield,
  Loader2,
  Plus,
  Trash2,
  StopCircle,
  Calendar,
  Coins,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Zap,
} from 'lucide-react';

interface AdminPanelProps {
  role: string | null;
}

interface AdminEvent {
  id: string;
  title: string;
  prize_pool: number;
  entry_fee: number;
  start_time: string;
  status: string;
}

export default function AdminPanel({ role }: AdminPanelProps) {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Create form
  const [title, setTitle] = useState('');
  const [prizePool, setPrizePool] = useState('');
  const [entryFee, setEntryFee] = useState('');
  const [startTime, setStartTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('events')
      .select('id, title, prize_pool, entry_fee, start_time, status')
      .in('status', ['live', 'upcoming'])
      .order('start_time', { ascending: true });

    if (dbError) {
      console.error('AdminPanel fetch error:', dbError);
      setError(dbError.message);
      setLoading(false);
      return;
    }

    setEvents((data as AdminEvent[]) || []);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    if (role === 'admin') fetchEvents();
  }, [role]);

  // Hard gate
  if (role !== 'admin') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#09090B] text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/5 border border-red-500/30 flex items-center justify-center mb-6">
          <Lock className="w-7 h-7 text-red-400" />
        </div>
        <h2 className="text-xl font-light text-white mb-2">Restricted</h2>
        <p className="text-xs text-white/40 tracking-wider max-w-xs">
          You don't have administrator privileges to access this panel.
        </p>
      </div>
    );
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const prize = Number(prizePool);
    const fee = Number(entryFee);
    if (!title.trim() || isNaN(prize) || isNaN(fee) || !startTime) {
      setToast({ kind: 'err', msg: 'All fields are required and numeric where applicable' });
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from('events').insert({
      title: title.trim(),
      prize_pool: prize,
      entry_fee: fee,
      start_time: new Date(startTime).toISOString(),
      status: 'upcoming',
    });

    if (insertError) {
      console.error('Insert event error:', insertError);
      setToast({ kind: 'err', msg: `${insertError.message} (${insertError.code})` });
      setSubmitting(false);
      return;
    }

    setToast({ kind: 'ok', msg: 'Operation deployed to grid' });
    setTitle('');
    setPrizePool('');
    setEntryFee('');
    setStartTime('');
    setSubmitting(false);
    fetchEvents();
  };

  const handleEndEvent = async (id: string) => {
    if (!confirm('End this event? It will be marked as completed.')) return;
    const { error: updErr } = await supabase
      .from('events')
      .update({ status: 'completed' })
      .eq('id', id);

    if (updErr) {
      setToast({ kind: 'err', msg: updErr.message });
      return;
    }
    setToast({ kind: 'ok', msg: 'Event ended' });
    fetchEvents();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('PERMANENTLY DELETE this event? This cannot be undone.')) return;
    const { error: delErr } = await supabase.from('events').delete().eq('id', id);

    if (delErr) {
      setToast({ kind: 'err', msg: delErr.message });
      return;
    }
    setToast({ kind: 'ok', msg: 'Event deleted' });
    fetchEvents();
  };

  const handleForceStart = async (id: string) => {
    if (!confirm('FORCE START this event now? Status will be set to LIVE.')) return;
    const { error: updErr } = await supabase
      .from('events')
      .update({ status: 'live' })
      .eq('id', id);

    if (updErr) {
      setToast({ kind: 'err', msg: updErr.message });
      return;
    }
    setToast({ kind: 'ok', msg: 'Event forced live' });
    fetchEvents();
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto pb-32 bg-[#09090B]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-light text-white tracking-tight">Command Center</h1>
          <p className="text-[10px] text-white/40 tracking-[0.25em] uppercase">Admin · Live Operations</p>
        </div>
      </div>

      {/* CREATE OPERATION */}
      <form
        onSubmit={handleCreate}
        className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-green-400" />
          <span className="text-[10px] text-white/60 tracking-[0.25em] uppercase">Create Operation</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-white/40 tracking-wider uppercase block mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Prague Vault Run"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-white/40 tracking-wider uppercase block mb-1.5">Prize Pool (CZK)</label>
              <input
                type="number"
                value={prizePool}
                onChange={(e) => setPrizePool(e.target.value)}
                placeholder="10000"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40 tracking-wider uppercase block mb-1.5">Entry Fee (CZK)</label>
              <input
                type="number"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                placeholder="500"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white/40 tracking-wider uppercase block mb-1.5">Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-green-500/10 border border-green-500/40 text-green-300 text-sm tracking-wider rounded-xl hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span>{submitting ? 'Deploying…' : 'Deploy Operation'}</span>
        </button>
      </form>

      {/* EVENTS DASHBOARD */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/60 tracking-[0.25em] uppercase">Live & Upcoming</span>
          <button
            onClick={fetchEvents}
            className="text-[10px] text-white/40 hover:text-white tracking-wider uppercase transition-colors"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-500/5 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-center text-xs text-white/40 tracking-wider">
            No active or upcoming operations.
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{ev.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/40 tracking-wider">
                      <Calendar className="w-3 h-3" />
                      <span>{fmtDate(ev.start_time)}</span>
                    </div>
                  </div>
                  <span
                    className={`text-[9px] px-2 py-1 rounded-md tracking-[0.2em] uppercase border ${
                      ev.status === 'live'
                        ? 'bg-red-500/10 border-red-500/40 text-red-300'
                        : 'bg-white/5 border-white/15 text-white/60'
                    }`}
                  >
                    {ev.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-[11px]">
                  <div className="flex items-center gap-1.5 text-white/60">
                    <Trophy className="w-3 h-3 text-green-400" />
                    <span>{ev.prize_pool.toLocaleString()} CZK</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/60">
                    <Coins className="w-3 h-3 text-yellow-400" />
                    <span>{ev.entry_fee.toLocaleString()} CZK</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  {ev.status === 'upcoming' && (
                    <button
                      onClick={() => handleForceStart(ev.id)}
                      className="flex-1 py-2 bg-red-500/10 border border-red-500/40 text-red-300 text-[10px] tracking-[0.2em] uppercase rounded-lg hover:bg-red-500/20 hover:border-red-500/60 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-3 h-3" />
                      Force Start
                    </button>
                  )}
                  {ev.status === 'live' && (
                    <button
                      onClick={() => handleEndEvent(ev.id)}
                      className="flex-1 py-2 bg-white/5 border border-white/10 text-white/70 text-[10px] tracking-[0.2em] uppercase rounded-lg hover:border-yellow-500/40 hover:text-yellow-300 transition-all flex items-center justify-center gap-1.5"
                    >
                      <StopCircle className="w-3 h-3" />
                      End Event
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(ev.id)}
                    className="flex-1 py-2 bg-white/5 border border-white/10 text-white/70 text-[10px] tracking-[0.2em] uppercase rounded-lg hover:border-red-500/40 hover:text-red-300 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999999] pointer-events-none">
          <div
            className={`flex items-center gap-3 backdrop-blur-xl border px-5 py-3 rounded-xl text-xs tracking-wider ${
              toast.kind === 'ok'
                ? 'bg-green-500/10 border-green-500/40 text-green-300'
                : 'bg-red-500/10 border-red-500/40 text-red-300'
            }`}
          >
            {toast.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
