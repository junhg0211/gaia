// index.js
import { WebSocketServer } from 'ws';

// 포트 설정
const PORT = 48829;
const wss = new WebSocketServer({ port: PORT });

console.log(`🌐 WebSocket LAN server running on ws://localhost:${PORT}`);

// 클라이언트 연결 이벤트
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`🔗 Client connected: ${clientIP}`);

  // 메시지 수신 처리
  ws.on('message', (data) => {
    try {
      const message = data.toString().trim();
      const [command, ...args] = message.split(' ');

      switch (command.toUpperCase()) {
        case 'ECHO':
          // 받은 메시지를 그대로 돌려줌
          ws.send(`ECHO: ${args.join(' ')}`);
          break;

        case 'ANNOUNCE':
          // 전체 클라이언트에 브로드캐스트
          const announcement = args.join(' ');
          wss.clients.forEach(client => {
            if (client.readyState === ws.OPEN) {
              client.send(`📢 ANNOUNCE: ${announcement}`);
            }
          });
          break;

        default:
          ws.send(`❌ Unknown command: ${command}`);
      }
    } catch (err) {
      console.error('Message handling error:', err);
    }
  });

  // 연결 종료 이벤트
  ws.on('close', () => {
    console.log(`❌ Client disconnected: ${clientIP}`);
  });
});
