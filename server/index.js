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

const vaults = [];
const playerVaults = new Map(); // Track vaults per player
const playerPositions = new Map(); // Track player positions by playerId
const socketToPlayerId = new Map(); // Map socket.id to playerId

/**
 * Generate random vaults around a position
 * @param {number} lat - Player latitude
 * @param {number} lng - Player longitude
 * @param {number} count - Number of vaults to generate
 * @returns {Array} - Array of vault objects
 */
function generateVaultsAroundPlayer(lat, lng, count = 5) {
  const newVaults = [];
  for (let i = 0; i < count; i++) {
    // Random distance between 50-500 meters
    const distance = Math.random() * 450 + 50;
    // Random angle
    const angle = Math.random() * 2 * Math.PI;
    
    // Convert to lat/lng offset (approximate: 1 degree lat ≈ 111km)
    const latOffset = (distance / 111000) * Math.cos(angle);
    const lngOffset = (distance / (111000 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
    
    newVaults.push({
      id: `v_${Date.now()}_${i}`,
      lat: lat + latOffset,
      lng: lng + lngOffset,
      balanceCZK: Math.floor(Math.random() * 4500) + 500,
      status: 'closed',
    });
  }
  return newVaults;
}

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
        .select('balance, keys, role')
        .eq('id', playerId)
        .single();

      if (error) {
        console.error('[db] Error fetching profile:', error);
        socket.emit('inventory:init', { keys: 3, balance: 0, role: 'user' });
        return;
      }

      socket.emit('inventory:init', profile);
    } catch (err) {
      console.error('[db] Exception in player:identify:', err);
      socket.emit('inventory:init', { keys: 3, balance: 0, role: 'user' });
    }
  });

  // Real-time GPS position from a client
  socket.on('gps:update', (payload) => {
    const playerId = socketToPlayerId.get(socket.id);
    if (!playerId) return;

    console.log(`Игрок ${playerId} обновил позицию: [${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)}]`);
    
    // Store player position for distance validation
    playerPositions.set(playerId, { lat: payload.latitude, lng: payload.longitude });
    
    // Generate vaults on first GPS update for this player
    if (!playerVaults.has(playerId)) {
      const newVaults = generateVaultsAroundPlayer(payload.latitude, payload.longitude, 5);
      vaults.push(...newVaults);
      playerVaults.set(playerId, newVaults.map(v => v.id));
      console.log(`Сгенерировано 5 сейфов вокруг игрока ${playerId}`);
      
      socket.emit('vaults:init', newVaults);
    }
    
    // Broadcast to all OTHER connected clients
    socket.broadcast.emit('gps:update', { id: playerId, ...payload });
  });

  // Claim a vault
  socket.on('vault:claim', async (payload) => {
    try {
      const playerId = socketToPlayerId.get(socket.id);
      if (!playerId) return;

      const vault = vaults.find(v => v.id === payload.vaultId);
      const position = playerPositions.get(playerId);
      
      if (!vault || vault.status !== 'closed') {
        socket.emit('vault:error', { message: 'Сейф уже открыт или не существует' });
        return;
      }

      if (!position) {
        socket.emit('vault:error', { message: 'Позиция игрока неизвестна' });
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

      // Fetch player data from database
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('keys, balance')
        .eq('id', playerId)
        .single();

      if (fetchError) {
        console.error('[db] Error fetching profile for vault claim:', fetchError);
        socket.emit('vault:error', { message: 'Ошибка базы данных' });
        return;
      }

      if (profile.keys <= 0) {
        socket.emit('error:no_keys', { message: 'Нет ключей! Нужен минимум 1 ключ.' });
        return;
      }

      // Update database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          keys: profile.keys - 1,
          balance: profile.balance + vault.balanceCZK
        })
        .eq('id', playerId);

      if (updateError) {
        console.error('[db] Error updating profile for vault claim:', updateError);
        socket.emit('vault:error', { message: 'Ошибка при обновлении базы данных' });
        return;
      }

      // Valid claim - update vault status after successful DB update
      vault.status = 'opened';
      
      socket.emit('vault:claimed', vault);
      socket.emit('inventory:update', { keys: profile.keys - 1, balance: profile.balance + vault.balanceCZK });
      io.emit('vault:update', { id: vault.id, status: 'opened' });
      console.log(`[vault] Игрок ${playerId} открыл сейф ${vault.id} с ${vault.balanceCZK} CZK (расстояние: ${distance.toFixed(1)}м)`);
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
        id: `v_${Date.now()}`,
        lat: position.lat + latOffset,
        lng: position.lng + lngOffset,
        balanceCZK: Math.floor(Math.random() * 4500) + 500,
        status: 'closed',
      };
      
      vaults.push(newVault);
      
      socket.emit('vaults:init', [newVault]);
      io.emit('vault:update', { id: newVault.id, status: 'closed', ...newVault });
      console.log(`[dev] Игрок ${playerId} создал сейф ${newVault.id} в 5м от себя`);
    } catch (err) {
      console.error('[db] Exception in dev:spawn_near:', err);
      socket.emit('vault:error', { message: 'Внутренняя ошибка сервера' });
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
