/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Pencil, Target, TrendingUp, Check, X, AlertTriangle, CheckCircle2, XCircle, Sun, Moon, Volume2, VolumeX, Smartphone, LogOut } from 'lucide-react';

interface ProfileProps {
  onLogout: () => void;
  balance: number;
  username: string | null;
  userId: string | null;
  avatarUrl: string | null;
  onUsernameChange: (u: string) => void;
  onAvatarChange: (u: string) => void;
  theme: 'dark' | 'light';
  onThemeChange: (t: 'dark' | 'light') => void;
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

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-[44px] h-[26px] rounded-full transition-colors duration-200 flex-shrink-0 ${
        on ? 'bg-green-500' : 'bg-white/15'
      }`}
    >
      <div
        className={`absolute top-[3px] w-[20px] h-[20px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
          on ? 'translate-x-[21px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

export default function Profile({ onLogout, balance, username, userId, avatarUrl, onUsernameChange, onAvatarChange, theme, onThemeChange }: ProfileProps) {
  const [extractionsCount, setExtractionsCount] = useState<number>(0);
  const [totalProfit, setTotalProfit] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('dd_sound') !== 'off');
  const [vibrationEnabled, setVibrationEnabled] = useState(() => localStorage.getItem('dd_vibration') !== 'off');

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
      setToast({ kind: 'ok', msg: 'Profile updated' });
      setEditing(false);
    } catch (err: any) {
      console.error('Unexpected error:', err);
      setToast({ kind: 'err', msg: err?.message || 'UNKNOWN' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('dd_sound', next ? 'on' : 'off');
  };

  const toggleVibration = () => {
    const next = !vibrationEnabled;
    setVibrationEnabled(next);
    localStorage.setItem('dd_vibration', next ? 'on' : 'off');
  };

  const isTaken = availability === 'taken';
  const isAvailable = availability === 'available';
  const isChecking = availability === 'checking';
  const canSave = isAvailable && !saving;

  const isDark = theme === 'dark';
  const cardBg = isDark ? 'bg-white/[0.04]' : 'bg-black/[0.03]';
  const cardBorder = isDark ? 'border-white/[0.08]' : 'border-black/[0.06]';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-white/50' : 'text-gray-500';
  const textTertiary = isDark ? 'text-white/30' : 'text-gray-400';
  const divider = isDark ? 'divide-white/[0.06]' : 'divide-black/[0.06]';
  const pageBg = isDark ? 'bg-[#09090B]' : 'bg-[#F2F2F7]';

  return (
    <div className={`flex-1 flex flex-col gap-6 overflow-y-auto pb-32 px-5 pt-2 ${pageBg} relative`}>

      {/* Hero — Avatar + Username */}
      <div className="flex flex-col items-center pt-2">
        <div className={`w-20 h-20 rounded-full border-2 ${cardBorder} overflow-hidden mb-3 shadow-lg`}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${textTertiary} text-3xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>?</div>
          )}
        </div>
        <h2
          className={`text-xl font-semibold ${textPrimary} tracking-tight`}
          style={{ textTransform: 'none' }}
        >
          {username || 'unknown'}
        </h2>
        <button
          onClick={openEdit}
          className={`mt-2 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${isDark ? 'bg-white/10 text-white/70 hover:bg-white/15' : 'bg-black/5 text-gray-600 hover:bg-black/10'}`}
        >
          <Pencil className="w-3 h-3" />
          Edit Profile
        </button>
      </div>

      {/* Balance */}
      <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5`}>
        <div className={`text-xs font-medium ${textSecondary} mb-1`}>Balance</div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${textPrimary} tracking-tight tabular-nums`}>{balance.toLocaleString()}</span>
          <span className={`text-sm font-medium ${textTertiary}`}>DOX</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium p-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Stats — iOS grouped */}
      <div className={`${cardBg} border ${cardBorder} rounded-2xl overflow-hidden divide-y ${divider}`}>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Target className="w-3.5 h-3.5 text-green-500" />
            </div>
            <span className={`text-sm font-medium ${textPrimary}`}>Extractions</span>
          </div>
          <span className={`text-sm font-semibold ${textSecondary} tabular-nums`}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : extractionsCount}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <span className={`text-sm font-medium ${textPrimary}`}>Total Profit</span>
          </div>
          <span className={`text-sm font-semibold ${textSecondary} tabular-nums`}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{totalProfit.toLocaleString()} <span className={textTertiary}>DOX</span></>}
          </span>
        </div>
      </div>

      {/* Settings — iOS grouped */}
      <div>
        <div className={`text-xs font-semibold ${textSecondary} uppercase tracking-wider px-4 mb-2`}>Settings</div>
        <div className={`${cardBg} border ${cardBorder} rounded-2xl overflow-hidden divide-y ${divider}`}>
          {/* Theme */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? 'bg-indigo-500/10' : 'bg-orange-500/10'}`}>
                {isDark ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-orange-500" />}
              </div>
              <span className={`text-sm font-medium ${textPrimary}`}>Dark Mode</span>
            </div>
            <Toggle on={isDark} onToggle={() => onThemeChange(isDark ? 'light' : 'dark')} />
          </div>
          {/* Sound */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-pink-500/10 flex items-center justify-center">
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-pink-500" /> : <VolumeX className="w-3.5 h-3.5 text-pink-500/50" />}
              </div>
              <span className={`text-sm font-medium ${textPrimary}`}>Sound</span>
            </div>
            <Toggle on={soundEnabled} onToggle={toggleSound} />
          </div>
          {/* Vibration */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Smartphone className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <span className={`text-sm font-medium ${textPrimary}`}>Vibration</span>
            </div>
            <Toggle on={vibrationEnabled} onToggle={toggleVibration} />
          </div>
        </div>
      </div>

      {/* Log Out */}
      <div className={`${cardBg} border ${cardBorder} rounded-2xl overflow-hidden`}>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-red-500 text-sm font-medium transition-colors hover:bg-red-500/5 active:bg-red-500/10"
        >
          <LogOut className="w-4 h-4" />
          Log Out
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

