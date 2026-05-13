/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Pencil, Target, TrendingUp, Check, X, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface ProfileProps {
  onLogout: () => void;
  balance: number;
  username: string | null;
  userId: string | null;
  avatarUrl: string | null;
  onUsernameChange: (u: string) => void;
  onAvatarChange: (u: string) => void;
}

// Hardcoded avatar set
const AVATARS = [
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=alpha&backgroundColor=0f0f12',
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=bravo&backgroundColor=0f0f12',
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=charlie&backgroundColor=0f0f12',
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=delta&backgroundColor=0f0f12',
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=echo&backgroundColor=0f0f12',
];

const ALIAS_REGEX = /^[a-z0-9_]+$/;
const MIN_LEN = 3;
const MAX_LEN = 16;

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function Profile({ onLogout, balance, username, userId, avatarUrl, onUsernameChange, onAvatarChange }: ProfileProps) {
  const [extractionsCount, setExtractionsCount] = useState<number>(0);
  const [totalProfit, setTotalProfit] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchStats = async () => {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from('claims')
        .select('amount')
        .eq('player_id', userId);

      if (dbError) {
        console.error('Profile stats fetch error:', dbError);
        setError(dbError.message);
        setLoading(false);
        return;
      }

      const rows = data || [];
      setExtractionsCount(rows.length);
      setTotalProfit(rows.reduce((sum, r: { amount: number | null }) => sum + (r.amount || 0), 0));
      setLoading(false);
    };

    fetchStats();
  }, [userId]);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [draftAlias, setDraftAlias] = useState(username || '');
  const [draftAvatar, setDraftAvatar] = useState<string | null>(avatarUrl);
  const [availability, setAvailability] = useState<Availability>('idle');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!editing) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    // If unchanged from current username, mark as available
    if (draftAlias === username) {
      setAvailability('available');
      return;
    }

    if (draftAlias.length === 0) {
      setAvailability('idle');
      return;
    }

    if (draftAlias.length < MIN_LEN || draftAlias.length > MAX_LEN || !ALIAS_REGEX.test(draftAlias)) {
      setAvailability('invalid');
      return;
    }

    setAvailability('checking');

    debounceTimer.current = setTimeout(async () => {
      const { data, error: selectError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', draftAlias)
        .maybeSingle();

      if (selectError) {
        console.error('Uniqueness check error:', selectError);
        setAvailability('idle');
        return;
      }

      setAvailability(data ? 'taken' : 'available');
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [draftAlias, editing, username]);

  const openEdit = () => {
    setDraftAlias(username || '');
    setDraftAvatar(avatarUrl);
    setAvailability('idle');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setAvailability('idle');
  };

  const saveEdit = async () => {
    if (!userId) return;
    if (availability !== 'available') {
      setToast({ kind: 'err', msg: 'Alias unavailable' });
      return;
    }

    setSaving(true);
    try {
      const updates: { username?: string; avatar_url?: string | null } = {};
      if (draftAlias !== username) updates.username = draftAlias;
      if (draftAvatar !== avatarUrl) updates.avatar_url = draftAvatar;

      if (Object.keys(updates).length === 0) {
        setEditing(false);
        setSaving(false);
        return;
      }

      const { error: updErr } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (updErr) {
        console.error('Update profile error:', updErr);
        if (updErr.code === '23505') {
          setToast({ kind: 'err', msg: 'ALIAS INTERCEPTED BY ANOTHER USER' });
          setAvailability('taken');
        } else {
          setToast({ kind: 'err', msg: `${updErr.message} (${updErr.code})` });
        }
        setSaving(false);
        return;
      }

      if (updates.username) onUsernameChange(updates.username);
      if (updates.avatar_url !== undefined && updates.avatar_url !== null) onAvatarChange(updates.avatar_url);
      setToast({ kind: 'ok', msg: 'Dossier updated' });
      setEditing(false);
    } catch (err: any) {
      console.error('Unexpected error:', err);
      setToast({ kind: 'err', msg: err?.message || 'UNKNOWN' });
    } finally {
      setSaving(false);
    }
  };

  const isTaken = availability === 'taken';
  const isAvailable = availability === 'available';
  const isChecking = availability === 'checking';
  const canSave = isAvailable && !saving;

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto pb-32 bg-[#09090B] relative">
      {/* Skyline gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 opacity-50" style={{
        background: 'radial-gradient(ellipse at top, rgba(74,222,128,0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(168,85,247,0.05) 0%, transparent 50%)'
      }} />

      {/* Identity card */}
      <div className="relative bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 overflow-hidden">
        {/* Neon top edge */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-green-400/50 to-transparent" />

        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-xl border border-white/10 bg-black/40 overflow-hidden flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30 text-2xl">∅</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-white/40 tracking-[0.25em] uppercase mb-1">Alias</div>
            <h2
              className="alias-glitch text-3xl font-light text-white tracking-tight cursor-default truncate"
              style={{ textTransform: 'none' }}
            >
              {username || 'ghost_user'}
            </h2>
          </div>

          <button
            onClick={openEdit}
            className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-all"
            title="Edit dossier"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Equity */}
      <div className="relative bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-green-400/30 to-transparent" />
        <div className="text-[10px] text-white/40 tracking-[0.25em] uppercase mb-3">Equity</div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-light text-white tracking-tight drop-shadow-[0_0_8px_rgba(74,222,128,0.15)]">{balance.toLocaleString()}</span>
          <span className="text-sm text-white/40 tracking-wider">CZK</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/5 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:border-green-400/30 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-3.5 h-3.5 text-green-400" />
            <span className="text-[10px] text-white/40 tracking-[0.2em] uppercase">Extractions</span>
          </div>
          <div className="text-3xl font-light text-white tracking-tight">
            {loading ? <Loader2 className="w-5 h-5 animate-spin text-white/40" /> : extractionsCount}
          </div>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:border-green-400/30 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-green-400" />
            <span className="text-[10px] text-white/40 tracking-[0.2em] uppercase">Total Profit</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-light text-white tracking-tight">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-white/40" /> : totalProfit.toLocaleString()}
            </span>
            {!loading && <span className="text-xs text-white/40">CZK</span>}
          </div>
        </div>
      </div>

      {/* Disconnect */}
      <div className="mt-auto">
        <button
          onClick={onLogout}
          className="w-full py-3.5 bg-white/[0.03] backdrop-blur-xl border border-white/10 text-red-400 text-sm tracking-wider rounded-2xl hover:border-red-500/40 hover:bg-red-500/5 hover:shadow-[0_0_30px_rgba(239,68,68,0.1)] transition-all"
        >
          Disconnect
        </button>
      </div>

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 z-[9999999] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md bg-[#0B0B0F] border border-white/10 rounded-2xl p-6 space-y-5 shadow-[0_0_60px_rgba(74,222,128,0.08)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-green-400/50 to-transparent" />

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-light text-white tracking-tight">Edit Dossier</h3>
                <p className="text-[10px] text-white/40 tracking-[0.2em] uppercase mt-0.5">Identity & Avatar</p>
              </div>
              <button
                onClick={cancelEdit}
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Alias input */}
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 tracking-[0.25em] uppercase">Alias</label>
              <div className={`flex items-center gap-2 bg-black/40 border rounded-xl px-3 py-2.5 transition-all ${
                isTaken
                  ? 'border-red-500/50'
                  : isAvailable && draftAlias !== username
                    ? 'border-green-400/50'
                    : 'border-white/10 focus-within:border-white/30'
              }`}>
                <input
                  value={draftAlias}
                  onChange={(e) => setDraftAlias(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  maxLength={MAX_LEN}
                  placeholder="ghost_user"
                  className="flex-1 bg-transparent outline-none text-white text-sm tracking-wider"
                  style={{ textTransform: 'none' }}
                />
                {isChecking && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
                {isAvailable && draftAlias !== username && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                {isTaken && <XCircle className="w-4 h-4 text-red-500" />}
              </div>
              {isTaken ? (
                <p className="text-[10px] text-red-400 tracking-wider uppercase">Alias already compromised</p>
              ) : availability === 'invalid' && draftAlias.length > 0 ? (
                <p className="text-[10px] text-yellow-400 tracking-wider uppercase">{MIN_LEN}-{MAX_LEN} chars / [a-z0-9_]</p>
              ) : (
                <p className="text-[10px] text-white/30 tracking-wider">Lowercase, digits and underscore only</p>
              )}
            </div>

            {/* Avatar picker */}
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 tracking-[0.25em] uppercase">Avatar</label>
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.map((url) => {
                  const selected = draftAvatar === url;
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setDraftAvatar(url)}
                      className={`relative aspect-square rounded-xl border overflow-hidden transition-all ${
                        selected
                          ? 'border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.3)]'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {selected && (
                        <div className="absolute inset-0 bg-green-400/10 flex items-center justify-center">
                          <Check className="w-4 h-4 text-green-300" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={cancelEdit}
                className="flex-1 py-3 bg-white/5 border border-white/10 text-white/70 text-sm tracking-wider rounded-xl hover:border-white/30 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={!canSave}
                className="flex-1 py-3 bg-green-500/10 border border-green-500/40 text-green-300 text-sm tracking-wider rounded-xl hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{saving ? 'Saving…' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[99999999] pointer-events-none">
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

