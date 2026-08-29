import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const callBase = z.object({
  callId: positiveId,
  targetId: positiveId,
});

const sessionDescription = z.object({
  sdp: z.string().min(1).max(200_000),
});

const iceCandidate = z.object({
  candidate: z.string().min(1).max(8_192),
  sdpMid: z.string().max(128).nullable().optional(),
  sdpMLineIndex: z.number().int().nonnegative().nullable().optional(),
});

export const callSignalSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('call:initiate'),
    targetId: positiveId,
    requestId: z.coerce.string().max(128).optional(),
  }),
  callBase.extend({ type: z.literal('call:accept') }),
  callBase.extend({ type: z.literal('call:reject'), reason: z.string().max(128).optional() }),
  callBase.extend({ type: z.literal('call:busy') }),
  callBase.extend({ type: z.literal('call:end'), reason: z.string().max(128).optional() }),
  callBase.extend({ type: z.literal('webrtc:offer'), description: sessionDescription }),
  callBase.extend({ type: z.literal('webrtc:answer'), description: sessionDescription }),
  callBase.extend({ type: z.literal('webrtc:ice-candidate'), candidate: iceCandidate }),
]);

export type CallSignal = z.infer<typeof callSignalSchema>;

export type CallServerEvent =
  | { event: 'call:incoming'; callId: number; callerId: number; callerName: string; callerAvatar: string | null; requestId?: string }
  | { event: 'call:initiated'; callId: number; receiverId: number; delivered: boolean }
  | { event: 'call:accept' | 'call:reject' | 'call:busy' | 'call:end'; callId: number; fromUserId: number; reason?: string }
  | { event: 'webrtc:offer' | 'webrtc:answer'; callId: number; fromUserId: number; description: { sdp: string } }
  | { event: 'webrtc:ice-candidate'; callId: number; fromUserId: number; candidate: z.infer<typeof iceCandidate> };
