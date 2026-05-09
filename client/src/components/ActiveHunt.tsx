/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ShieldAlert, Cpu, Lock, Zap, Maximize, CheckCircle2, TrendingUp, Key, SignalLow, Trophy, VolumeX, Volume2, Crosshair, Map, User, Shield, Clock } from 'lucide-react';
import MapView from './MapView';
import Radar from './Radar';
import { getDistance, TARGET_LOCATION } from '../utils/geoUtils';
import { io, Socket } from 'socket.io-client';
import { supabase } from '../lib/supabase';

interface ActiveHuntProps {
  initialCoords: { latitude: number; longitude: number; accuracy: number };
  onBack: () => void;
  theme: 'dark' | 'light';
  balance: number;
  keys: number;
  activeOperationId?: string | null;
  registeredEvents?: Array<{ id: string; start_time: string }>;
}

type TrackingState = 'OUT_OF_SECTOR' | 'IN_SECTOR' | 'VAULT_REACHED';

export default function ActiveHunt({ initialCoords, onBack, theme, balance, keys, activeOperationId, registeredEvents = [] }: ActiveHuntProps) {
  const [userLocation, setUserLocation] = useState(initialCoords);
  const [distance, setDistance] = useState(0);
  const [trackingState, setTrackingState] = useState<TrackingState>('OUT_OF_SECTOR');
  const [isGpsError, setIsGpsError] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

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
        console.log('Получен инвентарь:', inventoryData);
        if (inventoryData) {
          setInventory({
            items: inventoryData.items || [],
            balance: inventoryData.balance ?? 0,
            role: inventoryData.role || 'user'
          });
        }
      });

      // Listen for inventory updates
      socketInstance.on('inventory:update', (inventoryData) => {
        console.log('Инвентарь обновлен:', inventoryData);
        if (inventoryData) {
          setInventory(prev => ({
            items: inventoryData.items ?? prev.items,
            balance: inventoryData.balance ?? prev.balance,
            role: inventoryData.role ?? prev.role
          }));
        }
      });

      // Listen for vault errors
      socketInstance.on('vault:error', (error) => {
        console.error('Ошибка сейфа:', error.message);
        setError(error.message);
        setTimeout(() => setError(null), 3000);
      });

      // Listen for player profile sync (from profiles table) - now handled in App.tsx
      // socketInstance.on('player:sync', (profileData) => {
      //   console.log('Получен профиль:', profileData);
      //   if (profileData) {
      //     setProfile({
      //       keys: profileData.keys ?? 0,
      //       balance: profileData.balance ?? 0
      //     });
      //   }
      // });

      // Listen for no keys error
      socketInstance.on('error:no_keys', (error) => {
        console.error('Ошибка ключей:', error.message);
        setError(error.message);
        setTimeout(() => setError(null), 3000);
      });

      // Listen for vault claimed
      socketInstance.on('vault:claimed', (vault) => {
        console.log('Сейф открыт:', vault);
        // Reset claiming flag
        isClaimingRef.current = false;
        // Reset nearest vault state to hide button
        setNearestVaultDistance(null);
        setNearestVaultId(null);
        // Remove vault from map state immediately
        setVaults(prev => prev.filter(v => v.id !== vault.id));
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
    const d = getDistance(
      userLocation.latitude,
      userLocation.longitude,
      TARGET_LOCATION.lat,
      TARGET_LOCATION.lng
    );
    setDistance(d);

    if (d <= 10 && !isClaimed) {
      setTrackingState('VAULT_REACHED');
    } else if (d <= 1000) {
      setTrackingState('IN_SECTOR');
    } else {
      setTrackingState('OUT_OF_SECTOR');
    }
  }, [userLocation, isClaimed]);

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
    setUserLocation({
      latitude: TARGET_LOCATION.lat + 0.00901, // ~1km away
      longitude: TARGET_LOCATION.lng,
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
      {/* Observer Mode Blur Overlay */}
      {activeOperationId === null && (
        <div className="absolute inset-0 backdrop-blur-md bg-black/40 z-40 flex flex-col items-center justify-center">
          {!hasRegisteredEvents ? (
            <div className="text-center space-y-4 px-8">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 mx-auto">
                <Map className="w-8 h-8 text-white/40" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tighter uppercase">NO ACTIVE UPLINK</h2>
              <p className="text-sm text-white/60 font-medium">BROWSE OPERATIONS IN LOBBY</p>
            </div>
          ) : !canDeployToNearest ? (
            <div className="text-center space-y-4 px-8">
              <div className="w-16 h-16 rounded-full bg-accent-orange/10 flex items-center justify-center border border-accent-orange/30 mx-auto">
                <Clock className="w-8 h-8 text-accent-orange/60" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tighter uppercase">AWAITING DEPLOYMENT</h2>
              {nearestEvent && (
                <p className="text-sm text-white/60 font-mono">
                  NEXT OP IN: {(() => {
                    const now = new Date();
                    const start = new Date(nearestEvent.start_time);
                    const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
                    if (diffMinutes < 60) return `${Math.floor(diffMinutes)} MIN`;
                    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} HOURS`;
                    return `${Math.floor(diffMinutes / 1440)} DAYS`;
                  })()}
                </p>
              )}
              <p className="text-xs text-white/40 font-medium">RETURN TO LOBBY TO STANDBY</p>
            </div>
          ) : null}
        </div>
      )}

      {/* GPS Error Banner */}
      <AnimatePresence>
        {isGpsError && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="z-[60] bg-accent-orange text-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-center flex items-center justify-center gap-3 overflow-hidden border-b border-white/10"
          >
            <ShieldAlert className="w-5 h-5 animate-pulse" />
            ⚠️ CRITICAL: GPS SIGNAL LOST OR DENIED. CHECK DEVICE PERMISSIONS. ⚠️
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
                <span className="text-3xl font-black text-text-main">10,000 CZK</span>
              </div>
            </div>

            <button 
              onClick={handleReturnToHq}
              className="w-full max-w-xs py-5 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 active:scale-95 transition-all text-sm"
            >
              RETURN TO TERMINAL
            </button>
          </motion.div>
        ) : trackingState === 'VAULT_REACHED' ? (
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
              shouldCenter={shouldCenterMap}
              onVaultClaim={(vaultId) => {
                if (socket) {
                  socket.emit('vault:claim', { vaultId });
                }
              }}
            />
            
            <div className="absolute top-6 left-4 right-4 z-20">
              <div className="bg-black/40 backdrop-blur-md rounded-full px-6 py-3 flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-white/70" />
                    <span className="text-2xl font-black text-white">{keys}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white/70">{balance} Kč</span>
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
              <div className="absolute top-24 left-4">
                <div className="bg-black/60 backdrop-blur-md text-white/50 text-xs px-2 py-1 rounded border border-white/10 z-50">
                  <span className="font-mono uppercase tracking-widest">
                    {activeOperationId ? `OP: ${activeOperationId}` : 'FREE ROAMING'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DeadDrop Claim Button */}
      {nearestVaultDistance !== null && nearestVaultDistance < 15 && nearestVaultId && isConnected && (
        <button
          onClick={() => {
            if (socket && !isClaimingRef.current) {
              isClaimingRef.current = true;
              socket.emit('vault:claim', { vaultId: nearestVaultId });
            }
          }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-8 py-4 bg-accent-orange/30 border-2 border-accent-orange rounded-lg text-sm font-black text-accent-orange uppercase tracking-widest hover:bg-accent-orange/40 transition-all animate-pulse shadow-lg shadow-accent-orange/20"
        >
          ВЗЛОМАТЬ DEADDROP
        </button>
      )}

      {/* FAB Buttons Container */}
      <div className="absolute bottom-32 right-4 flex flex-col gap-4 z-50">
        {/* Admin Spawn Vault FAB */}
        {inventory.role === 'admin' && (
          <button
            onClick={() => {
              if (socket) {
                socket.emit('dev:spawn_near');
              }
            }}
            disabled={!isConnected}
            className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-cyan-400 hover:bg-black/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trophy className="w-5 h-5" />
          </button>
        )}

        {/* Audio FAB */}
        <button
          onClick={toggleAudio}
          disabled={!isConnected}
          className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        {/* Center Map FAB */}
        <button
          onClick={() => {
            setShouldCenterMap(true);
            setTimeout(() => setShouldCenterMap(false), 1000);
          }}
          className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all"
        >
          <Crosshair className="w-5 h-5" />
        </button>
      </div>

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
              onClick={() => {
                if (socket) {
                  socket.emit('dev:spawn_near');
                }
              }}
              disabled={!isConnected}
              className="w-full px-3 py-2 bg-accent-orange/20 border border-accent-orange/40 rounded text-[9px] font-black text-accent-orange uppercase tracking-wider hover:bg-accent-orange/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              SPAWN DEADDROP
            </button>
          </div>
        </div>
      )}

      {/* Connection Error Overlay - Non-destructive overlay */}
      {showConnectionError && !isConnected && (
        <div className="absolute inset-0 bg-red-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-black text-red-400 uppercase tracking-widest animate-pulse">
              CRITICAL ERROR: UPLINK LOST
            </p>
            <p className="text-sm font-bold text-red-300 uppercase tracking-widest mt-2">
              RECONNECTING...
            </p>
          </div>
        </div>
      )}

      {/* GPS Error Warning Bar */}
      {(gpsAccuracy > 50 || isGpsError) && (
        <div className="fixed top-0 left-0 right-0 z-[90] bg-red-900/90 backdrop-blur-sm py-2 px-4">
          <p className="text-center text-xs font-black text-red-300 uppercase tracking-widest">
            CRITICAL: GPS SIGNAL LOST. CHECK LOCATION PERMISSIONS.
          </p>
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
