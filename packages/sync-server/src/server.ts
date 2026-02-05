// Automerge sync server
// Uses WebSocket for real-time sync between devices

const PORT = process.env.PORT || 3030;

console.log(`Sync server starting on port ${PORT}...`);
console.log('TODO: Implement Automerge sync server');

// Placeholder server
Bun.serve({
  port: Number(PORT),
  fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('todu sync server', { status: 200 });
  },
});

console.log(`Sync server running on http://localhost:${PORT}`);
