/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapContainer, TileLayer, Marker, useMap, Circle, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { Plus, Minus } from 'lucide-react';

// Add CSS animation for loot text and vault fade out
const style = document.createElement('style');
style.textContent = `
  @keyframes floatUp {
    0% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-50px);
    }
  }
  @keyframes vaultFadeOut {
    0% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(0.5);
    }
  }
  @keyframes rewardFloatUp {
    0% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(-60px) scale(1.2);
    }
  }
`;
document.head.appendChild(style);

// Fix for default marker icons in Leaflet with React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapViewProps {
  userPos: [number, number];
  accuracy: number;
  theme: 'dark' | 'light';
  vaults?: any[];
  lootAnimations?: any[];
  rewards?: {id: string, amount: number, lat: number, lng: number}[];
  items?: any[];
  onVaultClaim?: (vaultId: string) => void;
  shouldCenter?: boolean;
}

function RecenterMap({ pos, shouldCenter }: { pos: [number, number]; shouldCenter: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (shouldCenter) {
      map.flyTo(pos, 16);
    }
  }, [shouldCenter, pos, map]);
  return null;
}

function ZoomControl() {
  const map = useMap();

  const handleZoomIn = () => {
    map.zoomIn();
  };

  const handleZoomOut = () => {
    map.zoomOut();
  };

  return (
    <div className="fixed right-4 bottom-[220px] z-[99999] bg-black/80 backdrop-blur-md border border-white/10 rounded-full flex flex-col overflow-hidden">
      <button
        onClick={handleZoomIn}
        className="w-12 h-12 flex items-center justify-center hover:bg-white/10 transition-colors"
      >
        <Plus size={20} className="text-white" />
      </button>
      <div className="border-b border-white/10" />
      <button
        onClick={handleZoomOut}
        className="w-12 h-12 flex items-center justify-center hover:bg-white/10 transition-colors"
      >
        <Minus size={20} className="text-white" />
      </button>
    </div>
  );
}

export default function Map({ userPos, accuracy, theme, vaults = [], lootAnimations = [], rewards = [], items = [], onVaultClaim, shouldCenter = false }: MapViewProps) {
  return (
    <div className="w-full h-full relative group">
      {/* Map Scanning line effect */}
      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden mix-blend-overlay opacity-20">
        <div className="w-full h-1 bg-accent-blue absolute animate-[scan_4s_linear_infinite]" />
      </div>

      <MapContainer
        center={userPos}
        zoom={16}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        zoomControl={false}
        attributionControl={false}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        scrollWheelZoom={true}
        className={`w-full h-full ${theme === 'dark' ? 'dark-map' : ''}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={theme === 'dark' 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          }
        />
        <Circle 
          center={userPos} 
          radius={accuracy} 
          pathOptions={{ color: '#00d2ff', fillColor: '#00d2ff', fillOpacity: 0.1, weight: 1 }} 
        />
        <Marker 
          position={userPos} 
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: #00d2ff; width: 12px; height: 12px; border-radius: 50%; border: 2px solid ${theme === 'dark' ? 'white' : 'black'}; box-shadow: 0 0 10px #00d2ff;"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          })}
        />
        
        {/* Loot Animations */}
        {lootAnimations.map((animation) => (
          <Marker
            key={animation.id}
            position={[animation.lat, animation.lng]}
            icon={L.divIcon({
              className: 'custom-loot-icon',
              html: `<div style="
                color: #00ff00;
                font-size: 14px;
                font-weight: bold;
                text-shadow: 0 0 10px #00ff00;
                animation: floatUp 2s ease-out forwards;
              ">+${animation.amount} Kč</div>`,
              iconSize: [100, 30],
              iconAnchor: [50, 15]
            })}
          />
        ))}

        {/* Reward Animations */}
        {rewards.map((reward) => (
          <Marker
            key={reward.id}
            position={[reward.lat, reward.lng]}
            icon={L.divIcon({
              className: 'custom-reward-icon',
              html: `<div style="
                color: #00ff00;
                font-size: 18px;
                font-weight: bold;
                text-shadow: 0 0 15px #00ff00, 0 0 30px #00ff00;
                animation: rewardFloatUp 2s ease-out forwards;
                white-space: nowrap;
              ">+${reward.amount} Kč</div>`,
              iconSize: [150, 40],
              iconAnchor: [75, 20]
            })}
          />
        ))}

        {/* Key Items */}
        {items.map((item) => (
          <Marker
            key={item.id}
            position={[item.lat, item.lng]}
            icon={L.divIcon({
              className: 'custom-key-icon',
              html: `<div style="
                width: 32px;
                height: 32px;
                background: rgba(168, 85, 247, 0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(168, 85, 247, 1);
                box-shadow: 0 0 15px rgba(168, 85, 247, 0.5);
                animation: pulse 2s ease-in-out infinite;
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(168, 85, 247, 1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                </svg>
              </div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })}
          />
        ))}

        <ZoomControl />
        <RecenterMap pos={userPos} shouldCenter={shouldCenter} />
      </MapContainer>

      {/* Aesthetic frame corners */}
      <div className="absolute top-4 left-4 w-6 h-6 border-t border-l border-accent-blue/40 z-10" />
      <div className="absolute top-4 right-4 w-6 h-6 border-t border-r border-accent-blue/40 z-10" />
      <div className="absolute bottom-4 left-4 w-6 h-6 border-b border-l border-accent-blue/40 z-10" />
      <div className="absolute bottom-4 right-4 w-6 h-6 border-b border-r border-accent-blue/40 z-10" />
    </div>
  );
}
