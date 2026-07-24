import { IncomingMessage, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import url from 'url';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// Store active connections: map of userId -> WebSocket
const connections = new Map<number, WebSocket>();

// Store active global connections: map of userId -> Set of WebSockets
const globalConnections = new Map<number, Set<WebSocket>>();

export function initWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const parsed = url.parse(request.url || '');
    const pathname = parsed.pathname;

    if (
      pathname === '/chat' ||
      pathname === '/chat/' ||
      pathname === '/ws' ||
      pathname === '/ws/'
    ) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
    try {
      const parsedUrl = url.parse(request.url || '', true);
      const token = parsedUrl.query.token as string;
      const pathname = parsedUrl.pathname;

      if (!token) {
        ws.send(JSON.stringify({ error: 'Missing token' }));
        ws.close(4001, 'Unauthorized');
        return;
      }

      // Verify JWT
      let decoded: any;
      try {
        decoded = jwt.verify(token, env.JWT_SECRET);
      } catch (err) {
        ws.send(JSON.stringify({ error: 'Invalid authentication token' }));
        ws.close(4002, 'Unauthorized');
        return;
      }

      const userId = decoded.id;
      if (!userId) {
        ws.send(JSON.stringify({ error: 'Invalid token payload' }));
        ws.close(4003, 'Unauthorized');
        return;
      }

      if (pathname === '/ws' || pathname === '/ws/') {
        // Register global connection
        if (!globalConnections.has(userId)) {
          globalConnections.set(userId, new Set<WebSocket>());
        }
        globalConnections.get(userId)!.add(ws);
        logger.info(`WebSocket global client connected: user=${userId}`);

        ws.on('message', (messageData: string) => {
          try {
            const data = JSON.parse(messageData);
            if (data && data.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          } catch (e) {}
        });

        ws.on('close', () => {
          const userSockets = globalConnections.get(userId);
          if (userSockets) {
            userSockets.delete(ws);
            if (userSockets.size === 0) {
              globalConnections.delete(userId);
            }
          }
          logger.info(`WebSocket global client disconnected: user=${userId}`);
        });

        return;
      }

      // From here on, it must be '/chat' which requires requestId
      const reqIdStr = parsedUrl.query.requestId as string;
      if (!reqIdStr) {
        ws.send(JSON.stringify({ error: 'Missing requestId' }));
        ws.close(4001, 'Unauthorized');
        return;
      }
      const requestId = parseInt(reqIdStr, 10);
      if (isNaN(requestId)) {
        ws.send(JSON.stringify({ error: 'Invalid requestId' }));
        ws.close(4000, 'Bad Request');
        return;
      }

      // Verify user has access to request
      const meetRequest = await prisma.request.findUnique({
        where: { id: requestId },
      });

      if (!meetRequest) {
        ws.send(JSON.stringify({ error: 'Request not found' }));
        ws.close(4004, 'Not Found');
        return;
      }

      if (meetRequest.senderId !== userId && meetRequest.receiverId !== userId) {
        ws.send(JSON.stringify({ error: 'Forbidden' }));
        ws.close(4003, 'Forbidden');
        return;
      }

      // Verify block relation
      const block = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: meetRequest.senderId, blockedId: meetRequest.receiverId },
            { blockerId: meetRequest.receiverId, blockedId: meetRequest.senderId },
          ],
        },
      });
      if (block) {
        ws.send(JSON.stringify({ error: 'Blocked' }));
        ws.close(4005, 'Blocked');
        return;
      }

      // Register connection
      connections.set(userId, ws);
      logger.info(`WebSocket client connected: user=${userId}, request=${requestId}`);

      ws.on('message', async (messageData: string) => {
        try {
          const data = JSON.parse(messageData);
          const { type = 'text', content, mediaUrl, voiceDuration } = data;

          if (type === 'ping' || type === 'pong') {
            return;
          }

          if (type === 'location_update') {
            const receiverId = meetRequest.senderId === userId ? meetRequest.receiverId : meetRequest.senderId;
            const recipientSocket = connections.get(receiverId);
            if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
              recipientSocket.send(JSON.stringify({
                event: 'location_update',
                userId,
                latitude: Number(data.latitude),
                longitude: Number(data.longitude),
              }));
            }
            return;
          }

          if (!content) {
            ws.send(JSON.stringify({ error: 'Content is required' }));
            return;
          }

          // Determine recipient
          const receiverId = meetRequest.senderId === userId ? meetRequest.receiverId : meetRequest.senderId;

          // Save to database
          const message = await prisma.message.create({
            data: {
              requestId,
              senderId: userId,
              receiverId,
              content,
              type,
              mediaUrl: mediaUrl || null,
              voiceDuration: voiceDuration ? parseInt(voiceDuration, 10) : null,
            },
          });

          const formattedMessage = {
            id: message.id,
            sender: 'them', // To the receiver, the sender is "them"
            type: message.type,
            text: message.type === 'text' ? message.content : undefined,
            imageUri: message.type === 'image' ? (message.mediaUrl ?? message.content) : undefined,
            voiceUri: message.type === 'voice' ? (message.mediaUrl ?? message.content) : undefined,
            voiceDurationSec: message.voiceDuration ?? undefined,
            createdAt: message.createdAt.getTime(),
          };

          // Deliver to recipient if connected
          const recipientSocket = connections.get(receiverId);
          if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
            recipientSocket.send(JSON.stringify({ event: 'message', message: formattedMessage }));
          }

          // Send confirmation back to sender
          ws.send(JSON.stringify({
            event: 'ack',
            message: {
              ...formattedMessage,
              sender: 'me', // To the sender, they are "me"
            }
          }));

        } catch (error: any) {
          logger.error(`WebSocket error processing message: ${error.message}`);
          ws.send(JSON.stringify({ error: 'Failed to process message' }));
        }
      });

      ws.on('close', () => {
        connections.delete(userId);
        logger.info(`WebSocket client disconnected: user=${userId}`);
      });

    } catch (error: any) {
      logger.error(`WebSocket connection setup error: ${error.message}`);
      ws.close(4500, 'Internal Server Error');
    }
  });
}

export function sendToUser(userId: number, data: any): boolean {
  const ws = connections.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  return false;
}

export function sendGlobalToUser(userId: number, data: any): boolean {
  const sockets = globalConnections.get(userId);
  let sent = false;
  if (sockets) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
        sent = true;
      }
    }
  }
  return sent;
}

