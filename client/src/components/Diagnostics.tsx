/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface DiagnosticsProps {
  distance: number;
  accuracy: number;
  lat: number;
  lng: number;
  status?: string;
}

export default function Diagnostics({ distance, accuracy, lat, lng, status }: DiagnosticsProps) {
  return (
    <div className="fixed bottom-24 right-4 z-[99] pointer-events-none">
      <div className="bg-black/60 backdrop-blur-md border border-white/10 p-2 rounded text-[8px] font-mono text-gray-400 space-y-0.5 shadow-xl min-w-[140px]">
        {status && (
          <div className="border-b border-white/10 pb-1 mb-1">
            <span className="text-accent-blue font-black tracking-tighter uppercase">{status}</span>
          </div>
        )}
        <div className="flex justify-between space-x-4">
          <span className="opacity-60 uppercase font-black tracking-tight">dist:</span>
          <span className="font-bold text-accent-blue">{(distance ?? 0).toFixed(1)}m</span>
        </div>
        <div className="flex justify-between space-x-4">
          <span className="opacity-60 uppercase font-black tracking-tight">acc:</span>
          <span className="text-white">±{(accuracy ?? 0).toFixed(1)}m</span>
        </div>
        <div className="flex justify-between space-x-4 border-t border-white/10 pt-1 mt-1">
          <span className="opacity-60 uppercase font-black tracking-tight">lat:</span>
          <span className="text-white">{(lat ?? 0).toFixed(6)}</span>
        </div>
        <div className="flex justify-between space-x-4">
          <span className="opacity-60 uppercase font-black tracking-tight">lng:</span>
          <span className="text-white">{(lng ?? 0).toFixed(6)}</span>
        </div>
      </div>
    </div>
  );
}
