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
  MapPin,
  Key,
  Crosshair,
  Activity,
  Radio,
} from 'lucide-react';
import { MapContainer, TileLayer, useMapEvents, Marker, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { io } from 'socket.io-client';

interface AdminPanelProps {
  role: string | null;
  theme?: 'dark' | 'light';
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
  epicenter_lat: number | null;
  epicenter_lng: number | null;
  prize_pool_override: boolean | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
}

export default function AdminPanel({ role, theme = 'dark' }: AdminPanelProps) {
  const isDark = theme === 'dark';
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
  const [prizePoolOverride, setPrizePoolOverride] = useState(false);
  const [epicenter, setEpicenter] = useState<{lat: number, lng: number} | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [tempEpicenter, setTempEpicenter] = useState<{lat: number, lng: number} | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [locationLabel, setLocationLabel] = useState<{city: string; country: string; country_code: string} | null>(null);
  const [tempLocationLabel, setTempLocationLabel] = useState<{city: string; country: string; country_code: string} | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Live Map Spawner States
  const [showSpawnerMap, setShowSpawnerMap] = useState(false);
  const [selectedEventForMap, setSelectedEventForMap] = useState<AdminEvent | null>(null);
  const [spawnerMapItems, setSpawnerMapItems] = useState<any[]>([]);
  const [participantsPositions, setParticipantsPositions] = useState<any[]>([]);
  const [adminPosition, setAdminPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [tempKeyCoords, setTempKeyCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isSpawningSingleKey, setIsSpawningSingleKey] = useState(false);
  const [spawnerSocket, setSpawnerSocket] = useState<any>(null);

  // Default center (Prague)
  const DEFAULT_CENTER: [number, number] = [50.0755, 14.4378];

  // Custom red marker icon for epicenter
  const epicenterIcon = L.divIcon({
    className: 'custom-epicenter-marker',
    html: `<div style="
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 0 2px #ef4444, 0 4px 12px rgba(239, 68, 68, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
      </svg>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  // Pulsating green blip for hunters
  const hunterIcon = L.divIcon({
    className: 'custom-hunter-marker',
    html: `
      <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 10px; height: 10px; background: #22c55e; border-radius: 50%; border: 1.5px solid #fff; box-shadow: 0 0 8px #22c55e; z-index: 2;"></div>
        <div style="position: absolute; width: 20px; height: 20px; border: 2px solid #22c55e; border-radius: 50%; opacity: 0.8; animation: hunter-pulse 1.8s infinite ease-out; z-index: 1;"></div>
        <style>
          @keyframes hunter-pulse {
            0% { transform: scale(0.6); opacity: 1; }
            100% { transform: scale(2.0); opacity: 0; }
          }
        </style>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  // Pulsating blue blip for Admin
  const adminIcon = L.divIcon({
    className: 'custom-admin-marker',
    html: `
      <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 12px; height: 12px; background: #06b6d4; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 10px #06b6d4; z-index: 2;"></div>
        <div style="position: absolute; width: 24px; height: 24px; border: 2.5px solid #06b6d4; border-radius: 50%; opacity: 0.8; animation: admin-pulse 1.8s infinite ease-out; z-index: 1;"></div>
        <style>
          @keyframes admin-pulse {
            0% { transform: scale(0.6); opacity: 1; }
            100% { transform: scale(2.0); opacity: 0; }
          }
        </style>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  // Neon-yellow key marker
  const spawnerKeyIcon = L.divIcon({
    className: 'custom-spawner-key-marker',
    html: `
      <div style="
        width: 18px;
        height: 18px;
        background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%);
        border: 1.5px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(234, 179, 8, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
      </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  // Neon-red targeting crosshair for clicks
  const targetCrosshairIcon = L.divIcon({
    className: 'custom-target-crosshair-marker',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; animation: target-rotate 6s linear infinite;">
        <!-- Crosshair lines -->
        <div style="position: absolute; width: 32px; height: 2px; background: #ef4444; opacity: 0.6;"></div>
        <div style="position: absolute; height: 32px; width: 2px; background: #ef4444; opacity: 0.6;"></div>
        <!-- Inner ring -->
        <div style="position: absolute; width: 16px; height: 16px; border: 2px solid #ef4444; border-radius: 50%; box-shadow: 0 0 10px rgba(239, 68, 68, 0.8);"></div>
        <!-- Center red dot -->
        <div style="position: absolute; width: 6px; height: 6px; background: #ef4444; border-radius: 50%;"></div>
        <style>
          @keyframes target-rotate {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  // Reverse geocode lat/lng via Nominatim
  const reverseGeocode = async (lat: number, lng: number): Promise<{city: string; country: string; country_code: string} | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'DeadDropApp/1.0' } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.county || addr.state || '';
      const country = addr.country || '';
      const country_code = (addr.country_code || '').toUpperCase();
      return { city, country, country_code };
    } catch {
      return null;
    }
  };

  // LocationPicker component - handles map click events (for form mini-map)
  const LocationPicker = () => {
    useMapEvents({
      click(e) {
        setEpicenter({ lat: e.latlng.lat, lng: e.latlng.lng });
      },
    });
    return null;
  };

  // LocationPicker for modal (uses temp state) + reverse geocoding
  const ModalLocationPicker = () => {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        setTempEpicenter({ lat, lng });
        setGeocoding(true);
        reverseGeocode(lat, lng).then((loc) => {
          setTempLocationLabel(loc);
          setGeocoding(false);
        });
      },
    });
    return null;
  };

  // Open map modal and initialize temp epicenter
  const openMapModal = () => {
    setTempEpicenter(epicenter);
    setTempLocationLabel(locationLabel);
    setShowMapModal(true);
  };

  // Confirm coordinates from modal
  const confirmCoordinates = () => {
    if (tempEpicenter) {
      setEpicenter(tempEpicenter);
      setLocationLabel(tempLocationLabel);
    }
    setShowMapModal(false);
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Socket.io Connection & Geolocation watch for Spawner Map
  useEffect(() => {
    if (!showSpawnerMap || !selectedEventForMap) return;

    let socketInstance: any = null;
    let watchId: number | null = null;

    const initSocket = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      socketInstance = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
        path: '/socket.io',
        transports: ['websocket', 'polling']
      });

      socketInstance.on('connect', () => {
        console.log('[AdminPanel] Socket connected');
        socketInstance.emit('player:identify', { playerId: user.id });
        socketInstance.emit('admin:get_positions', { eventId: selectedEventForMap.id });
      });

      socketInstance.on('admin:positions_response', (res: any) => {
        if (res.success) {
          setParticipantsPositions(res.participants || []);
          if (res.admin) {
            setAdminPosition({ lat: res.admin.lat, lng: res.admin.lng });
          }
        } else {
          console.error('[AdminPanel] admin:positions_response error:', res.error);
        }
      });

      socketInstance.on('gps:update', (payload: any) => {
        if (payload.id === user.id) {
          setAdminPosition({ lat: payload.latitude, lng: payload.longitude });
        } else {
          setParticipantsPositions((prev) => {
            const index = prev.findIndex((p) => p.id === payload.id);
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                lat: payload.latitude,
                lng: payload.longitude,
                timestamp: Date.now()
              };
              return updated;
            } else {
              return prev;
            }
          });
        }
      });

      setSpawnerSocket(socketInstance);
    };

    initSocket();

    // Watch admin's coordinates
    if (typeof window !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setAdminPosition({ lat: latitude, lng: longitude });
          if (socketInstance && socketInstance.connected) {
            socketInstance.emit('gps:update', { latitude, longitude, accuracy: position.coords.accuracy || 5 });
          }
        },
        (err) => console.warn('[AdminPanel] watchPosition error:', err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
      setSpawnerSocket(null);
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [showSpawnerMap, selectedEventForMap]);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('events')
      .select('id, title, prize_pool, prize_pool_override, entry_fee, start_time, status, min_participants, max_participants, required_keys, epicenter_lat, epicenter_lng, city, country, country_code')
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
    setPrizePoolOverride(false);
    setEntryFee('');
    setStartTime('');
    setMaxParticipants('20');
    setMinParticipants('3');
    setRequiredKeys('4');
    setEpicenter(null);
    setLocationLabel(null);
    setEditingId(null);
  };

  const handleEditClick = (ev: AdminEvent) => {
    setEditingId(ev.id);
    setTitle(ev.title);
    setPrizePool(String(ev.prize_pool));
    setPrizePoolOverride(!!ev.prize_pool_override);
    setEntryFee(String(ev.entry_fee));
    setStartTime(isoToDatetimeLocal(ev.start_time));
    setMaxParticipants(String(ev.max_participants ?? 20));
    setMinParticipants(String(ev.min_participants ?? 3));
    setRequiredKeys(String(ev.required_keys ?? 4));
    if (ev.epicenter_lat !== null && ev.epicenter_lng !== null) {
      setEpicenter({ lat: ev.epicenter_lat, lng: ev.epicenter_lng });
    } else {
      setEpicenter(null);
    }
    if (ev.city || ev.country) {
      setLocationLabel({ city: ev.city || '', country: ev.country || '', country_code: ev.country_code || '' });
    } else {
      setLocationLabel(null);
    }
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

    // Validate epicenter coordinates
    if (!epicenter) {
      alert('SELECT DROP ZONE ON THE MAP');
      setSubmitting(false);
      return;
    }

    const payload = {
      title: title.trim(),
      prize_pool: prizePoolOverride ? prize : 0,
      prize_pool_override: prizePoolOverride,
      entry_fee: fee,
      start_time: new Date(startTime).toISOString(),
      max_participants: maxP,
      min_participants: minP,
      required_keys: reqK,
      epicenter_lat: epicenter.lat,
      epicenter_lng: epicenter.lng,
      city: locationLabel?.city || null,
      country: locationLabel?.country || null,
      country_code: locationLabel?.country_code || null,
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

  // Map Click events helper for Spawner Map
  const SpawnerMapEvents = () => {
    useMapEvents({
      click(e) {
        setTempKeyCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      },
    });
    return null;
  };

  const handleSpawnKeys = async (ev: AdminEvent) => {
    if (!ev.epicenter_lat || !ev.epicenter_lng) {
      setToast({ kind: 'err', msg: 'Event has no epicenter set' });
      return;
    }

    setSelectedEventForMap(ev);
    setTempKeyCoords(null);
    setParticipantsPositions([]);

    // Fetch existing active (unclaimed) keys
    const { data: keys, error } = await supabase
      .from('event_items')
      .select('*')
      .eq('event_id', ev.id)
      .eq('is_claimed', false);

    if (error) {
      setToast({ kind: 'err', msg: `Failed to load event keys: ${error.message}` });
      return;
    }

    setSpawnerMapItems(keys || []);
    setShowSpawnerMap(true);
  };

  const handleSpawnSingleKey = async () => {
    if (!selectedEventForMap || !tempKeyCoords) return;
    setIsSpawningSingleKey(true);

    try {
      const newItem = {
        event_id: selectedEventForMap.id,
        lat: tempKeyCoords.lat,
        lng: tempKeyCoords.lng,
        is_claimed: false,
        type: 'key',
      };

      const { data, error } = await supabase
        .from('event_items')
        .insert(newItem)
        .select()
        .single();

      if (error) {
        setToast({ kind: 'err', msg: `UPLINK FAILURE: ${error.message}` });
        setIsSpawningSingleKey(false);
        return;
      }

      // Add to local keys state
      setSpawnerMapItems((prev) => [...prev, data]);
      setTempKeyCoords(null);
      setToast({ kind: 'ok', msg: 'KEY UPLINK ESTABLISHED SUCCESSFULLY' });

      // Play cyber beep tone
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.12);
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch {}
    } catch (err: any) {
      setToast({ kind: 'err', msg: `UPLINK FAILURE: ${err.message}` });
    } finally {
      setIsSpawningSingleKey(false);
    }
  };

  const handleAutoSpawnBatchKeys = async () => {
    if (!selectedEventForMap) return;
    if (!confirm('SPAWN A RANDOM BATCH OF KEYS AROUND EPICENTER?')) return;

    setIsSpawningSingleKey(true);

    try {
      const ev = selectedEventForMap;
      const reqKeys = ev.required_keys ?? 4;
      const { data: participants } = await supabase
        .from('event_participants')
        .select('user_id')
        .eq('event_id', ev.id);
      const participantCount = participants?.length ?? 1;
      const totalKeys = Math.ceil(reqKeys * participantCount * 1.5);

      const minRadius = 50;
      const maxRadius = 300;
      const items: { event_id: string; lat: number; lng: number; is_claimed: boolean; type: string }[] = [];

      for (let i = 0; i < totalKeys; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const radius = minRadius + Math.random() * (maxRadius - minRadius);
        const latOffset = (radius / 111000) * Math.cos(angle);
        const lngOffset = (radius / (111000 * Math.cos(ev.epicenter_lat! * Math.PI / 180))) * Math.sin(angle);
        items.push({
          event_id: ev.id,
          lat: ev.epicenter_lat! + latOffset,
          lng: ev.epicenter_lng! + lngOffset,
          is_claimed: false,
          type: 'key',
        });
      }

      const { data: inserted, error } = await supabase
        .from('event_items')
        .insert(items)
        .select();

      if (error) {
        setToast({ kind: 'err', msg: `Batch spawn failed: ${error.message}` });
        return;
      }

      // Update local keys state
      if (inserted) {
        setSpawnerMapItems((prev) => [...prev, ...inserted]);
      }
      setToast({ kind: 'ok', msg: `${totalKeys} KEYS DEPLOYED SUCCESSFULLY` });
    } catch (err: any) {
      setToast({ kind: 'err', msg: err.message });
    } finally {
      setIsSpawningSingleKey(false);
    }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className={`flex-1 flex flex-col p-6 gap-6 overflow-y-auto pb-32 ${isDark ? 'bg-[#09090B]' : 'bg-[#F2F2F7]'}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className={`text-xl font-light tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Admin Panel</h1>
          <p className={`text-[10px] tracking-[0.25em] uppercase ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Manage Events</p>
        </div>
      </div>

      {/* CREATE OPERATION */}
      <form
        onSubmit={handleCreate}
        className={`backdrop-blur-xl border rounded-2xl p-5 space-y-4 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white/80 border-black/10'}`}
      >
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-green-400" />
          <span className={`text-[10px] tracking-[0.25em] uppercase ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Create Event</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className={`text-[10px] tracking-wider uppercase block mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Prague Vault Run"
              className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-black/40 border border-white/10 text-white focus:border-white/30' : 'bg-white border border-black/10 text-gray-900 focus:border-black/30'}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`text-[10px] tracking-wider uppercase block mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>REWARD POOL (DOX)</label>
              <div className="flex items-center gap-2 mb-1.5">
                <input
                  type="checkbox"
                  checked={prizePoolOverride}
                  onChange={(e) => setPrizePoolOverride(e.target.checked)}
                  className="accent-green-500"
                />
                <span className={`text-[9px] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Manual override</span>
              </div>
              {prizePoolOverride ? (
                <input
                  type="number"
                  value={prizePool}
                  onChange={(e) => setPrizePool(e.target.value)}
                  placeholder="10000"
                  className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-black/40 border border-white/10 text-white focus:border-white/30' : 'bg-white border border-black/10 text-gray-900 focus:border-black/30'}`}
                />
              ) : (
                <div className={`w-full rounded-xl px-3 py-2.5 text-sm ${isDark ? 'bg-black/20 border border-white/5 text-white/40' : 'bg-gray-100 border border-black/5 text-gray-400'}`}>
                  Auto: players × fee × 0.9
                </div>
              )}
            </div>
            <div>
              <label className={`text-[10px] tracking-wider uppercase block mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Entry Fee (DOX)</label>
              <input
                type="number"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                placeholder="500"
                className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-black/40 border border-white/10 text-white focus:border-white/30' : 'bg-white border border-black/10 text-gray-900 focus:border-black/30'}`}
              />
            </div>
          </div>

          <div>
            <label className={`text-[10px] tracking-wider uppercase block mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-black/40 border border-white/10 text-white focus:border-white/30' : 'bg-white border border-black/10 text-gray-900 focus:border-black/30'}`}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={`text-[10px] tracking-wider uppercase block mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Min Hunters</label>
              <input
                type="number"
                min={1}
                value={minParticipants}
                onChange={(e) => setMinParticipants(e.target.value)}
                placeholder="3"
                className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-black/40 border border-white/10 text-white focus:border-white/30' : 'bg-white border border-black/10 text-gray-900 focus:border-black/30'}`}
              />
            </div>
            <div>
              <label className={`text-[10px] tracking-wider uppercase block mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Max Hunters</label>
              <input
                type="number"
                min={1}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                placeholder="20"
                className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-black/40 border border-white/10 text-white focus:border-white/30' : 'bg-white border border-black/10 text-gray-900 focus:border-black/30'}`}
              />
            </div>
            <div>
              <label className={`text-[10px] tracking-wider uppercase block mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Keys Req</label>
              <input
                type="number"
                min={1}
                value={requiredKeys}
                onChange={(e) => setRequiredKeys(e.target.value)}
                placeholder="4"
                className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-black/40 border border-white/10 text-white focus:border-white/30' : 'bg-white border border-black/10 text-gray-900 focus:border-black/30'}`}
              />
            </div>
          </div>

          {/* Epicenter Selection - Button to open fullscreen map */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-400" />
              <label className="text-[10px] text-red-400/80 tracking-wider uppercase font-bold">
                SELECT DROP ZONE (EPICENTER)
              </label>
              {epicenter !== null && (
                <span className="text-[10px] text-green-400 ml-auto">
                  {locationLabel ? `${locationLabel.city}, ${locationLabel.country_code}` : `${(epicenter.lat ?? 0).toFixed(4)}, ${(epicenter.lng ?? 0).toFixed(4)}`}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={openMapModal}
              className="w-full py-4 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm font-medium hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2"
            >
              <MapPin className="w-4 h-4" />
              {epicenter !== null ? 'CHANGE DROP ZONE' : 'OPEN MAP TO SELECT DROP ZONE'}
            </button>

            {/* Mini preview map (read-only) */}
            {epicenter !== null && (
              <div className="h-32 rounded-xl overflow-hidden border border-white/10 opacity-60">
                <MapContainer
                  center={[epicenter.lat, epicenter.lng]}
                  zoom={13}
                  zoomControl={false}
                  scrollWheelZoom={false}
                  dragging={false}
                  style={{ height: '100%', width: '100%' }}
                  className="rounded-xl"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  />
                  <Marker position={[epicenter.lat, epicenter.lng]} icon={epicenterIcon} />
                </MapContainer>
              </div>
            )}
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
          <span className={`text-[10px] tracking-[0.25em] uppercase ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Live & Upcoming</span>
          <button
            onClick={fetchEvents}
            className={`text-[10px] tracking-wider uppercase transition-colors ${isDark ? 'text-white/40 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}
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
          <div className={`backdrop-blur-xl border rounded-2xl p-6 text-center text-xs tracking-wider ${isDark ? 'bg-white/[0.03] border-white/10 text-white/40' : 'bg-white/80 border-black/10 text-gray-400'}`}>
            No active or upcoming operations.
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div
                key={ev.id}
                className={`backdrop-blur-xl border rounded-2xl p-4 space-y-3 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white/80 border-black/10'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-sm truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{ev.title}</div>
                    <div className={`flex items-center gap-1.5 mt-1 text-[10px] tracking-wider ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                      <Calendar className="w-3 h-3" />
                      <span>{fmtDate(ev.start_time)}</span>
                    </div>
                    {(ev.city || ev.country) && (
                      <div className={`flex items-center gap-1 mt-1 text-[10px] ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                        <MapPin className="w-3 h-3" />
                        <span>{[ev.city, ev.country_code].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
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
                  <div className={`flex items-center gap-1.5 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    <Trophy className="w-3 h-3 text-green-400" />
                    <span>{ev.prize_pool.toLocaleString()} DOX</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    <Coins className="w-3 h-3 text-yellow-400" />
                    <span>{ev.entry_fee.toLocaleString()} DOX</span>
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
                    <>
                      <button
                        onClick={() => handleSpawnKeys(ev)}
                        className="flex-1 py-2 bg-white/5 border border-white/10 text-white/70 text-[10px] tracking-[0.2em] uppercase rounded-lg hover:border-green-500/40 hover:text-green-300 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Key className="w-3 h-3" />
                        Spawn Keys
                      </button>
                      <button
                        onClick={() => handleEndEvent(ev.id)}
                        className="flex-1 py-2 bg-white/5 border border-white/10 text-white/70 text-[10px] tracking-[0.2em] uppercase rounded-lg hover:border-yellow-500/40 hover:text-yellow-300 transition-all flex items-center justify-center gap-1.5"
                      >
                        <StopCircle className="w-3 h-3" />
                        End Event
                      </button>
                    </>
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

      {/* Fullscreen Map Modal for Epicenter Selection */}
      {showMapModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0A0A0A]">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-red-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Select Drop Zone</span>
            </div>
            <button
              type="button"
              onClick={() => setShowMapModal(false)}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Fullscreen Map */}
          <div className="flex-1 relative">
            <MapContainer
              center={tempEpicenter !== null ? [tempEpicenter.lat, tempEpicenter.lng] : DEFAULT_CENTER}
              zoom={14}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <ModalLocationPicker />
              {tempEpicenter !== null && (
                <Marker position={[tempEpicenter.lat, tempEpicenter.lng]} icon={epicenterIcon} />
              )}
            </MapContainer>

            {/* Instructions overlay */}
            {tempEpicenter === null && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-sm border border-red-500/30 text-red-300 text-sm px-6 py-3 rounded-xl pointer-events-none">
                Click anywhere on the map to set epicenter
              </div>
            )}

            {/* Location label / geocoding indicator */}
            {tempEpicenter !== null && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm border border-green-500/30 text-green-300 text-xs px-4 py-2 rounded-lg pointer-events-none flex items-center gap-2">
                {geocoding ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /><span>Detecting location…</span></>
                ) : tempLocationLabel ? (
                  <><MapPin className="w-3 h-3" /><span>{tempLocationLabel.city}, {tempLocationLabel.country} ({tempLocationLabel.country_code})</span></>
                ) : (
                  <span>{(tempEpicenter.lat ?? 0).toFixed(5)}, {(tempEpicenter.lng ?? 0).toFixed(5)}</span>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between px-6 py-4 pb-32 border-t border-white/10 bg-[#0A0A0A]">
            <button
              type="button"
              onClick={() => setShowMapModal(false)}
              className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white/60 text-sm font-medium hover:bg-white/10 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmCoordinates}
              disabled={!tempEpicenter}
              className="px-6 py-3 bg-accent-orange text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-accent-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Confirm Coordinates
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen Map Modal for Event Live Map & Key Spawner */}
      {showSpawnerMap && selectedEventForMap && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col font-mono text-white">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#070708] backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center animate-pulse">
                <Radio className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <span className="text-xs text-green-400 font-bold uppercase tracking-wider block">Live Uplink Active</span>
                <span className="text-sm font-semibold text-white/90 uppercase">{selectedEventForMap.title}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAutoSpawnBatchKeys}
                disabled={isSpawningSingleKey}
                className="px-4 py-2 border border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/10 text-yellow-400 text-xs font-semibold rounded-xl uppercase tracking-wider transition-all flex items-center gap-2"
              >
                <Key className="w-3.5 h-3.5" />
                Auto-Spawn Batch
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSpawnerMap(false);
                  setSelectedEventForMap(null);
                }}
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 border border-white/5 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Map Container */}
          <div className="flex-1 relative">
            <MapContainer
              center={[selectedEventForMap.epicenter_lat!, selectedEventForMap.epicenter_lng!]}
              zoom={15}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <SpawnerMapEvents />

              {/* Epicenter Anchor & Circle Radius */}
              <Marker
                position={[selectedEventForMap.epicenter_lat!, selectedEventForMap.epicenter_lng!]}
                icon={epicenterIcon}
              />
              <Circle
                center={[selectedEventForMap.epicenter_lat!, selectedEventForMap.epicenter_lng!]}
                radius={300}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.05, weight: 1.5, dashArray: '5, 8' }}
              />

              {/* Existing active keys */}
              {spawnerMapItems.map((key) => (
                <Marker
                  key={key.id}
                  position={[key.lat, key.lng]}
                  icon={spawnerKeyIcon}
                />
              ))}

              {/* Active event participants */}
              {participantsPositions.map((p) => (
                <Marker
                  key={p.id}
                  position={[p.lat, p.lng]}
                  icon={hunterIcon}
                />
              ))}

              {/* Admin marker (You) */}
              {adminPosition && (
                <Marker
                  position={[adminPosition.lat, adminPosition.lng]}
                  icon={adminIcon}
                />
              )}

              {/* Spawn Target Marker */}
              {tempKeyCoords && (
                <Marker
                  position={[tempKeyCoords.lat, tempKeyCoords.lng]}
                  icon={targetCrosshairIcon}
                />
              )}
            </MapContainer>

            {/* Glowing Map overlay stats */}
            <div className="absolute top-4 left-4 z-[999] flex flex-col gap-2 pointer-events-none">
              <div className="bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-2xl">
                <Activity className="w-4 h-4 text-green-400 animate-pulse" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Grid Telemetry</span>
                  <span className="text-xs text-white/80 font-bold">
                    Hunters Online: <span className="text-green-400">{participantsPositions.length}</span>
                  </span>
                </div>
              </div>
              <div className="bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-2xl">
                <Key className="w-4 h-4 text-yellow-400" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Uplink Keys</span>
                  <span className="text-xs text-white/80 font-bold">
                    Active Items: <span className="text-yellow-400">{spawnerMapItems.length}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Click to spawn instruction overlay if no target selected */}
            {!tempKeyCoords && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[999] bg-black/85 backdrop-blur-md border border-white/10 text-white/70 text-xs px-6 py-3 rounded-2xl pointer-events-none font-bold tracking-wider uppercase text-center max-w-sm shadow-2xl">
                <span className="text-green-400">⚡ Tactical Uplink Active</span><br />
                <span className="text-[10px] text-white/50">Click anywhere on the map grid to lock-on target for key deployment.</span>
              </div>
            )}

            {/* Key Deploying Action Box (Cyberpunk HUD style) */}
            {tempKeyCoords && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[999] bg-[#09090b]/95 backdrop-blur-md border border-red-500/30 p-5 rounded-2xl w-full max-w-sm shadow-2xl animate-fade-in flex flex-col gap-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                    <Crosshair className="w-4 h-4 animate-spin" />
                  </div>
                  <div>
                    <span className="text-[9px] text-red-400 uppercase tracking-widest font-bold">UPLINK RANGE ACQUIRED</span>
                    <span className="text-xs block text-white/70 font-semibold">
                      {tempKeyCoords.lat.toFixed(6)}° N, {tempKeyCoords.lng.toFixed(6)}° E
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTempKeyCoords(null)}
                    className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10 text-xs font-bold uppercase transition-all tracking-wider"
                  >
                    Abort Target
                  </button>
                  <button
                    type="button"
                    onClick={handleSpawnSingleKey}
                    disabled={isSpawningSingleKey}
                    className="flex-1 py-3 bg-green-500/10 border border-green-500/40 hover:bg-green-500/20 text-green-300 disabled:opacity-40 rounded-xl text-xs font-bold uppercase transition-all tracking-widest flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(34,197,94,0.15)]"
                  >
                    {isSpawningSingleKey ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    Deploy 1 Key
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User list sidebar / details overlay */}
          {participantsPositions.length > 0 && (
            <div className="absolute right-4 top-4 z-[999] bg-black/80 backdrop-blur-md border border-white/10 p-4 rounded-2xl w-60 shadow-2xl pointer-events-auto">
              <span className="text-[10px] text-white/40 uppercase tracking-widest block font-bold mb-2">Hunter Grid Telemetry</span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {participantsPositions.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-ping"></span>
                      <span className="text-white/80 font-bold truncate max-w-[120px]">{p.username}</span>
                    </div>
                    <span className="text-[9px] text-white/40">{((Date.now() - p.timestamp) / 1000).toFixed(0)}s ago</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
