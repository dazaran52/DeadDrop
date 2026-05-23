const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CLIENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  /\.vercel\.app$/, // Разрешает любые твои деплои на Vercel
];

const app = express();

app.use(cors({ 
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (например, мобильные приложения или curl) 
    // или если origin в списке разрешенных
    if (!origin || CLIENT_ORIGINS.some(allowed => 
      typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
    )) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }, 
  credentials: true 
}));

app.use(express.json());

// ── Vaults (Dynamic generation around player) ─────────────────────────────────

const playerPositions = new Map(); // Track player positions by playerId
const socketToPlayerId = new Map(); // Map socket.id to playerId

const MAX_SPEED_MS = 8.3; // m/s = 30 km/h (walking/running max)
const MAX_STRIKES = 3;    // strikes before flagging

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - First latitude
 * @param {number} lng1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lng2 - Second longitude
 * @returns {number} - Distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: true, // В продакшене проще разрешить true с credentials для сокетов
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ── REST ──────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[socket] connected  : ${socket.id}`);

  // Handle player identification
  socket.on('player:identify', async ({ playerId }) => {
    try {
      socketToPlayerId.set(socket.id, playerId);
      console.log(`[socket] player ${playerId} identified as ${socket.id}`);

      // Fetch player data from database
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('balance, role')
        .eq('id', playerId)
        .single();

      if (error) {
        console.error('[db] Error fetching profile:', error);
        socket.emit('inventory:init', { balance: 0, role: 'user' });
        return;
      }

      socket.emit('inventory:init', profile);
    } catch (err) {
      console.error('[db] Exception in player:identify:', err);
      socket.emit('inventory:init', { balance: 0, role: 'user' });
    }
  });

  // Real-time GPS position from a client
  socket.on('gps:update', async (payload) => {
    const playerId = socketToPlayerId.get(socket.id);
    if (!playerId) return;

    const now = Date.now();
    const prev = playerPositions.get(playerId);

    // Speed Cap anti-cheat
    if (prev && prev.timestamp) {
      const timeDelta = (now - prev.timestamp) / 1000; // seconds
      if (timeDelta > 0 && timeDelta < 60) { // ignore stale pings
        const dist = calculateDistance(prev.lat, prev.lng, payload.latitude, payload.longitude);
        const speed = dist / timeDelta; // m/s
        if (speed > MAX_SPEED_MS) {
          const strikes = (prev.strikes || 0) + 1;
          console.warn(`[anticheat] Player ${playerId} speed ${speed.toFixed(1)} m/s — strike ${strikes}/${MAX_STRIKES}`);
          playerPositions.set(playerId, {
            lat: payload.latitude,
            lng: payload.longitude,
            timestamp: now,
            strikes,
            flagged: strikes >= MAX_STRIKES,
          });
          if (strikes >= MAX_STRIKES) {
            socket.emit('anticheat:flagged', { reason: 'SPEED_CAP', speed: speed.toFixed(1) });
          }
          // Broadcast position but don't update store coords to avoid loop
          socket.broadcast.emit('gps:update', { id: playerId, ...payload });
          return; // skip vault fetch on suspicious ping
        }
      }
    }

    console.log(`Игрок ${playerId} обновил позицию: [${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)}]`);

    // Store player position (reset strikes on valid ping if was < MAX)
    const prevStrikes = prev?.strikes || 0;
    playerPositions.set(playerId, {
      lat: payload.latitude,
      lng: payload.longitude,
      timestamp: now,
      strikes: Math.max(0, prevStrikes - 1), // decay 1 strike per good ping
      flagged: prevStrikes >= MAX_STRIKES,
    });

    try {
      // Fetch active vaults from database
      const { data: activeVaults, error } = await supabase
        .from('vaults')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('[db] Error fetching vaults:', error);
        return;
      }

      socket.emit('vaults:init', activeVaults || []);
    } catch (err) {
      console.error('[db] Exception in gps:update:', err);
    }

    // Broadcast to all OTHER connected clients
    socket.broadcast.emit('gps:update', { id: playerId, ...payload });
  });

  // Claim a vault
  socket.on('vault:claim', async (payload) => {
    try {
      const playerId = socketToPlayerId.get(socket.id);
      if (!playerId) return;

      const position = playerPositions.get(playerId);
      if (!position) {
        socket.emit('vault:error', { message: 'Позиция игрока неизвестна' });
        return;
      }

      // Anti-cheat: block flagged players
      if (position.flagged) {
        socket.emit('vault:error', { message: 'ANTI-CHEAT: MOVEMENT ANOMALY DETECTED' });
        console.warn(`[anticheat] Blocked vault claim by flagged player ${playerId}`);
        return;
      }

      // Fetch player data from database
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('balance, role')
        .eq('id', playerId)
        .single();

      if (fetchError) {
        console.error('[db] Error fetching profile for vault claim:', fetchError);
        socket.emit('vault:error', { message: 'Ошибка базы данных' });
        return;
      }

      // Fetch vault from database to check distance
      const { data: vault, error: vaultError } = await supabase
        .from('vaults')
        .select('*')
        .eq('id', payload.vaultId)
        .single();

      if (vaultError || !vault || !vault.is_active) {
        socket.emit('vault:error', { message: 'Сейф уже взломан или не существует' });
        return;
      }

      // Calculate distance
      const distance = calculateDistance(
        position.lat,
        position.lng,
        vault.lat,
        vault.lng
      );

      if (distance >= 15) {
        socket.emit('vault:error', { message: `Слишком далеко! Расстояние: ${distance.toFixed(1)}м (требуется < 15м)` });
        return;
      }

      // Atomic update: set is_active to false only if it's currently true
      const { data: claimedVault, error: claimError } = await supabase
        .from('vaults')
        .update({ is_active: false })
        .eq('id', payload.vaultId)
        .eq('is_active', true)
        .select()
        .single();

      if (claimError || !claimedVault) {
        console.error('[db] Race condition detected or error claiming vault:', claimError);
        socket.emit('vault:error', { message: 'Сейф уже взломан или не существует' });
        return;
      }

      // Update player profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          balance: profile.balance + claimedVault.reward
        })
        .eq('id', playerId);

      if (updateError) {
        console.error('[db] Error updating profile for vault claim:', updateError);
        socket.emit('vault:error', { message: 'Ошибка при обновлении базы данных' });
        return;
      }

      // Insert claim record
      const { error: claimInsertError } = await supabase
        .from('claims')
        .insert({
          player_id: playerId,
          vault_id: claimedVault.id,
          amount: claimedVault.reward
        });

      if (claimInsertError) {
        console.error('[db] Error inserting claim record:', claimInsertError);
        // Don't return error to client since the claim was successful
      }

      // Send success response
      socket.emit('vault:claimed', claimedVault);
      socket.emit('inventory:update', { balance: profile.balance + claimedVault.reward, role: profile.role });
      io.emit('vault:update', { id: claimedVault.id, is_active: false });
      console.log(`[vault] Игрок ${playerId} открыл сейф ${claimedVault.id} с ${claimedVault.reward} DOX (расстояние: ${distance.toFixed(1)}м)`);
    } catch (err) {
      console.error('[db] Exception in vault:claim:', err);
      socket.emit('vault:error', { message: 'Внутренняя ошибка сервера' });
    }
  });

  // DEV: Spawn vault near player
  socket.on('dev:spawn_near', async (payload) => {
    try {
      const playerId = socketToPlayerId.get(socket.id);
      if (!playerId) return;

      // Check admin role
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', playerId)
        .single();

      if (fetchError || !profile || profile.role !== 'admin') {
        socket.emit('vault:error', { message: 'Access denied' });
        return;
      }

      const position = playerPositions.get(playerId);
      if (!position) {
        socket.emit('vault:error', { message: 'Позиция игрока неизвестна' });
        return;
      }

      // Generate vault 5m away
      const distance = 5;
      const angle = Math.random() * 2 * Math.PI;
      const latOffset = (distance / 111000) * Math.cos(angle);
      const lngOffset = (distance / (111000 * Math.cos(position.lat * Math.PI / 180))) * Math.sin(angle);

      const newVault = {
        lat: position.lat + latOffset,
        lng: position.lng + lngOffset,
        reward: Math.floor(Math.random() * 4500) + 500,
        is_active: true,
      };

      // Insert vault into database
      const { data: insertedVault, error: insertError } = await supabase
        .from('vaults')
        .insert(newVault)
        .select()
        .single();

      if (insertError) {
        console.error('[db] Error inserting vault:', insertError);
        socket.emit('vault:error', { message: 'Ошибка при создании сейфа' });
        return;
      }

      socket.emit('vaults:init', [insertedVault]);
      io.emit('vault:update', insertedVault);
      console.log(`[dev] Игрок ${playerId} создал сейф ${insertedVault.id} в 5м от себя`);
    } catch (err) {
      console.error('[db] Exception in dev:spawn_near:', err);
      socket.emit('vault:error', { message: 'Внутренняя ошибка сервера' });
    }
  });

  // Event: Join (Zero Trust transaction)
  socket.on('event:join', async (data) => {
    try {
      const playerId = socketToPlayerId.get(socket.id);
      if (!playerId) {
        socket.emit('event:join_response', { success: false, error: 'Not authenticated' });
        return;
      }

      const { eventId } = data;
      if (!eventId) {
        socket.emit('event:join_response', { success: false, error: 'Event ID required' });
        return;
      }

      // Server-side validation: Fetch event entry_fee directly from database
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, entry_fee, status, prize_pool_override')
        .eq('id', eventId)
        .single();

      if (eventError || !event) {
        console.error('[db] Error fetching event:', eventError);
        socket.emit('event:join_response', { success: false, error: 'Event not found' });
        return;
      }

      if (event.status !== 'upcoming') {
        socket.emit('event:join_response', { success: false, error: 'Event is not available for registration' });
        return;
      }

      // Server-side validation: Fetch user balance directly from database
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, balance, role')
        .eq('id', playerId)
        .single();

      if (profileError || !profile) {
        console.error('[db] Error fetching profile:', profileError);
        socket.emit('event:join_response', { success: false, error: 'Profile not found' });
        return;
      }

      // Zero Trust: Compare server-side balance with server-side entry_fee
      if (profile.balance < event.entry_fee) {
        socket.emit('event:join_response', { success: false, error: 'Insufficient funds' });
        return;
      }

      // Check if user is already registered for this event
      const { data: existingParticipant, error: checkError } = await supabase
        .from('event_participants')
        .select('*')
        .eq('event_id', eventId)
        .eq('user_id', playerId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('[db] Error checking participant:', checkError);
        socket.emit('event:join_response', { success: false, error: 'Database error' });
        return;
      }

      if (existingParticipant) {
        socket.emit('event:join_response', { success: false, error: 'Already registered for this event' });
        return;
      }

      // Execute transaction: Deduct fee from user balance
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          balance: profile.balance - event.entry_fee
        })
        .eq('id', playerId);

      if (updateError) {
        console.error('[db] Error updating balance:', updateError);
        socket.emit('event:join_response', { success: false, error: 'Failed to update balance' });
        return;
      }

      // Add record to event_participants table
      const { error: insertError } = await supabase
        .from('event_participants')
        .insert({
          event_id: eventId,
          user_id: playerId
        });

      if (insertError) {
        console.error('[db] Error inserting participant:', insertError);
        // Rollback balance if participant insert fails
        await supabase
          .from('profiles')
          .update({ balance: profile.balance })
          .eq('id', playerId);
        socket.emit('event:join_response', { success: false, error: 'Failed to register for event' });
        return;
      }

      // Auto-recalculate prize_pool: participants × entry_fee × (1 - commission)
      // Only if event does NOT have a manual override (prize_pool_override flag)
      const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE || '0.10');
      if (!event.prize_pool_override) {
        const { count } = await supabase
          .from('event_participants')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId);

        const newPrize = Math.floor((count || 1) * event.entry_fee * (1 - COMMISSION_RATE));
        await supabase
          .from('events')
          .update({ prize_pool: newPrize })
          .eq('id', eventId);
      }

      // Send success response
      socket.emit('event:join_response', { success: true });

      // Immediately send updated profile state via player:sync to update UI
      socket.emit('player:sync', {
        balance: profile.balance - event.entry_fee,
        role: profile.role
      });

      console.log(`[event] Player ${playerId} joined event ${eventId} (fee: ${event.entry_fee} DOX, commission: ${COMMISSION_RATE * 100}%)`);
    } catch (err) {
      console.error('[db] Exception in event:join:', err);
      socket.emit('event:join_response', { success: false, error: 'Internal server error' });
    }
  });

  socket.on('disconnect', () => {
    const playerId = socketToPlayerId.get(socket.id);
    socketToPlayerId.delete(socket.id);
    console.log(`[socket] disconnected: ${socket.id} (${playerId || 'unknown'})`);
    io.emit('player:left', { id: socket.id });
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[server] Online on port ${PORT}`);
});
