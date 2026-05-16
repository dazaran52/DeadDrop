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
  Pencil,
  X,
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
  min_participants: number | null;
  max_participants: number | null;
  required_keys: number | null;
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
  const [maxParticipants, setMaxParticipants] = useState('20');
  const [minParticipants, setMinParticipants] = useState('3');
  const [requiredKeys, setRequiredKeys] = useState('4');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      .select('id, title, prize_pool, entry_fee, start_time, status, min_participants, max_participants, required_keys')
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

  // Convert ISO timestamp to value usable by <input type="datetime-local">
  const isoToDatetimeLocal = (iso: string): string => {
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60_000);
    return local.toISOString().slice(0, 16);
  };

  const resetForm = () => {
    setTitle('');
    setPrizePool('');
    setEntryFee('');
    setStartTime('');
    setMaxParticipants('20');
    setMinParticipants('3');
    setRequiredKeys('4');
    setEditingId(null);
  };

  const handleEditClick = (ev: AdminEvent) => {
    setEditingId(ev.id);
    setTitle(ev.title);
    setPrizePool(String(ev.prize_pool));
    setEntryFee(String(ev.entry_fee));
    setStartTime(isoToDatetimeLocal(ev.start_time));
    setMaxParticipants(String(ev.max_participants ?? 20));
    setMinParticipants(String(ev.min_participants ?? 3));
    setRequiredKeys(String(ev.required_keys ?? 4));
    // Scroll to form
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const prize = Number(prizePool);
    const fee = Number(entryFee);
    const maxP = Number(maxParticipants);
    const minP = Number(minParticipants);
    const reqK = Number(requiredKeys);
    if (
      !title.trim() ||
      isNaN(prize) ||
      isNaN(fee) ||
      isNaN(maxP) ||
      isNaN(minP) ||
      isNaN(reqK) ||
      maxP < 1 ||
      minP < 1 ||
      minP > maxP ||
      reqK < 1 ||
      !startTime
    ) {
      setToast({ kind: 'err', msg: 'All fields are required and numeric where applicable' });
      setSubmitting(false);
      return;
    }

    const payload = {
      title: title.trim(),
      prize_pool: prize,
      entry_fee: fee,
      start_time: new Date(startTime).toISOString(),
      max_participants: maxP,
      min_participants: minP,
      required_keys: reqK,
    };

    if (editingId) {
      const { error: updErr } = await supabase
        .from('events')
        .update(payload)
        .eq('id', editingId);
      if (updErr) {
        console.error('Update event error:', updErr);
        setToast({ kind: 'err', msg: `${updErr.message} (${updErr.code})` });
        setSubmitting(false);
        return;
      }
      setToast({ kind: 'ok', msg: 'Operation updated' });
    } else {
      const { error: insertError } = await supabase
        .from('events')
        .insert({ ...payload, status: 'upcoming' });
      if (insertError) {
        console.error('Insert event error:', insertError);
        setToast({ kind: 'err', msg: `${insertError.message} (${insertError.code})` });
        setSubmitting(false);
        return;
      }
      setToast({ kind: 'ok', msg: 'Operation deployed to grid' });
    }

    resetForm();
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

  const handleDeployOperation = async (id: string) => {
    if (!confirm('DEPLOY this operation now? Status will be set to LIVE.')) return;
    const { error: updErr } = await supabase
      .from('events')
      .update({ status: 'live' })
      .eq('id', id);

    if (updErr) {
      setToast({ kind: 'err', msg: updErr.message });
      return;
    }
    // Optimistic local update so the event immediately shows as LIVE
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'live' } : e)));
    setToast({ kind: 'ok', msg: 'Operation deployed live' });
    // Reconcile with backend
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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-white/40 tracking-wider uppercase block mb-1.5">Min Hunters</label>
              <input
                type="number"
                min={1}
                value={minParticipants}
                onChange={(e) => setMinParticipants(e.target.value)}
                placeholder="3"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40 tracking-wider uppercase block mb-1.5">Max Hunters</label>
              <input
                type="number"
                min={1}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                placeholder="20"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40 tracking-wider uppercase block mb-1.5">Keys Req</label>
              <input
                type="number"
                min={1}
                value={requiredKeys}
                onChange={(e) => setRequiredKeys(e.target.value)}
                placeholder="4"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-4 py-3 bg-white/5 border border-white/10 text-white/70 text-sm tracking-wider rounded-xl hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={`flex-1 py-3 border text-sm tracking-wider rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 ${
              editingId
                ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20'
                : 'bg-green-500/10 border-green-500/40 text-green-300 hover:bg-green-500/20'
            }`}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : editingId ? (
              <Pencil className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>
              {submitting
                ? editingId
                  ? 'Saving…'
                  : 'Deploying…'
                : editingId
                ? 'Save Changes'
                : 'Deploy Operation'}
            </span>
          </button>
        </div>
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
                      onClick={() => handleDeployOperation(ev.id)}
                      className="flex-1 py-2 bg-red-500/10 border border-red-500/40 text-red-300 text-[10px] tracking-[0.2em] uppercase rounded-lg hover:bg-red-500/20 hover:border-red-500/60 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-3 h-3" />
                      Deploy Operation
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
                  {ev.status === 'upcoming' && (
                    <button
                      onClick={() => handleEditClick(ev)}
                      className={`flex-1 py-2 border text-[10px] tracking-[0.2em] uppercase rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        editingId === ev.id
                          ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-200'
                          : 'bg-white/5 border-white/10 text-white/70 hover:border-yellow-500/40 hover:text-yellow-300'
                      }`}
                    >
                      <Pencil className="w-3 h-3" />
                      {editingId === ev.id ? 'Editing' : 'Edit'}
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
