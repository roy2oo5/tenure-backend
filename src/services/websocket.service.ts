import { IncomingMessage, Server as HttpServer } from 'http';
import { scheduleMessageExpiration } from './message-retention.service';
import { WebSocketServer, WebSocket } from 'ws';
import { CallStatus, RequestStatus } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import url from 'url';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { sendPushNotification } from '../config/firebase';
import { CallService } from './call.service';
import { otpProximityForRequest } from '../utils/otp-proximity';
import {
  DeleteMessageInput,
  MessageAckInput,
  OpenViewOnceInput,
  RealtimeMessageService,
  SendMessageInput,
} from './realtime-message.service';
import { getAppStatus } from './maintenance.service';
import { CallSignal, callSignalSchema } from '../types/call-signaling';

// Store active chat connections: map of userId -> open chat sockets
const connections = new Map<number, Set<WebSocket>>();
const chatRequestIds = new WeakMap<WebSocket, number>();

// Store active global connections: map of userId -> Set of WebSockets
const globalConnections = new Map<number, Set<WebSocket>>();
// Socket IDs make connection replacement/debugging explicit while retaining
// support for the brief overlap that occurs during mobile network handover.
const globalSocketIds = new Map<number, Set<string>>();
const socketIds = new WeakMap<WebSocket, string>();
const activeCallsByUser = new Map<number, number>();

export async function notifyNearbySupportersChanged(loggedInUserId: number): Promise<void> {
  const recipientIds = [...globalConnections.keys()].filter((id) => id !== loggedInUserId);
  if (!recipientIds.length) return;

  // Notify every connected viewer so both radius entry and radius exit are
  // reflected immediately. Filtering still happens against the two users'
  // current profile coordinates on the refreshed discovery response.
  for (const recipientId of recipientIds) {
    sendGlobalToUser(recipientId, { event: 'nearby_supporters_changed' });
  }
}

export function disconnectUserForNewLogin(userId: number): void {
  const sockets = new Set<WebSocket>([
    ...(connections.get(userId) ?? []),
    ...(globalConnections.get(userId) ?? []),
  ]);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event: 'forced_logout' }));
    }
    socket.close(4004, 'Logged in on another device');
  }
  connections.delete(userId);
  globalConnections.delete(userId);
}

