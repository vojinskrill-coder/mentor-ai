const { io } = require('socket.io-client');
const TENANT = 'tnt_rljn1gj4cgxoph0hxfohv6l4';

const sock = io('http://localhost:3000/ws/chat', {
  transports: ['websocket'],
  auth: { token: 'dev' },
});

const startMs = Date.now();
const t = () => String(Math.round((Date.now() - startMs) / 1000)).padStart(3, ' ') + 's';

function short(v) {
  const s = JSON.stringify(v);
  return s && s.length > 160 ? s.substring(0, 160) + '...' : s;
}

sock.on('connect', () => {
  console.log(`[${t()}] WS connected id=${sock.id}`);
  // Try subscribing explicitly just in case
  sock.emit('tenant:subscribe', { tenantId: TENANT });
});

// Intercept EVERY event - socket.io v4 onAny
sock.onAny((event, ...args) => {
  console.log(`[${t()}] << ${event}  ${short(args.length === 1 ? args[0] : args)}`);
});

sock.on('connect_error', (e) => console.error('connect_error:', e.message));

// Keep alive 5 minutes
setTimeout(() => {
  console.log(`[${t()}] TIMEOUT — closing`);
  sock.close();
  process.exit(0);
}, 300000);
