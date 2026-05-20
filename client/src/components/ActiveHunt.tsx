/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, X, Volume2, VolumeX, Trophy, User, Target, Crosshair, Lock, Shield, Key, Clock, Activity, Plus, Minus, ShieldAlert, CheckCircle2, TrendingUp, Maximize, RefreshCw } from 'lucide-react';
import MapView from './MapView';
import Radar from './Radar';
import LiveRoster from './LiveRoster';
import { getDistance } from '../utils/geoUtils';
import { io, Socket } from 'socket.io-client';
import { supabase } from '../lib/supabase';
import confetti from 'canvas-confetti';

interface ActiveHuntProps {
  initialCoords: { latitude: number; longitude: number; accuracy: number };
  onBack?: () => void;
  onNavigate?: (view: string, operationId?: string) => void;
  theme: 'dark' | 'light';
  balance: number;
  activeOperationId?: string | null;
  registeredEvents?: Array<{ id: string; start_time: string }>;
  isAwaitingDeployment?: boolean;
}

type TrackingState = 'OUT_OF_SECTOR' | 'IN_SECTOR' | 'VAULT_REACHED';
type MatchResult = 'playing' | 'victory' | 'defeat';

export default function ActiveHunt({ initialCoords, onBack, onNavigate, theme, balance, activeOperationId, registeredEvents = [], isAwaitingDeployment = false }: ActiveHuntProps) {
  const [userLocation, setUserLocation] = useState(initialCoords);
  const [distance, setDistance] = useState(0);
  const [trackingState, setTrackingState] = useState<TrackingState>('OUT_OF_SECTOR');
  const [isGpsError, setIsGpsError] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [localIsAwaitingDeployment, setLocalIsAwaitingDeployment] = useState(false);
  const [registeredEventsData, setRegisteredEventsData] = useState<Array<{ id: string; title: string; start_time: string }>>([]);
  const [operationTitle, setOperationTitle] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [nearbyItem, setNearbyItem] = useState<any>(null);
  const [collectedKeys, setCollectedKeys] = useState<number>(0);
  const [matchResult, setMatchResult] = useState<MatchResult>('playing');
  const [canExit, setCanExit] = useState(false);
  const [requiredKeys, setRequiredKeys] = useState<number>(0);
  const [vaultLocation, setVaultLocation] = useState<{ lat: number; lng: number; reward_amount: number } | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [claimOverlay, setClaimOverlay] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [showKeySpend, setShowKeySpend] = useState<boolean>(false);
  const [showKeyGain, setShowKeyGain] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [eventStartTime, setEventStartTime] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [showStartOverlay, setShowStartOverlay] = useState(false);
  const [startOverlayOpacity, setStartOverlayOpacity] = useState(1);
  const beepedAtRef = useRef<Set<number>>(new Set());
  const autoStartFiredRef = useRef<boolean>(false);
  const startOverlayFiredRef = useRef<boolean>(false);
  const [vaults, setVaults] = useState<any[]>([]);
  const [inventory, setInventory] = useState({ items: [], balance: null, role: 'user' });
  const [error, setError] = useState<string | null>(null);
  const [lootAnimations, setLootAnimations] = useState<any[]>([]);
  const [rewards, setRewards] = useState<{id: string, amount: number, lat: number, lng: number}[]>([]);
  const [nearestVaultDistance, setNearestVaultDistance] = useState<number | null>(null);
  const [nearestVaultId, setNearestVaultId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  const [shouldCenterMap, setShouldCenterMap] = useState(false);
  const [showConnectionError, setShowConnectionError] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isClaimingRef = useRef(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionProgress, setDecryptionProgress] = useState(0);
  const [hexCode, setHexCode] = useState('0x000000');
  const [isClaimed, setIsClaimed] = useState(false);

  // 4Hz countdown tick (smoother for big timer)
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Mario Kart-style beep at 3,2,1 (high) and 0 (long low)
  const playCountdownBeep = useCallback((kind: 'tick' | 'go') => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = kind === 'go' ? 220 : 880;
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(ctx.destination);
      const now = ctx.currentTime;
      const dur = kind === 'go' ? 0.9 : 0.18;
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    } catch (e) {
      console.warn('beep failed', e);
    }
  }, []);

  // Beep scheduling + auto-start RPC trigger
  useEffect(() => {
    if (!activeOperationId || !eventStartTime || eventStatus !== 'upcoming') return;

    // Validate date before parsing to prevent crashes
    let eventTime: number;
    try {
      const parsedDate = new Date(eventStartTime);
      if (isNaN(parsedDate.getTime())) {
        console.warn('Invalid eventStartTime:', eventStartTime);
        return;
      }
      eventTime = parsedDate.getTime();
    } catch (e) {
      console.warn('Error parsing eventStartTime:', eventStartTime, e);
      return;
    }

    const diffMs = eventTime - Date.now();
    const diffSec = Math.ceil(diffMs / 1000);

    // Beep at 3, 2, 1
    if (diffSec === 3 || diffSec === 2 || diffSec === 1) {
      if (!beepedAtRef.current.has(diffSec)) {
        beepedAtRef.current.add(diffSec);
        playCountdownBeep('tick');
      }
    }

    // T-0: RPC auto-start (fire once) — airhorn plays in START overlay useEffect
    if (diffMs <= 0 && !autoStartFiredRef.current) {
      autoStartFiredRef.current = true;

      (async () => {
        try {
          const { data, error } = await supabase.rpc('attempt_auto_start', {
            p_event_id: activeOperationId,
          });
          if (error) {
            console.error('attempt_auto_start error:', error);
            alert(`OPERATION ABORTED: ${error.message}`);
            localStorage.removeItem('activeOperationId');
            if (onNavigate) onNavigate('events');
            return;
          }
          if (data === 'cancelled') {
            alert('OPERATION ABORTED: NOT ENOUGH HUNTERS. REFUND ISSUED.');
            localStorage.removeItem('activeOperationId');
            if (onNavigate) onNavigate('events');
            return;
          }
          if (data === 'live') {
            setEventStatus('live');
          }
        } catch (e: any) {
          console.error('auto-start exception:', e);
          alert(`OPERATION ABORTED: ${e?.message || 'unknown error'}`);
          localStorage.removeItem('activeOperationId');
          if (onNavigate) onNavigate('events');
        }
      })();
    }
    // re-run on tick
  }, [activeOperationId, eventStartTime, eventStatus, playCountdownBeep, onNavigate, nowTick]);

  // START! overlay trigger — fires exactly once at T-0
  useEffect(() => {
    if (eventStatus === 'upcoming' && eventStartTime && !startOverlayFiredRef.current) {
      try {
        const d = new Date(eventStartTime);
        if (!isNaN(d.getTime()) && d.getTime() - Date.now() <= 0) {
          startOverlayFiredRef.current = true;
          setShowStartOverlay(true);
          setStartOverlayOpacity(1);
          try {
            new Audio('/sounds/airhorn.mp3').play().catch(err => console.log('Airhorn play failed:', err));
          } catch (e) {
            console.log('Audio creation failed:', e);
          }
          setTimeout(() => setStartOverlayOpacity(0), 500);
          setTimeout(() => setShowStartOverlay(false), 2000);
        }
      } catch (e) {
        console.warn('START overlay date parse error:', e);
      }
    }
  }, [eventStatus, eventStartTime, nowTick]);

  // Auto-spawn keys when event goes live
  useEffect(() => {
    if (eventStatus !== 'live' || !activeOperationId) return;
    const autoSpawnFired = localStorage.getItem(`keys_spawned_${activeOperationId}`);
    if (autoSpawnFired) return;

    (async () => {
      try {
        const { data: ev } = await supabase
          .from('events')
          .select('epicenter_lat, epicenter_lng, required_keys')
          .eq('id', activeOperationId)
          .single();

        if (!ev?.epicenter_lat || !ev?.epicenter_lng) return;

        const { data: participants } = await supabase
          .from('event_participants')
          .select('user_id')
          .eq('event_id', activeOperationId);

        const participantCount = participants?.length ?? 1;
        const reqKeys = ev.required_keys ?? 4;
        const totalKeys = Math.ceil(reqKeys * participantCount * 1.5);

        const items: { event_id: string; lat: number; lng: number; is_claimed: boolean }[] = [];
        for (let i = 0; i < totalKeys; i++) {
          const angle = Math.random() * 2 * Math.PI;
          const radius = 50 + Math.random() * 250;
          const latOffset = (radius / 111000) * Math.cos(angle);
          const lngOffset = (radius / (111000 * Math.cos(ev.epicenter_lat * Math.PI / 180))) * Math.sin(angle);
          items.push({ event_id: activeOperationId, lat: ev.epicenter_lat + latOffset, lng: ev.epicenter_lng + lngOffset, is_claimed: false });
        }

        const { error } = await supabase.from('event_items').insert(items);
        if (!error) {
          localStorage.setItem(`keys_spawned_${activeOperationId}`, '1');
          console.log(`[auto-spawn] ${totalKeys} keys spawned for event ${activeOperationId}`);
        } else {
          console.warn('[auto-spawn] insert failed:', error.message);
        }
      } catch (e) {
        console.warn('[auto-spawn] exception:', e);
      }
    })();
  }, [eventStatus, activeOperationId]);

  // Fetch operation title and required_keys when activeOperationId changes
  useEffect(() => {
    if (activeOperationId) {
      // Fetch operation title and required_keys + status gate
      const fetchOperationInfo = async () => {
        const { data, error } = await supabase
          .from('events')
          .select('title, required_keys, status, start_time')
          .eq('id', activeOperationId)
          .single();

        if (error || !data) {
          console.warn('Event lookup failed, redirecting to lobby:', error);
          localStorage.removeItem('activeOperationId');
          if (onNavigate) onNavigate('events');
          return;
        }

        // Relaxed router guard: allow upcoming only within T-5 min window
        if (data.status === 'upcoming') {
          const diffMs = new Date(data.start_time).getTime() - Date.now();
          if (diffMs > 5 * 60 * 1000) {
            console.warn('Access denied: operation not yet started', activeOperationId);
            localStorage.setItem('lobbyToast', 'OPERATION NOT YET STARTED');
            localStorage.removeItem('activeOperationId');
            if (onNavigate) onNavigate('events');
            return;
          }
        }

        setOperationTitle(data.title);
        setRequiredKeys(data.required_keys || 0);
        setEventStatus(data.status);
        setEventStartTime(data.start_time);
      };

      fetchOperationInfo();

      // Fetch event items from Supabase
      const fetchEventItems = async () => {
        console.log('--- FETCHING ITEMS FOR EVENT:', activeOperationId);
        const { data, error } = await supabase
          .from('event_items')
          .select('*')
          .eq('event_id', activeOperationId)
          .eq('is_claimed', false);

        if (error) console.error('SUPABASE ERROR:', error);
        if (data && Array.isArray(data)) {
          setInventory(prev => ({
            ...prev,
            items: data
          }));
          console.log('--- MAP ITEMS LOADED:', data);
        } else {
          console.warn('Supabase returned invalid or empty data:', data);
        }
      };

      fetchEventItems();

      // Fetch event keys collected from event_participants
      const fetchEventKeys = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: participantData, error } = await supabase
          .from('event_participants')
          .select('keys_balance')
          .eq('event_id', activeOperationId)
          .eq('user_id', user.id)
          .single();

        if (error || !participantData) {
          // No event_participants record => no spectators allowed.
          // Hard block: clear active operation and redirect to lobby.
          console.warn('Access denied: not a participant of', activeOperationId);
          localStorage.setItem('lobbyToast', 'TICKET REQUIRED · BUY ENTRY FIRST');
          localStorage.removeItem('activeOperationId');
          if (onNavigate) onNavigate('events');
          return;
        }

        setCollectedKeys(participantData.keys_balance || 0);
      };

      fetchEventKeys();

      // Fetch vault location from vaults table
      const fetchVaultLocation = async () => {
        const { data: vaultData, error } = await supabase
          .from('vaults')
          .select('lat, lng, reward_amount')
          .eq('event_id', activeOperationId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching vault location:', error);
          return;
        }

        if (vaultData) {
          setVaultLocation({
            lat: vaultData.lat,
            lng: vaultData.lng,
            reward_amount: vaultData.reward_amount
          });
        }
      };

      fetchVaultLocation();
    }
  }, [activeOperationId]);

  // Trigger confetti and vibration on victory
  useEffect(() => {
    if (matchResult === 'victory') {
      // Fire confetti
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00ff00', '#00cc00', '#009900', '#ffffff', '#ffff00']
      });

      // Play glitch sound effect
      try {
        const glitchSound = new Audio('/sounds/glitch.mp3');
        glitchSound.volume = 0.3;
        glitchSound.play().catch(err => console.log('Audio play failed:', err));
      } catch (err) {
        console.log('Audio creation failed:', err);
      }

      // Vibrate if supported
      if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 1000]);
      }

      // Play victory sound (optional - prepare code)
      // new Audio('/victory.mp3').play().catch(() => {});
    } else if (matchResult === 'defeat') {
      // Vibrate on defeat
      if (navigator.vibrate) {
        navigator.vibrate([800]);
      }
    }
  }, [matchResult]);

  // Supabase Realtime listener for event status changes
  useEffect(() => {
    if (!activeOperationId) return;

    const channel = supabase
      .channel('event_status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${activeOperationId}`
        },
        (payload) => {
          const newStatus = payload.new.status;
          if (newStatus) {
            setEventStatus(newStatus);
          }
          if (newStatus === 'completed' && matchResult !== 'victory') {
            setMatchResult('defeat');
          }
          // Kick player out if event is ended or cancelled
          if (newStatus === 'ended' || newStatus === 'cancelled') {
            localStorage.setItem('lobbyToast', 'OPERATION TERMINATED');
            localStorage.removeItem('activeOperationId');
            if (onNavigate) onNavigate('events');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOperationId, matchResult, onNavigate]);

  // Polling fallback for event status (every 10 seconds)
  useEffect(() => {
    if (!activeOperationId) return;

    const pollInterval = setInterval(async () => {
      const { data, error } = await supabase
        .from('events')
        .select('status')
        .eq('id', activeOperationId)
        .single();

      if (error || !data) return;

      if (data.status === 'ended' || data.status === 'cancelled') {
        localStorage.setItem('lobbyToast', 'OPERATION TERMINATED');
        localStorage.removeItem('activeOperationId');
        if (onNavigate) onNavigate('events');
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [activeOperationId, onNavigate]);

  // Local fetch to check if user has registered events when in observer mode
  useEffect(() => {
    if (activeOperationId === null) {
      const checkRegisteredEvents = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // Check if user is registered to any upcoming event
          const { data: participants } = await supabase
            .from('event_participants')
            .select('event_id')
            .eq('user_id', user.id);

          if (participants && participants.length > 0) {
            // Check if any of these events are upcoming and get their titles
            const eventIds = participants.map(p => p.event_id);
            const { data: events } = await supabase
              .from('events')
              .select('id, start_time, title')
              .in('id', eventIds)
              .eq('status', 'upcoming');

            if (events && events.length > 0) {
              setLocalIsAwaitingDeployment(true);
              setRegisteredEventsData(events);
            } else {
              setLocalIsAwaitingDeployment(false);
              setRegisteredEventsData([]);
            }
          } else {
            setLocalIsAwaitingDeployment(false);
            setRegisteredEventsData([]);
          }
        } catch (err) {
          console.error('Error checking registered events:', err);
        }
      };

      checkRegisteredEvents();
    }
  }, [activeOperationId]);

  // Calculate time to nearest event
  const getNearestEventTime = () => {
    if (registeredEvents.length === 0) return null;
    const now = new Date();
    const nearest = registeredEvents.reduce((nearest, event) => {
      const eventTime = new Date(event.start_time);
      const diff = eventTime.getTime() - now.getTime();
      const nearestDiff = nearest ? new Date(nearest.start_time).getTime() - now.getTime() : Infinity;
      return diff < nearestDiff ? event : nearest;
    }, null as { id: string; start_time: string } | null);
    return nearest;
  };

  const nearestEvent = getNearestEventTime();
  const hasRegisteredEvents = registeredEvents.length > 0;
  const canDeployToNearest = nearestEvent ? (() => {
    const now = new Date();
    const start = new Date(nearestEvent.start_time);
    const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
    return diffMinutes <= 5;
  })() : false;

  // Track nearest item when user location or items change
  useEffect(() => {
    const items = inventory.items;
    if (items && items.length > 0) {
      let nearest = null;
      let minDistance = Infinity;

      items.forEach((item: any) => {
        const dist = getDistance(
          userLocation.latitude,
          userLocation.longitude,
          Number(item.lat),
          Number(item.lng)
        );
        if (dist < minDistance && dist < 25) {
          minDistance = dist;
          nearest = item;
        }
      });

      setNearbyItem(nearest);
    } else {
      setNearbyItem(null);
    }
  }, [userLocation, inventory.items]);

  // Web Audio API for radar ping
  const playPing = useCallback(() => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx) return;
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Frequency based on distance (closer = higher pitch)
    const distance = nearestVaultDistance || 1000;
    const frequency = Math.max(800, Math.min(2000, 2000 - distance));
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.1);
  }, [nearestVaultDistance]);

  // Handle claiming nearby item
  const handleClaimItem = useCallback(async () => {
    if (!nearbyItem) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Atomic update: only claim if not already claimed
      const { data, error } = await supabase
        .from('event_items')
        .update({ is_claimed: true, claimed_by: user.id })
        .eq('id', nearbyItem.id)
        .eq('is_claimed', false)
        .select();

      if (error) {
        console.error('Error claiming item:', error);
        setError('Failed to claim item');
        setTimeout(() => setError(null), 3000);
        return;
      }

      // If data is empty, someone else already claimed it
      if (!data || data.length === 0) {
        setInventory(prev => ({
          ...prev,
          items: prev.items.filter((item: any) => item.id !== nearbyItem.id)
        }));
        setNearbyItem(null);
        setError('TOO LATE. ITEM ALREADY CLAIMED');
        setTimeout(() => setError(null), 3000);
        return;
      }

      // Successfully claimed - update keys_balance in event_participants
      const { data: participantData } = await supabase
        .from('event_participants')
        .select('keys_balance')
        .eq('event_id', activeOperationId)
        .eq('user_id', user.id)
        .single();

      const currentKeys = participantData?.keys_balance || 0;
      const { error: participantError } = await supabase
        .from('event_participants')
        .update({ keys_balance: currentKeys + 1 })
        .eq('event_id', activeOperationId)
        .eq('user_id', user.id);

      if (participantError) {
        console.error('Error updating keys_balance:', participantError);
      }

      // Remove from local state
      setInventory(prev => ({
        ...prev,
        items: prev.items.filter((item: any) => item.id !== nearbyItem.id)
      }));

      setNearbyItem(null);
      setCollectedKeys(currentKeys + 1);
      setClaimOverlay('KEY SECURED');
      setShowKeyGain(true);
      setTimeout(() => setClaimOverlay(null), 2500);
      setTimeout(() => setShowKeyGain(false), 500);
    } catch (err) {
      console.error('Error in handleClaimItem:', err);
    }
  }, [nearbyItem, activeOperationId]);

  // Audio toggle handler
  const toggleAudio = useCallback(() => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);

    
    if (newState && !audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (newState && audioCtxRef.current) {
      audioCtxRef.current.resume();
    }
    
    if (!newState && pingIntervalRef.current) {
      clearTimeout(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, [audioEnabled]);

  // Audio loop with recursive setTimeout (independent of React renders)
  useEffect(() => {
    if (!audioEnabled || nearestVaultDistance === null) {
      if (pingIntervalRef.current) {
        clearTimeout(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      return;
    }

    const scheduleNextPing = () => {
      if (!audioEnabled || nearestVaultDistance === null) return;
      
      const distance = nearestVaultDistance;
      const interval = distance > 100 ? 3000 : distance < 20 ? 500 : 1500;
      
      playPing();
      pingIntervalRef.current = setTimeout(scheduleNextPing, interval);
    };

    playPing();
    pingIntervalRef.current = setTimeout(scheduleNextPing, nearestVaultDistance > 100 ? 3000 : nearestVaultDistance < 20 ? 500 : 1500);
    
    return () => {
      if (pingIntervalRef.current) {
        clearTimeout(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [audioEnabled, nearestVaultDistance, playPing]);

  // Socket.io Connection
  useEffect(() => {
    const initSocket = async () => {
      // Get real user from Supabase session
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.log('No user found, skipping socket connection');
        return;
      }

      const socketInstance = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
        path: '/socket.io',
        withCredentials: true,
        transports: ['websocket', 'polling']
      });
      socketInstance.emit('player:identify', { playerId: user.id });
      setSocket(socketInstance);

      // Debounce connection error - show only after 3 seconds
      const errorTimeout = setTimeout(() => {
        setShowConnectionError(true);
      }, 3000);

      // Listen for socket connection status
      socketInstance.on('connect', () => {
        console.log('Socket connected');
        setIsConnected(true);
        setShowConnectionError(false);
        clearTimeout(errorTimeout);
      });

      socketInstance.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      });

      // Listen for vaults initialization
      socketInstance.on('vaults:init', (vaultsData) => {
        console.log('Получены сейфы:', vaultsData);
        setVaults(vaultsData);
      });

      // Listen for vault updates (when another player claims a vault)
      socketInstance.on('vault:update', (update) => {
        setVaults(prev => {
          const existing = prev.find(v => v.id === update.id);
          if (existing) {
            return prev.map(v => v.id === update.id ? { ...v, is_active: update.is_active } : v);
          }
          return [...prev, update];
        });
      });

      // Listen for inventory initialization
      socketInstance.on('inventory:init', (inventoryData) => {
        console.log('--- FETCHING ITEMS FOR EVENT:', activeOperationId);
        console.log('FETCHED ITEMS:', inventoryData?.items);
        console.log('Получен инвентарь:', inventoryData);
        if (inventoryData) {
          const items = inventoryData.items;
          if (Array.isArray(items) && items.length > 0) {
            setInventory({
              items: items,
              balance: inventoryData.balance ?? 0,
              role: inventoryData.role || 'user'
            });
            console.log('--- MAP ITEMS LOADED:', items);
          } else {
            console.warn('Blocked invalid map items update from socket (inventory:init):', items);
            // Only update balance and role, preserve existing items
            setInventory(prev => ({
              items: prev.items,
              balance: inventoryData.balance ?? prev.balance,
              role: inventoryData.role ?? prev.role
            }));
          }
        }
      });

      // Listen for inventory updates
      socketInstance.on('inventory:update', (inventoryData) => {
        console.log('Инвентарь обновлен:', inventoryData);
        if (inventoryData) {
          const items = inventoryData.items;
          if (Array.isArray(items)) {
            setInventory(prev => ({
              items: items,
              balance: inventoryData.balance ?? prev.balance,
              role: inventoryData.role ?? prev.role
            }));
          } else {
            console.warn('Blocked invalid map items update from socket (inventory:update):', items);
            // Only update balance and role, preserve existing items
            setInventory(prev => ({
              items: prev.items,
              balance: inventoryData.balance ?? prev.balance,
              role: inventoryData.role ?? prev.role
            }));
          }
        }
      });

      // Listen for vault errors
      socketInstance.on('vault:error', (error) => {
        console.error('Ошибка сейфа:', error);
        setError(error.message);
        setTimeout(() => setError(null), 3000);
      });

      // Listen for no keys error
      socketInstance.on('error:no_keys', (error) => {
        console.error('Ошибка ключей:', error);
        setError(error.message);
        setTimeout(() => setError(null), 3000);
      });

      // Listen for vault claimed
      socketInstance.on('vault:claimed', async (vault) => {
        console.log('Сейф открыт:', vault);
        // Reset claiming flag
        isClaimingRef.current = false;
        // Reset nearest vault state to hide button
        setNearestVaultDistance(null);
        setNearestVaultId(null);
        // Remove vault from map state immediately
        setVaults(prev => prev.filter(v => v.id !== vault.id));
        // Deduct required_keys from event keys
        setCollectedKeys(prev => prev - requiredKeys);
        // Update DB: hard reset keys_balance to 0
        const updateKeysBalance = async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data, error } = await supabase
              .from('event_participants')
              .update({ keys_balance: 0 })
              .eq('user_id', user.id)
              .eq('event_id', activeOperationId)
              .select();

            console.log('VAULT OPEN DB RESPONSE:', data, error);

            if (error) {
              console.error('Error updating keys_balance:', error);
            } else {
              setCollectedKeys(0);
            }
          }
        };
        updateKeysBalance();

        // RPC complete_operation is now called directly from startDecryption (real user click)
        // This handler only resets local UI state when server confirms vault:claimed

        // Show key spend animation with required_keys amount
        setShowKeySpend(true);
        setTimeout(() => setShowKeySpend(false), 1500);
        // Add independent reward animation
        const reward = {
          id: vault.id,
          amount: vault.reward,
          lat: vault.lat,
          lng: vault.lng,
        };
        setRewards(prev => [...prev, reward]);
        // Remove reward after 2 seconds
        setTimeout(() => {
          setRewards(prev => prev.filter(r => r.id !== vault.id));
        }, 2000);
      });

      return () => {
        socketInstance.off('connect');
        socketInstance.off('disconnect');
        socketInstance.off('vaults:init');
        socketInstance.off('vault:update');
        socketInstance.off('inventory:init');
        socketInstance.off('inventory:update');
        socketInstance.off('vault:error');
        socketInstance.off('error:no_keys');
        socketInstance.off('vault:claimed');
        socketInstance.disconnect();
      };
    };

    initSocket();
  }, []);

  // Real GPS Tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      setIsGpsError(true);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setIsGpsError(false);
        const { latitude, longitude, accuracy } = position.coords;
        setUserLocation({ latitude, longitude, accuracy: accuracy || 5 });
        setGpsAccuracy(accuracy || 5);
        
        // Send GPS update to server
        if (socket) {
          socket.emit('gps:update', { latitude, longitude, accuracy: accuracy || 5 });
        }

        // Calculate distance to nearest vault
        if (vaults.length > 0) {
          let minDistance = Infinity;
          let nearestId = null;
          vaults.forEach(vault => {
            if (vault.is_active === true) {
              const dist = getDistance(latitude, longitude, vault.lat, vault.lng);
              console.log('Dist debug:', { userLoc: { latitude, longitude }, vaultLoc: { lat: vault.lat, lng: vault.lng }, dist });
              if (dist < minDistance) {
                minDistance = dist;
                nearestId = vault.id;
              }
            }
          });
          setNearestVaultDistance(minDistance === Infinity ? null : minDistance);
          setNearestVaultId(nearestId);
        }
      },
      (error) => {
        console.error("GPS Error:", error);
        setIsGpsError(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [socket, vaults]);

  useEffect(() => {
    if (!vaultLocation) return;

    const d = getDistance(
      userLocation.latitude,
      userLocation.longitude,
      vaultLocation.lat,
      vaultLocation.lng
    );
    setDistance(d);

    if (d <= 10 && !isClaimed) {
      setTrackingState('VAULT_REACHED');
    } else if (d <= 1000) {
      setTrackingState('IN_SECTOR');
    } else {
      setTrackingState('OUT_OF_SECTOR');
    }
  }, [userLocation, isClaimed, vaultLocation]);

  // Hex code simulation
  useEffect(() => {
    if (isDecrypting && !isClaimed) {
      const interval = setInterval(() => {
        setHexCode('0x' + Math.floor(Math.random() * 16777215).toString(16).toUpperCase().padStart(6, '0'));
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isDecrypting, isClaimed]);

  const simulateTeleport = () => {
    if (!vaultLocation) return;
    setUserLocation({
      latitude: vaultLocation.lat + 0.00901, // ~1km away
      longitude: vaultLocation.lng,
      accuracy: 5
    });
  };

  const startDecryption = async () => {
    setIsDecrypting(true);
    let prog = 0;

    // Run progress animation
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        prog += 2;
        setDecryptionProgress(prog);
        if (prog >= 100) {
          clearInterval(interval);
          resolve();
        }
      }, 60);
    });

    // After animation, call REAL RPC complete_operation
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('RPC FAILED: User not authenticated');
      alert('CRITICAL DB ERROR: User not authenticated');
      setDbError('TRANSACTION FAILED: User not authenticated');
      setIsDecrypting(false);
      return;
    }

    // Use vault reward amount or fallback to event prize_pool
    let reward = vaultLocation?.reward_amount;
    if (!reward) {
      const { data: eventData } = await supabase
        .from('events')
        .select('prize_pool')
        .eq('id', activeOperationId)
        .single();
      reward = eventData?.prize_pool || 5000;
    }

    console.log('Calling RPC complete_operation with:', { p_user_id: user.id, p_event_id: activeOperationId, p_reward: reward });

    const { error } = await supabase.rpc('complete_operation', {
      p_user_id: user.id,
      p_event_id: activeOperationId,
      p_reward: reward
    });

    if (error) {
      console.error('RPC FAILED:', error);
      alert(`CRITICAL DB ERROR: ${error.message}`);
      setDbError(`DB ERROR: ${error.message} (Code: ${error.code})`);
      setIsDecrypting(false);
      return;
    }

    // ONLY on success - show COMPLETE screen
    setIsClaimed(true);
    setMatchResult('victory');
  };

  const handleReturnToHq = () => {
    // Clear localStorage
    localStorage.removeItem('activeOperationId');

    // Reset all local states
    setIsDecrypting(false);
    setDecryptionProgress(0);
    setIsClaimed(false);
    setMatchResult('playing');
    setCanExit(false);
    setIsExtracting(false);
    setDbError(null);

    // Navigate to lobby
    if (onNavigate) {
      onNavigate('events');
    } else {
      onBack();
    }
  };

  return (
    <div className="absolute inset-0 w-full h-screen bg-black flex flex-col overflow-hidden">
      {/* Operation Header */}
      <div className="absolute top-0 w-full bg-black/90 border-b border-white/10 py-3 text-center z-[9999]">
        <span className="text-white font-mono text-sm font-bold uppercase tracking-wider px-4 truncate">
          {operationTitle || 'GLOBAL MAP'}
        </span>
      </div>

      {/* Pre-deployment Mario Kart countdown overlay */}
      {eventStatus === 'upcoming' && eventStartTime && (() => {
        // Validate date before parsing to prevent crashes
        let diffMs: number;
        try {
          const parsedDate = new Date(eventStartTime);
          if (isNaN(parsedDate.getTime())) {
            console.warn('Invalid eventStartTime in countdown:', eventStartTime);
            return null;
          }
          diffMs = parsedDate.getTime() - Date.now();
        } catch (e) {
          console.warn('Error parsing eventStartTime in countdown:', eventStartTime, e);
          return null;
        }

        const totalSec = Math.max(0, Math.ceil(diffMs / 1000));
        const isFinalCountdown = totalSec <= 3 && totalSec >= 1;
        const isGo = diffMs <= 0;

        // If START! overlay is active, render it with fade animation
        if (showStartOverlay) {
          return (
            <div 
              className="fixed inset-0 z-[9999] flex flex-col items-center justify-center backdrop-blur-2xl bg-black/70 pointer-events-none"
              style={{ opacity: startOverlayOpacity, transition: 'opacity 1500ms ease-out' }}
            >
              <div className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.4em] text-white/50 mb-6">
                Awaiting Deployment Signal
              </div>
              <div className="select-none font-black tracking-tighter text-green-400 text-7xl sm:text-9xl drop-shadow-[0_0_40px_rgba(74,222,128,0.6)] animate-pulse">
                START!
              </div>
              <div className="mt-8 text-[10px] font-mono uppercase tracking-[0.3em] text-white/40">
                Connecting to grid…
              </div>
            </div>
          );
        }

        // Show countdown for upcoming events (before GO)
        if (!isGo) {
          let bigText: string;
          if (isFinalCountdown) {
            bigText = String(totalSec);
          } else {
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;
            const pad = (n: number) => String(n).padStart(2, '0');
            bigText = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
          }

          return (
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center backdrop-blur-2xl bg-black/70 pointer-events-auto">
              <div className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.4em] text-white/50 mb-6">
                Awaiting Deployment Signal
              </div>
              <div
                key={bigText}
                className={`select-none font-black tracking-tighter ${
                  isFinalCountdown
                    ? 'text-red-500 text-[12rem] sm:text-[18rem] leading-none drop-shadow-[0_0_50px_rgba(239,68,68,0.7)]'
                    : 'text-white text-6xl sm:text-8xl tabular-nums'
                }`}
                style={{
                  animation: isFinalCountdown ? 'countdownPop 1s ease-out' : undefined,
                }}
              >
                {bigText}
              </div>
              <div className="mt-8 text-[10px] font-mono uppercase tracking-[0.3em] text-white/40">
                {isFinalCountdown ? 'Stand by' : 'T-Minus'}
              </div>
              <style>{`
                @keyframes countdownPop {
                  0% { transform: scale(0.5); opacity: 0; }
                  30% { transform: scale(1.15); opacity: 1; }
                  100% { transform: scale(1); opacity: 1; }
                }
              `}</style>
            </div>
          );
        }

        return null;
      })()}

      {/* Observer Mode Blur Overlay */}
      {activeOperationId === null && (eventStatus !== 'started' && eventStatus !== 'active' && eventStatus !== 'live') && (
        <div className="absolute inset-0 backdrop-blur-md bg-black/40 z-40 flex flex-col items-center justify-center px-4">
          {!localIsAwaitingDeployment ? (
            <div className="text-center space-y-4 px-8">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 mx-auto">
                <MapIcon className="w-8 h-8 text-white/40" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tighter uppercase">NO ACTIVE UPLINK</h2>
              <p className="text-sm text-white/60 font-medium">You haven't joined any events. Go to the Lobby to browse operations.</p>
            </div>
          ) : (
            <div className="w-full max-w-md space-y-4 max-h-[70vh] overflow-y-auto">
              <h2 className="text-xl font-black text-white tracking-tighter uppercase text-center mb-4">Your Registered Events</h2>
              {registeredEventsData
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .map((event) => {
                  const now = new Date();
                  const start = new Date(event.start_time);
                  const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
                  const canDeploy = diffMinutes <= 5;

                  return (
                    <div key={event.id} className="bg-[#1C1C1E] rounded-2xl p-4 space-y-3 border border-white/10">
                      <h3 className="text-lg font-black text-white">{event.title}</h3>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-accent-orange" />
                        <div className="text-3xl font-black text-white tracking-tighter">
                        {diffMinutes <= 0 ? (
                          <span className="text-red-500 animate-pulse">[ OPERATION LIVE ]</span>
                        ) : (
                          `${Math.floor(diffMinutes)} MIN`
                        )}
                      </div>
                      </div>
                      {canDeploy ? (
                        <button
                          onClick={() => onNavigate?.('hunt', event.id)}
                          className="w-full py-3 bg-green-500 text-white font-black rounded-full hover:brightness-110 active:scale-[0.98] transition-all animate-pulse"
                        >
                          START EVENT
                        </button>
                      ) : (
                        <p className="text-xs text-white/40 text-center">Deployment opens at T-minus 5m</p>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* GPS Error Banner */}
      <AnimatePresence>
        {isGpsError && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[999999] bg-red-900/90 border border-red-500/50 text-red-100 px-4 py-2 rounded-full text-xs font-mono tracking-widest shadow-[0_0_15px_rgba(220,38,38,0.5)] flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            GPS SIGNAL SEARCHING...
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <AnimatePresence>
        {trackingState !== 'VAULT_REACHED' && (
          <motion.div
            initial={{ y: -50 }}
            animate={{ y: 0 }}
            exit={{ y: -50 }}
            className="p-4 flex items-center justify-between border-b border-border-main bg-bg-deep/80 backdrop-blur-md z-20"
          >
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold tracking-widest text-text-muted">Operation</span>
              <span className="text-xs font-black text-text-main uppercase tracking-tighter italic">
                {trackingState === 'OUT_OF_SECTOR' ? 'Approach' : 'Interception'}
              </span>
            </div>

            <div className="flex gap-2">
                <button onClick={simulateTeleport} className="px-3 py-1.5 bg-white/5 border border-border-main rounded text-[9px] font-black text-text-main uppercase transition-all hover:bg-white/10">Teleport (1001m)</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isClaimed ? (
          <motion.div 
            key="success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 bg-[#0B0C10] text-center"
          >
            <div className="w-24 h-24 rounded-full bg-accent-orange/20 flex items-center justify-center border border-accent-orange mb-8 relative">
              <CheckCircle2 className="w-12 h-12 text-accent-orange" />
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full border border-accent-orange"
              />
            </div>
            
            <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-white to-green-400 tracking-tighter mb-4 scale-110 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]">COMPLETE.</h2>
            {dbError && (
              <div className="bg-red-900/80 border border-red-500 text-red-200 font-mono text-xs p-4 rounded-lg mb-4 max-w-md">
                {dbError}
              </div>
            )}
            <p className="text-xs font-mono text-text-muted uppercase tracking-widest mb-12">Asset decrypted and archived</p>

            <div className="grid grid-cols-1 gap-4 w-full max-w-xs mb-12">
              <div className="premium-panel p-6 flex flex-col items-center border-accent-orange/30">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-accent-orange" />
                  <span className="text-[10px] uppercase font-black text-text-muted">Deployment Reward</span>
                </div>
                <span className="text-3xl font-black text-green-400 animate-pulse shadow-[0_0_20px_#4ade80]">{vaultLocation?.reward_amount || 0} DOX</span>
              </div>
            </div>

            <button
              onClick={handleReturnToHq}
              className="w-full max-w-xs py-5 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 active:scale-95 transition-all text-sm"
            >
              RETURN TO TERMINAL
            </button>
          </motion.div>
        ) : trackingState === 'VAULT_REACHED' && isExtracting ? (
          <motion.div 
            key="vault-ui"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-bg-deep flex flex-col items-center justify-center p-8 space-y-12"
          >
            {/* Viewfinder UI */}
            <div className="relative">
              <div className="w-72 h-72 border border-accent-purple/30 bg-bg-inner/40 relative flex flex-col items-center justify-center rounded-lg overflow-hidden backdrop-blur-md">
                {/* Viewfinder Corners */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-accent-purple" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-accent-purple" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-accent-purple" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-accent-purple" />
                
                {isDecrypting ? (
                  <motion.div 
                    animate={{ top: ['0%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-0.5 bg-accent-orange/50 shadow-[0_0_15px_rgba(255,69,0,0.5)]"
                  />
                ) : (
                  <div className="flex flex-col items-center text-center px-4">
                    <Maximize className="w-10 h-10 text-accent-purple/30 mb-6 animate-pulse" />
                    <span className="text-[10px] font-black text-text-main uppercase tracking-[0.3em]">Align Asset Marker</span>
                  </div>
                )}

                {isDecrypting && (
                  <div className="absolute bottom-6 font-mono text-[10px] text-accent-orange tracking-[0.2em] font-bold">
                    DECRYPTING: {hexCode}
                  </div>
                )}
              </div>
            </div>

            <div className="w-full max-w-xs space-y-6">
              {!isDecrypting ? (
                <button 
                  onClick={startDecryption}
                  className="w-full py-6 bg-accent-orange text-white font-black text-xl italic tracking-tighter rounded-xl hover:brightness-110 active:scale-95 transition-all uppercase shadow-lg shadow-accent-orange/20"
                >
                  START EXTRACTION
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Processing...</span>
                    <span className="text-2xl font-black text-text-main italic tracking-tighter">{decryptionProgress}%</span>
                  </div>
                  <div className="w-full h-1 bg-border-main rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-accent-orange"
                      style={{ width: `${decryptionProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            
            <p className="text-[9px] text-text-muted font-mono uppercase text-center max-w-[200px] leading-relaxed opacity-50">
              Warning: keep device stationary while handshaking with node.
            </p>
          </motion.div>
        ) : (
          <motion.div 
            key="search-ui"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30"
          >
            <MapView
              theme={theme}
              userPos={[userLocation.latitude, userLocation.longitude]}
              accuracy={userLocation.accuracy}
              vaults={vaults}
              lootAnimations={lootAnimations}
              rewards={rewards}
              items={inventory.items}
              shouldCenter={shouldCenterMap}
              onMapReady={setMapInstance}
              onVaultClaim={(vaultId) => {
                if (socket) {
                  socket.emit('vault:claim', { vaultId });
                }
              }}
            />
            
            {/* LIVE ROSTER */}
            {activeOperationId && (
              <LiveRoster eventId={activeOperationId} />
            )}

            <div className="absolute top-20 left-4 right-4 z-20">
              <div className="bg-black/40 backdrop-blur-md rounded-full px-6 py-3 flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 relative">
                    <Key className="w-5 h-5 text-white/70" />
                    <span className={`text-2xl font-black ${requiredKeys > 0 && collectedKeys >= requiredKeys ? 'text-green-400 animate-pulse' : 'text-white'}`}>KEYS: {collectedKeys} / {requiredKeys}</span>
                    {showKeySpend && (
                      <span className="text-red-500 absolute -top-4 right-0 animate-bounce">-{requiredKeys}</span>
                    )}
                    {showKeyGain && (
                      <span className="text-green-500 absolute -bottom-6 transition-all duration-500 opacity-100 scale-100 translate-y-0">+1</span>
                    )}
                    {requiredKeys > 0 && collectedKeys >= requiredKeys && (
                      <span className="text-xs text-green-500 animate-bounce absolute -bottom-4 left-0 w-max">VAULT UNLOCK READY</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline justify-end gap-1">
                    <span className="text-2xl font-black text-white tracking-tighter leading-none">
                      {userLocation.latitude === 0 && userLocation.longitude === 0
                        ? 'WAITING...'
                        : nearestVaultDistance !== null
                        ? (nearestVaultDistance?.toFixed(0) ?? '0')
                        : 'SCAN'}
                    </span>
                    <span className="text-xs font-black text-white/50 uppercase tracking-wider">M</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DeadDrop Claim Button */}
      {matchResult === 'playing' && !isExtracting && nearestVaultDistance !== null && nearestVaultDistance < 15 && nearestVaultId && isConnected && (
        <button
          onClick={() => {
            if (socket && !isClaimingRef.current && collectedKeys >= requiredKeys) {
              setIsExtracting(true);
            }
          }}
          disabled={collectedKeys < requiredKeys}
          className={`fixed bottom-[140px] left-1/2 transform -translate-x-1/2 z-[999999] w-max min-w-[220px] px-8 rounded-xl py-4 font-bold text-lg uppercase tracking-widest transition-all animate-pulse shadow-lg shadow-accent-orange/20 ${
            collectedKeys >= requiredKeys
              ? 'bg-accent-orange/30 border-2 border-accent-orange text-accent-orange hover:bg-accent-orange/40'
              : 'bg-gray-500/30 border-2 border-gray-500 text-gray-400 cursor-not-allowed'
          }`}
        >
          OPEN VAULT
        </button>
      )}

      {/* Crypto Key Pickup Button */}
      {matchResult === 'playing' && nearbyItem && (
        <button
          onClick={handleClaimItem}
          className="fixed bottom-[140px] left-1/2 transform -translate-x-1/2 z-[999999] w-max min-w-[220px] px-8 rounded-xl py-4 font-bold text-lg bg-purple-600/90 backdrop-blur-md border-2 border-purple-400 text-white uppercase tracking-widest hover:bg-purple-700/90 transition-all animate-pulse shadow-lg shadow-purple-600/50"
        >
          CLAIM KEY
        </button>
      )}

      {/* Zoom Controls - Left Bottom - Only show when countdown is finished */}
      {matchResult === 'playing' && mapInstance && activeOperationId && eventStatus !== 'upcoming' && (
        <div className="fixed bottom-36 left-4 flex flex-col gap-2 z-[999999]">
          {/* Zoom In FAB */}
          <button
            onClick={() => {
              if (mapInstance) {
                mapInstance.zoomIn();
              }
            }}
            className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Zoom Out FAB */}
          <button
            onClick={() => {
              if (mapInstance) {
                mapInstance.zoomOut();
              }
            }}
            className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Right Side FABs - Bottom Right - Only show when countdown is finished */}
      {matchResult === 'playing' && activeOperationId && eventStatus !== 'upcoming' && (
        <div className="fixed bottom-36 right-4 flex flex-col items-center gap-3 z-[9999]">
        {/* Map Refresh Button */}
        {mapInstance && (
          <button
            onClick={() => {
              setIsRefreshing(true);
              const fetchEventItems = async () => {
                const { data, error } = await supabase
                  .from('event_items')
                  .select('*')
                  .eq('event_id', activeOperationId)
                  .eq('is_claimed', false);
                if (data && Array.isArray(data)) {
                  setInventory(prev => ({ ...prev, items: data }));
                }
                // Also refresh collected keys count
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  const { data: participantData } = await supabase
                    .from('event_participants')
                    .select('keys_balance')
                    .eq('event_id', activeOperationId)
                    .eq('user_id', user.id)
                    .single();
                  if (participantData) {
                    setCollectedKeys(participantData.keys_balance || 0);
                  }
                }
              };
              fetchEventItems();
              setTimeout(() => setIsRefreshing(false), 500);
            }}
            className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* NOTE: Vault spawning is server-authoritative. Client only listens to vault events via socket / polling. */}

        {/* Crosshair FAB */}
        <button
          onClick={() => {
            if (mapInstance) {
              mapInstance.flyTo([userLocation.latitude, userLocation.longitude], 16, { duration: 1 });
            }
          }}
          className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all"
        >
          <Crosshair className="w-5 h-5" />
        </button>

        {/* Audio Toggle FAB */}
        <button
          onClick={toggleAudio}
          className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all"
        >
          {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
      </div>
      )}

      {/* Claim Overlay */}
      {claimOverlay && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm transition-all duration-300 ease-out transform opacity-100 scale-100 translate-y-0">
          <div className="bg-purple-600/20 border border-purple-500 text-purple-400 font-mono text-xl tracking-widest px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(168,85,247,0.4)] uppercase">
            {claimOverlay} - {collectedKeys}/{requiredKeys}
          </div>
        </div>
      )}

      {/* Victory Screen */}
      <AnimatePresence>
        {matchResult === 'victory' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md"
          >
            {/* Noise Overlay */}
            <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
              animation: 'noise 0.2s infinite'
            }} />
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="relative z-10 text-center space-y-6 px-8 pointer-events-auto"
            >
              <div className="w-24 h-24 rounded-full bg-green-500/20 border-4 border-green-400 flex items-center justify-center mx-auto animate-pulse">
                <Trophy className="w-12 h-12 text-green-400" />
              </div>
              <h1 className="text-5xl font-black text-white tracking-tighter uppercase">VAULT SECURED</h1>
              <p className="text-3xl font-bold text-green-300">+{vaultLocation?.reward_amount || 0} DOX</p>
              <p className="text-sm text-white/60 font-medium">Reward credited to your account</p>
              <button
                onClick={handleReturnToHq}
                className="relative z-[99999999] pointer-events-auto mt-8 px-8 py-4 font-bold rounded-full uppercase tracking-widest transition-all bg-green-500 hover:bg-green-600 text-white cursor-pointer"
              >
                BACK TO LOBBY
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Defeat Screen */}
      <AnimatePresence>
        {matchResult === 'defeat' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999999] flex flex-col items-center justify-center bg-red-900/40 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="text-center space-y-6 px-8"
            >
              <div className="w-24 h-24 rounded-full bg-red-500/20 border-4 border-red-400 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-12 h-12 text-red-400" />
              </div>
              <h1 className="text-4xl font-black text-white tracking-tighter uppercase">OPERATION TERMINATED</h1>
              <p className="text-lg text-red-300 font-medium">VAULT COMPROMISED BY ANOTHER HUNTER</p>
              <button
                onClick={() => {
                  localStorage.removeItem('activeOperationId');
                  if (onNavigate) {
                    onNavigate('events');
                  }
                }}
                disabled={!canExit}
                className={`mt-8 px-8 py-4 font-bold rounded-full uppercase tracking-widest transition-all ${canExit ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-red-500/50 text-white/50 cursor-not-allowed'}`}
              >
                RETURN TO LOBBY
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection Error Overlay - Non-destructive overlay */}
      {showConnectionError && !isConnected && (
        <div className="fixed inset-0 z-[9999999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center pointer-events-auto">
          <div className="text-center">
            <p className="text-2xl font-black text-red-500 uppercase tracking-widest animate-pulse">
              CONNECTION LOST. RECONNECTING...
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2 bg-white text-black hover:bg-gray-200 font-bold uppercase tracking-widest rounded-lg transition-colors"
            >
              REFRESH
            </button>
          </div>
        </div>
      )}


      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="premium-panel px-6 py-3 border-l-4 border-red-500 shadow-2xl">
              <p className="text-[11px] font-black text-red-400 uppercase tracking-widest">
                ⚠ {error}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
