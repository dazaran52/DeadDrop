/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'framer-motion';
import { Clock, TrendingUp, Target } from 'lucide-react';

export default function Events() {
  const mockEvents = [
    {
      id: 1,
      badge: 'STARTS IN 45 MINS',
      title: 'OPERATION: LETNA DROP',
      prizePool: '50,000',
      entry: '500',
    },
    {
      id: 2,
      badge: 'STARTS IN 2 HOURS',
      title: 'OPERATION: ANDEL RAID',
      prizePool: '75,000',
      entry: '750',
    },
    {
      id: 3,
      badge: 'STARTING SOON',
      title: 'OPERATION: WENCESLAS HEIST',
      prizePool: '100,000',
      entry: '1,000',
    },
  ];

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto pb-24 bg-bg-deep">
      {/* Header */}
      <div className="flex flex-col space-y-1">
        <h1 className="text-3xl font-black text-text-main tracking-tighter">ACTIVE DROPS</h1>
        <p className="text-xs font-medium text-text-muted uppercase tracking-widest">Live Operations</p>
      </div>

      {/* Event Cards */}
      <div className="space-y-6">
        {mockEvents.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-[#1C1C1E] rounded-[2.5rem] p-6 shadow-2xl space-y-6"
          >
            {/* Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-500" />
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                  {event.badge}
                </span>
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-black text-white tracking-tight leading-none">
              {event.title}
            </h2>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">
                    PRIZE POOL
                  </span>
                </div>
                <span className="text-2xl font-black text-green-500 tracking-tighter">
                  {event.prizePool} Kč
                </span>
              </div>

              <div className="bg-black/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-text-muted" />
                  <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">
                    ENTRY
                  </span>
                </div>
                <span className="text-2xl font-black text-white tracking-tighter">
                  {event.entry} Kč
                </span>
              </div>
            </div>

            {/* Enter Button */}
            <button className="w-full py-4 bg-accent-orange text-white font-black text-lg rounded-full hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-accent-orange/10 border border-white/10">
              ENTER EVENT
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
