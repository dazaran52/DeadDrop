/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, X, Volume2, VolumeX, Trophy, User, Target, Crosshair, Lock, Shield, Key, Clock, Activity, Plus, Minus, ShieldAlert, CheckCircle2, TrendingUp, Maximize, RefreshCw } from 'lucide-react';
import MapView from './MapView';
import Radar from './Radar';
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
  const [showKeySpend, setShowKeySpend] = useState<boolean>(false);
  const [showKeyGain, setShowKeyGain] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Fetch operation title and required_keys when activeOperationId changes
  useEffect(() => {
    if (activeOperationId) {
      // Fetch operation title and required_keys
      const fetchOperationInfo = async () => {
        const { data, error } = await supabase
          .from('events')
          .select('title, required_keys')
          .eq('id', activeOperationId)
          .single();

        if (data) {
          setOperationTitle(data.title);
          setRequiredKeys(data.required_keys || 0);
        }
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
          // User is not a participant - soft reset to observer mode
          localStorage.removeItem('activeOperationId');
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

      // Vibrate if supported
      if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 1000]);
      }

      // Play victory sound (optional - prepare code)
      // new Audio('/victory.mp3').play().catch(() => {});

      // Enable exit button after 3 seconds
      setTimeout(() => setCanExit(true), 3000);
    } else if (matchResult === 'defeat') {
      // Vibrate on defeat
      if (navigator.vibrate) {
        navigator.vibrate([800]);
      }

      // Enable exit button after 3 seconds
      setTimeout(() => setCanExit(true), 3000);
    } else if (matchResult === 'playing') {
      // Reset canExit when match resets
      setCanExit(false);
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
          if (payload.new.status === 'completed' && matchResult !== 'victory') {
            setMatchResult('defeat');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOperationId, matchResult]);

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
  const [showDev, setShowDev] = useState(false);
  const [showConnectionError, setShowConnectionError] = useState(false);
  
  // Refs for Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isClaimingRef = useRef(false);
  
  // Hacking states
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionProgress, setDecryptionProgress] = useState(0);
  const [hexCode, setHexCode] = useState('0x000000');
  const [isClaimed, setIsClaimed] = useState(false);

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

        // Add reward to user balance and update event status
        const handleEndgame = async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.error('User not authenticated');
            setError('TRANSACTION FAILED: User not authenticated');
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

          // Update user balance
          const { error: balanceError } = await supabase
            .from('profiles')
            .update({ balance: balance + reward })
            .eq('id', user.id);

          if (balanceError) {
            console.error('FULL DB ERROR (balance update):', balanceError);
            setError('TRANSACTION FAILED: Could not update balance');
            return;
          }

          // Update event status to completed
          const { error: eventStatusError } = await supabase
            .from('events')
            .update({ status: 'completed' })
            .eq('id', activeOperationId);

          if (eventStatusError) {
            console.error('FULL DB ERROR (status update):', eventStatusError);
            setError('SYSTEM ERROR: DATABASE REJECTED STATUS CHANGE');
            return;
          }

          // Set victory if no errors
          setMatchResult('victory');
        };
        handleEndgame();

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

  const startDecryption = () => {
    setIsDecrypting(true);
    let prog = 0;
    const interval = setInterval(() => {
      prog += 2;
      setDecryptionProgress(prog);
      if (prog >= 100) {
        clearInterval(interval);
        setTimeout(() => setIsClaimed(true), 500);
      }
    }, 60);
  };

  const handleReturnToHq = () => {
    // Reset all local states
    setIsDecrypting(false);
    setDecryptionProgress(0);
    setIsClaimed(false);
    onBack();
  };

  return (
    <div className="absolute inset-0 w-full h-screen bg-black flex flex-col overflow-hidden">
      {/* Operation Header */}
      <div className="absolute top-0 w-full bg-black/90 border-b border-white/10 py-3 text-center z-[9999]">
        <span className="text-white font-mono text-sm font-bold uppercase tracking-wider px-4 truncate">
          {operationTitle || 'GLOBAL MAP'}
        </span>
      </div>

      {/* Observer Mode Blur Overlay */}
      {activeOperationId === null && (
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
            
            <h2 className="text-5xl font-black text-text-main tracking-tighter mb-4 scale-110">COMPLETE.</h2>
            <p className="text-xs font-mono text-text-muted uppercase tracking-widest mb-12">Asset decrypted and archived</p>
            
            <div className="grid grid-cols-1 gap-4 w-full max-w-xs mb-12">
              <div className="premium-panel p-6 flex flex-col items-center border-accent-orange/30">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-accent-orange" />
                  <span className="text-[10px] uppercase font-black text-text-muted">Deployment Reward</span>
                </div>
                <span className="text-3xl font-black text-text-main">{vaultLocation?.reward_amount || 0} CZK</span>
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
                        ? nearestVaultDistance.toFixed(0)
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
      {matchResult === 'playing' && nearestVaultDistance !== null && nearestVaultDistance < 15 && nearestVaultId && isConnected && (
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

      {/* Zoom Controls - Left Bottom */}
      {mapInstance && activeOperationId && matchResult === 'playing' && (
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

      {/* Right Side FABs - Bottom Right */}
      {activeOperationId && matchResult === 'playing' && (
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

        {/* Admin Spawn Vault FAB */}
        {inventory.role === 'admin' && (
          <button
            onClick={async () => {
              if (!activeOperationId) return;

              // Check if vault already exists for this event
              const { data: existingVault } = await supabase
                .from('vaults')
                .select('id')
                .eq('event_id', activeOperationId)
                .single();

              if (existingVault) {
                // Update existing vault
                await supabase
                  .from('vaults')
                  .update({
                    lat: userLocation.latitude,
                    lng: userLocation.longitude,
                    is_active: true
                  })
                  .eq('id', existingVault.id);
              } else {
                // Insert new vault
                await supabase
                  .from('vaults')
                  .insert({
                    event_id: activeOperationId,
                    lat: userLocation.latitude,
                    lng: userLocation.longitude,
                    reward_amount: 5000,
                    is_active: true
                  });
              }

              // Refresh vault location
              const { data: vaultData } = await supabase
                .from('vaults')
                .select('lat, lng, reward_amount')
                .eq('event_id', activeOperationId)
                .single();

              if (vaultData) {
                setVaultLocation({
                  lat: vaultData.lat,
                  lng: vaultData.lng,
                  reward_amount: vaultData.reward_amount
                });
              }
            }}
            className="w-12 h-12 rounded-full bg-accent-orange/30 border border-accent-orange/50 flex items-center justify-center text-accent-orange hover:bg-accent-orange/40 transition-all"
          >
            <Trophy className="w-5 h-5" />
          </button>
        )}

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
            className="fixed inset-0 z-[9999999] flex flex-col items-center justify-center bg-green-900/40 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="text-center space-y-6 px-8"
            >
              <div className="w-24 h-24 rounded-full bg-green-500/20 border-4 border-green-400 flex items-center justify-center mx-auto animate-pulse">
                <Trophy className="w-12 h-12 text-green-400" />
              </div>
              <h1 className="text-5xl font-black text-white tracking-tighter uppercase">VAULT SECURED</h1>
              <p className="text-3xl font-bold text-green-300">+{vaultLocation?.reward_amount || 0} Kč</p>
              <p className="text-sm text-white/60 font-medium">Reward credited to your account</p>
              <button
                onClick={() => {
                  localStorage.removeItem('activeOperationId');
                  if (onNavigate) {
                    onNavigate('events');
                  }
                }}
                disabled={!canExit}
                className={`mt-8 px-8 py-4 font-bold rounded-full uppercase tracking-widest transition-all ${canExit ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-green-500/50 text-white/50 cursor-not-allowed'}`}
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

      {/* DEV Menu Toggle */}
      {process.env.NODE_ENV === 'development' && (
        <button
          onClick={() => setShowDev(!showDev)}
          className="fixed bottom-2 left-2 z-50 px-2 py-1 bg-black/50 border border-gray-700/50 rounded text-[8px] font-black text-gray-400 uppercase tracking-wider hover:bg-black/70 transition-colors"
        >
          ⚙️ v0.1
        </button>
      )}

      {/* DEV Menu */}
      {process.env.NODE_ENV === 'development' && showDev && (
        <div className="fixed bottom-8 left-4 z-50 space-y-2">
          <div className="bg-black/90 border border-gray-700/50 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-[8px] font-mono text-green-400 mb-2">
              STATUS: {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </div>
            <button
              onClick={async () => {
                if (!activeOperationId) return;

                // Check if vault already exists for this event
                const { data: existingVault } = await supabase
                  .from('vaults')
                  .select('id')
                  .eq('event_id', activeOperationId)
                  .single();

                if (existingVault) {
                  // Update existing vault
                  await supabase
                    .from('vaults')
                    .update({
                      lat: userLocation.latitude,
                      lng: userLocation.longitude,
                      is_active: true
                    })
                    .eq('id', existingVault.id);
                } else {
                  // Insert new vault
                  await supabase
                    .from('vaults')
                    .insert({
                      event_id: activeOperationId,
                      lat: userLocation.latitude,
                      lng: userLocation.longitude,
                      reward_amount: 5000,
                      is_active: true
                    });
                }

                // Refresh vault location
                const { data: vaultData } = await supabase
                  .from('vaults')
                  .select('lat, lng, reward_amount')
                  .eq('event_id', activeOperationId)
                  .single();

                if (vaultData) {
                  setVaultLocation({
                    lat: vaultData.lat,
                    lng: vaultData.lng,
                    reward_amount: vaultData.reward_amount
                  });
                }
              }}
              disabled={!activeOperationId}
              className="w-full px-3 py-2 bg-accent-orange/20 border border-accent-orange/40 rounded text-[9px] font-black text-accent-orange uppercase tracking-wider hover:bg-accent-orange/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              SPAWN DEADDROP
            </button>
          </div>
        </div>
      )}

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