export function initWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  const maintenanceTimer = setInterval(() => {
    getAppStatus(true)
      .then((status) => {
        if (!status.maintenanceMode) return;
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                event: 'maintenance_mode',
                message: status.maintenanceMessage,
              }),
            );
          }
          client.close(1013, 'Service under maintenance');
        }
      })
      .catch((error) => logger.error(`Maintenance WebSocket check failed: ${error}`));
  }, 5_000);
  maintenanceTimer.unref();

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
      const appStatus = await getAppStatus();
      if (appStatus.maintenanceMode) {
        ws.send(
          JSON.stringify({
            event: 'maintenance_mode',
            message: appStatus.maintenanceMessage,
          }),
        );
        ws.close(1013, 'Service under maintenance');
        return;
      }
      const parsedUrl = url.parse(request.url || '', true);
      const token = parsedUrl.query.token as string;
      const deviceId = parsedUrl.query.deviceId as string;
      const pathname = parsedUrl.pathname;

      if (!token || !deviceId) {
        ws.send(JSON.stringify({ error: 'Missing token' }));
        ws.close(4001, 'Unauthorized');
        return;
      }

      // Verify JWT
      let decoded: any;
      try {
        decoded = jwt.verify(token, env.JWT_SECRET);
      } catch {
        ws.send(JSON.stringify({ error: 'Invalid authentication token' }));
        ws.close(4002, 'Unauthorized');
        return;
      }

      const userId = decoded.id;
      if (!userId || !decoded.sid || decoded.did !== deviceId) {
        ws.send(JSON.stringify({ error: 'Invalid token payload' }));
        ws.close(4003, 'Unauthorized');
        return;
      }

      const authenticatedUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { authVersion: true, isActive: true },
      });
      const authSession = await prisma.authSession.findUnique({
        where: { id: decoded.sid },
      });
      if (
        !authenticatedUser?.isActive ||
        decoded.authVersion !== authenticatedUser.authVersion ||
        !authSession ||
        authSession.userId !== userId ||
        authSession.deviceId !== deviceId ||
        authSession.revokedAt ||
        authSession.expiresAt <= new Date()
      ) {
        ws.send(JSON.stringify({ event: 'forced_logout' }));
        ws.close(4004, 'Logged in on another device');
        return;
      }

      if (pathname === '/ws' || pathname === '/ws/') {
        // Register global connection
        if (!globalConnections.has(userId)) {
          globalConnections.set(userId, new Set<WebSocket>());
        }
        globalConnections.get(userId)!.add(ws);
        const socketId = randomUUID();
        socketIds.set(ws, socketId);
        if (!globalSocketIds.has(userId)) globalSocketIds.set(userId, new Set<string>());
        globalSocketIds.get(userId)!.add(socketId);
        logger.info(`WebSocket global client connected: user=${userId}`);
        notifyNearbySupportersChanged(userId).catch((error) =>
          logger.error(`Could not notify nearby supporters after login: ${error}`),
        );

        ws.on('message', async (messageData: string) => {
          try {
            const data = JSON.parse(messageData);
            if (!data) return;

            if (data.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
              return;
            }

            const typedCall = callSignalSchema.safeParse(data);
            if (typedCall.success) {
              await handleTypedCallMessage(ws, userId, typedCall.data);
              return;
            }

            if (
              typeof data.type === 'string' &&
              (data.type === 'incoming_call' ||
                data.type === 'call_accepted' ||
                data.type === 'call_rejected' ||
                data.type === 'call_cancelled' ||
                data.type === 'call_ended' ||
                data.type === 'webrtc_signal')
            ) {
              await handleGlobalCallMessage(ws, userId, data);
              return;
            }
          } catch (e) {
            logger.error(`Error processing global ws message: ${e}`);
          }
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

      // Chat is available only after both participants have confirmed the request.
      if (meetRequest.status !== RequestStatus.CONFIRMED) {
        ws.send(
          JSON.stringify({ error: 'Chat is available after both users confirm the request' }),
        );
        ws.close(4003, 'Request not confirmed');
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
      if (!connections.has(userId)) {
        connections.set(userId, new Set<WebSocket>());
      }
      connections.get(userId)!.add(ws);
      chatRequestIds.set(ws, requestId);
      RealtimeMessageService.register(userId, String(requestId), ws);
      await RealtimeMessageService.deliverPending(userId, String(requestId), ws);
      logger.info(`WebSocket client connected: user=${userId}, request=${requestId}`);

      ws.on('message', async (messageData: string) => {
        try {
          const data = JSON.parse(messageData);
          const { type = 'text', content, mediaUrl, voiceDuration } = data;

          if (data.event === 'send_message') {
            const expectedRecipient =
              meetRequest.senderId === userId ? meetRequest.receiverId : meetRequest.senderId;
            if (String(data.recipientId) !== String(expectedRecipient)) {
              ws.send(
                JSON.stringify({
                  event: 'send_failed',
                  messageId: data.messageId,
                  error: 'Invalid recipient',
                }),
              );
              return;
            }
            try {
              await RealtimeMessageService.handleSendMessage(
                userId,
                requestId,
                ws,
                data as SendMessageInput,
              );
            } catch (error: unknown) {
              ws.send(
                JSON.stringify({
                  event: 'send_failed',
                  messageId: data.messageId,
                  error: error instanceof Error ? error.message : 'Message delivery failed',
                }),
              );
            }
            return;
          }
          const id = socketIds.get(ws);
          if (id) {
            const ids = globalSocketIds.get(userId);
            ids?.delete(id);
            if (ids?.size === 0) globalSocketIds.delete(userId);
          }

          if (data.event === 'msg_acknowledged') {
            await RealtimeMessageService.handleMessageAck(userId, data as MessageAckInput);
            return;
          }

          if (data.event === 'delete_for_everyone') {
            await RealtimeMessageService.handleDeleteForEveryone(
              userId,
              data as DeleteMessageInput,
            );
            ws.send(
              JSON.stringify({
                event: 'message_control_event',
                control: { event: 'delete_message', messageId: data.messageId },
              }),
            );
            return;
          }

          if (data.event === 'open_view_once') {
            try {
              await RealtimeMessageService.handleOpenViewOnce(userId, data as OpenViewOnceInput);
              ws.send(JSON.stringify({ event: 'view_once_opened', messageId: data.messageId }));
            } catch (error: unknown) {
              ws.send(JSON.stringify({
                event: 'view_once_open_failed',
                messageId: data.messageId,
                error: error instanceof Error ? error.message : 'Photo could not be opened',
              }));
            }
            return;
          }

          if (type === 'ping' || type === 'pong') {
            return;
          }

          if (type === 'location_update') {
            const latitude = Number(data.latitude);
            const longitude = Number(data.longitude);
            if (
              !Number.isFinite(latitude) ||
              latitude < -90 ||
              latitude > 90 ||
              !Number.isFinite(longitude) ||
              longitude < -180 ||
              longitude > 180
            ) {
              ws.send(JSON.stringify({ error: 'Invalid live location coordinates' }));
              return;
            }
            const isSender = meetRequest.senderId === userId;
            const locationRequest = await prisma.request.update({
              where: { id: requestId },
              data: isSender
                ? {
                    senderCurrentLatitude: latitude,
                    senderCurrentLongitude: longitude,
                    senderLocationUpdatedAt: new Date(),
                  }
                : {
                    receiverCurrentLatitude: latitude,
                    receiverCurrentLongitude: longitude,
                    receiverLocationUpdatedAt: new Date(),
                  },
            });
            // Confirm persistence to the publishing device.  The client uses
            // this acknowledgement to request route metrics only after the
            // live coordinate is actually available to the route endpoint.
            // Without it, the first metrics request races this database write
            // and commonly displays "Route unavailable".
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  event: 'live_location_saved',
                  requestId,
                }),
              );
            }
            const receiverId =
              meetRequest.senderId === userId ? meetRequest.receiverId : meetRequest.senderId;
            const recipientSockets = connections.get(receiverId);
            if (recipientSockets) {
              for (const recipientSocket of recipientSockets) {
                if (
                  recipientSocket.readyState === WebSocket.OPEN &&
                  chatRequestIds.get(recipientSocket) === requestId
                ) {
                  recipientSocket.send(
                    JSON.stringify({
                      event: 'location_update',
                      userId,
                      latitude,
                      longitude,
                      heading: data.heading != null ? Number(data.heading) : null,
                    }),
                  );
                }
              }
            }
            const proximity = otpProximityForRequest(locationRequest);
            const proximityPayload = {
              event: 'otp_proximity',
              requestId,
              ready: proximity.ready,
              distanceMeters: proximity.distanceMeters,
              message: proximity.message,
            };
            sendToUserForRequest(meetRequest.senderId, requestId, proximityPayload);
            sendToUserForRequest(meetRequest.receiverId, requestId, proximityPayload);

            if (
              locationRequest.status === RequestStatus.CONFIRMED &&
              locationRequest.otp == null &&
              proximity.ready
            ) {
              const candidateOtp = String(randomInt(1000, 10_000));
              await prisma.request.updateMany({
                where: {
                  id: requestId,
                  status: RequestStatus.CONFIRMED,
                  otp: null,
                },
                data: { otp: candidateOtp },
              });
              const otpRequest = await prisma.request.findUnique({
                where: { id: requestId },
                select: { otp: true },
              });
              if (otpRequest?.otp) {
                // The request sender is the beneficiary: only they receive
                // the code. The receiver/supporter enters it to start.
                sendToUserForRequest(meetRequest.senderId, requestId, {
                  event: 'otp_ready',
                  requestId,
                  otp: otpRequest.otp,
                  message: 'You are within 20 m. Share this OTP with the supporter.',
                });
                sendToUserForRequest(meetRequest.receiverId, requestId, {
                  event: 'otp_ready',
                  requestId,
                  message: 'You are within 20 m. Ask the beneficiary for the OTP.',
                });
              }
            }
            return;
          }

          if (!content) {
            ws.send(JSON.stringify({ error: 'Content is required' }));
            return;
          }

          // Determine recipient
          const receiverId =
            meetRequest.senderId === userId ? meetRequest.receiverId : meetRequest.senderId;

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
          scheduleMessageExpiration(message.expiresAt);

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
          const recipientSockets = connections.get(receiverId);
          let recipientIsActiveInChat = false;
          if (recipientSockets) {
            for (const recipientSocket of recipientSockets) {
              if (
                recipientSocket.readyState === WebSocket.OPEN &&
                chatRequestIds.get(recipientSocket) === requestId
              ) {
                recipientSocket.send(
                  JSON.stringify({ event: 'message', message: formattedMessage }),
                );
                recipientIsActiveInChat = true;
              }
            }
          }

          if (!recipientIsActiveInChat) {
            try {
              const muted = await prisma.mute.findUnique({
                where: {
                  muterId_mutedUserId: {
                    muterId: receiverId,
                    mutedUserId: userId,
                  },
                },
                select: { id: true },
              });
              if (muted) {
                // Muted conversations still receive messages, but never alert
                // the recipient while they are outside the chat.
                ws.send(
                  JSON.stringify({
                    event: 'ack',
                    message: { ...formattedMessage, sender: 'me' },
                  }),
                );
                return;
              }
              const recipientUser = await prisma.user.findUnique({
                where: { id: receiverId },
                select: { fcmToken: true },
              });
              if (recipientUser?.fcmToken) {
                const senderProfile = await prisma.profile.findUnique({
                  where: { userId },
                  select: { fullName: true },
                });
                const senderName = senderProfile?.fullName || 'Someone';
                let notificationBody = content;
                if (type === 'image') {
                  notificationBody = '📷 Sent an image';
                } else if (type === 'voice') {
                  notificationBody = '🎵 Sent a voice message';
                }

                sendPushNotification(recipientUser.fcmToken, senderName, notificationBody, {
                  kind: 'chat_message',
                  requestId: String(requestId),
                  senderId: String(userId),
                }).catch((err) => {
                  logger.error('Error sending chat push notification:', err);
                });
              }
            } catch (err) {
              logger.error('Error fetching recipient fcmToken for message:', err);
            }
          }

          // Send confirmation back to sender
          ws.send(
            JSON.stringify({
              event: 'ack',
              message: {
                ...formattedMessage,
                sender: 'me', // To the sender, they are "me"
              },
            }),
          );
        } catch (error: any) {
          logger.error(`WebSocket error processing message: ${error.message}`);
          ws.send(JSON.stringify({ error: 'Failed to process message' }));
        }
      });

      ws.on('close', () => {
        RealtimeMessageService.unregister(userId, String(requestId), ws);
        const userSockets = connections.get(userId);
        if (userSockets) {
          userSockets.delete(ws);
          if (userSockets.size === 0) {
            connections.delete(userId);
          }
        }
        logger.info(`WebSocket client disconnected: user=${userId}`);
      });
    } catch (error: any) {
      logger.error(`WebSocket connection setup error: ${error.message}`);
      ws.close(4500, 'Internal Server Error');
    }
  });
}

