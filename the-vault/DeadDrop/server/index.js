const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { getAllCurrencies } = require('./rates');

const PORT = 3001;
const CLIENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:5173',
];

const app = express();

app.use(cors({ origin: CLIENT_ORIGINS, credentials: true }));
app.use(express.json());

// ── Vaults (Dynamic generation around player) ─────────────────────────────────

const vaults = [];
const playerVaults = new Map(); // Track vaults per player
const playerInventory = new Map(); // Track player inventory { keys, balance } by playerId
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
      balanceNXC: Math.floor(Math.random() * 4500) + 500,
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
    origin: CLIENT_ORIGINS,
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
  socket.on('player:identify', ({ playerId }) => {
    socketToPlayerId.set(socket.id, playerId);
    console.log(`[socket] player ${playerId} identified as ${socket.id}`);

    // Initialize player inventory if not exists
    if (!playerInventory.has(playerId)) {
      playerInventory.set(playerId, { keys: 3, balance: 0 });
    }

    // Send inventory to client
    socket.emit('inventory:init', playerInventory.get(playerId));
  });

  // Real-time GPS position from a client
  socket.on('gps:update', (payload) => {
    const playerId = socketToPlayerId.get(socket.id);
    if (!playerId) return;

    console.log(`Игрок ${playerId} обновил позицию: [${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)}]`);
    
    // Store player position for distance validation
    const inventory = playerInventory.get(playerId);
    inventory.position = { lat: payload.latitude, lng: payload.longitude };
    
    // Generate vaults on first GPS update for this player
    if (!playerVaults.has(playerId)) {
      const newVaults = generateVaultsAroundPlayer(payload.latitude, payload.longitude, 5);
      vaults.push(...newVaults);
      playerVaults.set(playerId, newVaults.map(v => v.id));
      console.log(`Сгенерировано 5 сейфов вокруг игрока ${playerId}`);
      
      const vaultsWithCurrencies = newVaults.map(v => ({
        ...v,
        currencies: getAllCurrencies(v.balanceNXC),
      }));
      socket.emit('vaults:init', vaultsWithCurrencies);
    }
    
    // Broadcast to all OTHER connected clients
    socket.broadcast.emit('gps:update', { id: playerId, ...payload });
  });

  // Claim a vault
  socket.on('vault:claim', (payload) => {
    const playerId = socketToPlayerId.get(socket.id);
    if (!playerId) return;

    const vault = vaults.find(v => v.id === payload.vaultId);
    const inventory = playerInventory.get(playerId);
    
    if (!vault || vault.status !== 'closed') {
      socket.emit('vault:error', { message: 'Сейф уже открыт или не существует' });
      return;
    }

    if (!inventory.position) {
      socket.emit('vault:error', { message: 'Позиция игрока неизвестна' });
      return;
    }

    // Strict key validation
    if (inventory.keys <= 0) {
      socket.emit('error:no_keys', { message: 'Нет ключей! Нужен минимум 1 ключ.' });
      return;
    }

    // Calculate distance
    const distance = calculateDistance(
      inventory.position.lat,
      inventory.position.lng,
      vault.lat,
      vault.lng
    );

    if (distance >= 15) {
      socket.emit('vault:error', { message: `Слишком далеко! Расстояние: ${distance.toFixed(1)}м (требуется < 15м)` });
      return;
    }

    if (inventory.keys < 1) {
      socket.emit('error:no_keys', { message: 'Недостаточно ключей! Нужно минимум 1 ключ.' });
      return;
    }

    // Valid claim
    vault.status = 'opened';
    inventory.keys -= 1;
    inventory.balance += vault.balanceNXC;
    
    const vaultWithCurrencies = {
      ...vault,
      currencies: getAllCurrencies(vault.balanceNXC),
    };
    
    socket.emit('vault:claimed', vaultWithCurrencies);
    socket.emit('inventory:update', inventory);
    io.emit('vault:update', { id: vault.id, status: 'opened' });
    console.log(`[vault] Игрок ${playerId} открыл сейф ${vault.id} с ${vault.balanceNXC} CZK (расстояние: ${distance.toFixed(1)}м)`);
  });

  // DEV: Spawn vault near player
  socket.on('dev:spawn_near', (payload) => {
    const playerId = socketToPlayerId.get(socket.id);
    if (!playerId) return;

    const inventory = playerInventory.get(playerId);
    if (!inventory.position) {
      socket.emit('vault:error', { message: 'Позиция игрока неизвестна' });
      return;
    }

    // Generate vault 5m away
    const distance = 5;
    const angle = Math.random() * 2 * Math.PI;
    const latOffset = (distance / 111000) * Math.cos(angle);
    const lngOffset = (distance / (111000 * Math.cos(inventory.position.lat * Math.PI / 180))) * Math.sin(angle);
    
    const newVault = {
      id: `v_${Date.now()}`,
      lat: inventory.position.lat + latOffset,
      lng: inventory.position.lng + lngOffset,
      balanceNXC: Math.floor(Math.random() * 4500) + 500,
      status: 'closed',
    };
    
    vaults.push(newVault);
    
    const vaultWithCurrencies = {
      ...newVault,
      currencies: getAllCurrencies(newVault.balanceNXC),
    };
    
    socket.emit('vaults:init', [vaultWithCurrencies]);
    io.emit('vault:update', { id: newVault.id, status: 'closed', ...newVault });
    console.log(`[dev] Игрок ${playerId} создал сейф ${newVault.id} в 5м от себя`);
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
  console.log(`[server] http://localhost:${PORT}`);
});