export function sendToUser(userId: number, data: any): boolean {
  const sockets = connections.get(userId);
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

export function sendToUserForRequest(userId: number, requestId: number, data: any): boolean {
  const sockets = connections.get(userId);
  let sent = false;
  if (sockets) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN && chatRequestIds.get(ws) === requestId) {
        ws.send(JSON.stringify(data));
        sent = true;
      }
    }
  }
  return sent;
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

export function sendGlobalToAll(data: any): number {
  let sent = 0;
  for (const sockets of globalConnections.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
        sent += 1;
      }
    }
  }
  return sent;
}

async function handleTypedCallMessage(
  ws: WebSocket,
  userId: number,
  data: CallSignal,
): Promise<void> {
  if (data.targetId === userId) {
    ws.send(JSON.stringify({ event: 'call:reject', reason: 'invalid_target' }));
    return;
  }

  if (data.type === 'call:initiate') {
    const targetUser = await prisma.user.findUnique({
      where: { id: data.targetId },
      select: { id: true, fcmToken: true },
    });
    if (!targetUser) {
      ws.send(JSON.stringify({ event: 'call:reject', reason: 'not_found' }));
      return;
    }
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: data.targetId },
          { blockerId: data.targetId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (blocked) {
      ws.send(JSON.stringify({ event: 'call:reject', reason: 'blocked' }));
      return;
    }

    const usage = await CallService.getDailyPairUsage(userId, data.targetId);
    if (usage.remainingSeconds <= 0) {
      ws.send(JSON.stringify({ event: 'call:reject', reason: 'daily_limit_exceeded', ...usage }));
      return;
    }

    const busy = activeCallsByUser.has(userId) || activeCallsByUser.has(data.targetId);
    const call = await prisma.call.create({
      data: {
        callerId: userId,
        receiverId: data.targetId,
        status: busy ? CallStatus.BUSY : CallStatus.RINGING,
        endedAt: busy ? new Date() : undefined,
        endReason: busy ? 'user_busy' : undefined,
      },
    });
    if (busy) {
      ws.send(JSON.stringify({ event: 'call:busy', callId: call.id, fromUserId: data.targetId }));
      return;
    }

    activeCallsByUser.set(userId, call.id);
    activeCallsByUser.set(data.targetId, call.id);
    const [profile, caller] = await Promise.all([
      prisma.profile.findUnique({
        where: { userId },
        select: { fullName: true, profilePhoto: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    const incoming = {
      event: 'call:incoming',
      callId: call.id,
      callerId: userId,
      callerName: profile?.fullName || caller?.name || 'Unknown',
      callerAvatar: profile?.profilePhoto || null,
      requestId: data.requestId,
      ...usage,
    };
    const delivered = sendGlobalToUser(data.targetId, incoming);
    ws.send(
      JSON.stringify({
        event: 'call:initiated',
        callId: call.id,
        receiverId: data.targetId,
        delivered,
        ...usage,
      }),
    );

    if (!delivered && targetUser.fcmToken) {
      sendPushNotification(
        targetUser.fcmToken,
        'Incoming call',
        `${incoming.callerName} is calling you`,
        {
          event: 'call:incoming',
          callId: String(call.id),
          callerId: String(userId),
          callerName: incoming.callerName,
          callerAvatar: incoming.callerAvatar ?? '',
          requestId: data.requestId ?? '',
        },
      ).catch((error) => logger.error(`Incoming call push failed: ${error}`));
    }

    const ringTimeout = setTimeout(async () => {
      const result = await prisma.call.updateMany({
        where: { id: call.id, status: CallStatus.RINGING },
        data: { status: CallStatus.MISSED, endedAt: new Date(), endReason: 'no_answer' },
      });
      if (result.count) {
        activeCallsByUser.delete(userId);
        activeCallsByUser.delete(data.targetId);
        sendGlobalToUser(userId, { event: 'call:end', callId: call.id, reason: 'no_answer' });
        sendGlobalToUser(data.targetId, {
          event: 'call:end',
          callId: call.id,
          reason: 'no_answer',
        });
      }
    }, 30_000);
    ringTimeout.unref();
    return;
  }

  const call = await prisma.call.findUnique({ where: { id: data.callId } });
  if (!call || (call.callerId !== userId && call.receiverId !== userId)) {
    ws.send(JSON.stringify({ event: 'call:end', callId: data.callId, reason: 'stale_call' }));
    return;
  }
  const peerId = call.callerId === userId ? call.receiverId : call.callerId;
  if (peerId !== data.targetId) {
    ws.send(JSON.stringify({ event: 'call:end', callId: data.callId, reason: 'invalid_target' }));
    return;
  }

  if (data.type === 'call:accept') {
    if (userId !== call.receiverId) return;
    const accepted = await prisma.call.updateMany({
      where: { id: call.id, status: CallStatus.RINGING },
      data: { status: CallStatus.ONGOING, startedAt: new Date() },
    });
    if (!accepted.count) {
      ws.send(JSON.stringify({ event: 'call:end', callId: call.id, reason: 'stale_call' }));
      return;
    }
    const usage = await CallService.getDailyPairUsage(userId, peerId);
    sendGlobalToUser(peerId, {
      event: 'call:accept',
      callId: call.id,
      fromUserId: userId,
      ...usage,
    });
    ws.send(JSON.stringify({ event: 'call:accepted', callId: call.id, ...usage }));
    return;
  }

  if (
    data.type === 'webrtc:offer' ||
    data.type === 'webrtc:answer' ||
    data.type === 'webrtc:ice-candidate'
  ) {
    if (call.status !== CallStatus.ONGOING) return;
    const mediaPayload =
      data.type === 'webrtc:ice-candidate'
        ? { candidate: data.candidate }
        : { description: data.description };
    sendGlobalToUser(peerId, {
      event: data.type,
      callId: call.id,
      fromUserId: userId,
      ...mediaPayload,
    });
    return;
  }

  const status =
    data.type === 'call:reject'
      ? CallStatus.REJECTED
      : data.type === 'call:busy'
        ? CallStatus.BUSY
        : call.status === CallStatus.RINGING
          ? CallStatus.CANCELLED
          : CallStatus.COMPLETED;
  const now = new Date();
  const duration = call.startedAt
    ? Math.max(0, Math.floor((now.getTime() - call.startedAt.getTime()) / 1000))
    : 0;
  const ended = await prisma.call.updateMany({
    where: { id: call.id, status: { in: [CallStatus.RINGING, CallStatus.ONGOING] } },
    data: { status, endedAt: now, duration, endReason: 'reason' in data ? data.reason : undefined },
  });
  if (!ended.count) return;
  activeCallsByUser.delete(call.callerId);
  activeCallsByUser.delete(call.receiverId);
  sendGlobalToUser(peerId, {
    event: data.type,
    callId: call.id,
    fromUserId: userId,
    reason: 'reason' in data ? data.reason : undefined,
  });
}

async function handleGlobalCallMessage(ws: WebSocket, userId: number, data: any): Promise<void> {
  const targetId = parseUserId(data.targetId);
  if (!targetId || targetId === userId) {
    ws.send(JSON.stringify({ event: 'call_rejected', reason: 'invalid_target' }));
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, fcmToken: true },
  });
  if (!targetUser) {
    ws.send(JSON.stringify({ event: 'call_rejected', reason: 'not_found' }));
    return;
  }

  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: targetId },
        { blockerId: targetId, blockedId: userId },
      ],
    },
  });
  if (block) {
    ws.send(JSON.stringify({ event: 'call_rejected', reason: 'blocked' }));
    return;
  }

  if (data.type === 'incoming_call') {
    const usage = await CallService.getDailyPairUsage(userId, targetId);
    if (usage.remainingSeconds <= 0) {
      ws.send(
        JSON.stringify({
          event: 'call_rejected',
          reason: 'daily_limit_exceeded',
          limitSeconds: usage.limitSeconds,
          usedSeconds: usage.usedSeconds,
          remainingSeconds: 0,
          resetAt: usage.resetAt,
        }),
      );
      return;
    }

    const callerProfile = await prisma.profile.findUnique({
      where: { userId },
      select: { fullName: true, profilePhoto: true },
    });
    const callerUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const call = await prisma.call.create({
      data: {
        callerId: userId,
        receiverId: targetId,
        status: CallStatus.RINGING,
      },
    });
    const incomingPayload = {
      event: 'incoming_call',
      callId: call.id,
      callerId: userId,
      callerName: callerProfile?.fullName || callerUser?.name || 'Unknown',
      callerAvatar: callerProfile?.profilePhoto || null,
      requestId: data.requestId != null ? String(data.requestId) : undefined,
      limitSeconds: usage.limitSeconds,
      usedSeconds: usage.usedSeconds,
      remainingSeconds: usage.remainingSeconds,
      resetAt: usage.resetAt,
    };
    const delivered = sendGlobalToUser(targetId, incomingPayload);
    ws.send(
      JSON.stringify({
        event: 'call_initiated',
        callId: call.id,
        receiverId: targetId,
        delivered,
        limitSeconds: usage.limitSeconds,
        usedSeconds: usage.usedSeconds,
        remainingSeconds: usage.remainingSeconds,
        resetAt: usage.resetAt,
      }),
    );

    if (!delivered) {
      await prisma.call.update({
        where: { id: call.id },
        data: { status: CallStatus.MISSED, endedAt: new Date() },
      });
      ws.send(JSON.stringify({ event: 'call_rejected', callId: call.id, reason: 'offline' }));
      if (targetUser.fcmToken) {
        sendPushNotification(
          targetUser.fcmToken,
          'Incoming call',
          `${incomingPayload.callerName} is calling you`,
          {
            kind: 'call_incoming',
            callId: String(call.id),
            callerId: String(userId),
          },
        ).catch((err) => logger.error('Error sending incoming call push notification:', err));
      }
    }
    return;
  }

  const callId = parseUserId(data.callId);
  if (!callId) {
    ws.send(JSON.stringify({ event: 'call_rejected', reason: 'invalid_call' }));
    return;
  }

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || (call.callerId !== userId && call.receiverId !== userId)) {
    ws.send(JSON.stringify({ event: 'call_rejected', callId, reason: 'invalid_call' }));
    return;
  }

  const payload = {
    event: data.type,
    callId,
    fromUserId: userId,
    signal: data.signal,
    reason: data.reason,
  };

  if (data.type === 'call_accepted') {
    const usage = await CallService.getDailyPairUsage(userId, targetId);
    if (usage.remainingSeconds <= 0) {
      ws.send(
        JSON.stringify({
          event: 'call_rejected',
          callId,
          reason: 'daily_limit_exceeded',
          limitSeconds: usage.limitSeconds,
          usedSeconds: usage.usedSeconds,
          remainingSeconds: 0,
          resetAt: usage.resetAt,
        }),
      );
      sendGlobalToUser(targetId, {
        event: 'call_rejected',
        callId,
        reason: 'daily_limit_exceeded',
        limitSeconds: usage.limitSeconds,
        usedSeconds: usage.usedSeconds,
        remainingSeconds: 0,
        resetAt: usage.resetAt,
      });
      await prisma.call.update({
        where: { id: callId },
        data: { status: CallStatus.MISSED, endedAt: new Date() },
      });
      return;
    }

    await prisma.call.update({
      where: { id: callId },
      data: { status: CallStatus.ONGOING, startedAt: new Date() },
    });
    sendGlobalToUser(targetId, {
      ...payload,
      limitSeconds: usage.limitSeconds,
      usedSeconds: usage.usedSeconds,
      remainingSeconds: usage.remainingSeconds,
      resetAt: usage.resetAt,
    });
    ws.send(
      JSON.stringify({
        event: 'call_limit_started',
        callId,
        limitSeconds: usage.limitSeconds,
        usedSeconds: usage.usedSeconds,
        remainingSeconds: usage.remainingSeconds,
        resetAt: usage.resetAt,
      }),
    );
    sendGlobalToUser(targetId, {
      event: 'call_limit_started',
      callId,
      limitSeconds: usage.limitSeconds,
      usedSeconds: usage.usedSeconds,
      remainingSeconds: usage.remainingSeconds,
      resetAt: usage.resetAt,
    });
  } else if (data.type === 'call_rejected') {
    sendGlobalToUser(targetId, payload);
    await prisma.call.update({
      where: { id: callId },
      data: { status: CallStatus.REJECTED, endedAt: new Date() },
    });
  } else if (data.type === 'call_cancelled') {
    sendGlobalToUser(targetId, payload);
    await prisma.call.update({
      where: { id: callId },
      data: { status: CallStatus.MISSED, endedAt: new Date() },
    });
  } else if (data.type === 'call_ended') {
    sendGlobalToUser(targetId, payload);
    const now = new Date();
    const duration = call.startedAt
      ? Math.max(0, Math.floor((now.getTime() - call.startedAt.getTime()) / 1000))
      : 0;
    await prisma.call.update({
      where: { id: callId },
      data: { status: CallStatus.COMPLETED, endedAt: now, duration },
    });
  } else {
    sendGlobalToUser(targetId, payload);
  }
}

function parseUserId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}
