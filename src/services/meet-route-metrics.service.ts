import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

type Point = { latitude: number; longitude: number };

type RouteMetric = { distanceMeters: number; durationSeconds: number };

type CachedMetrics = {
  savedAt: number;
  value: { you: RouteMetric | null; partner: RouteMetric | null };
};

const cache = new Map<string, CachedMetrics>();
const cacheTtlMs = 2 * 60 * 1000;

const validPoint = (point: Point | null): point is Point =>
  point != null &&
  Number.isFinite(point.latitude) &&
  Number.isFinite(point.longitude) &&
  point.latitude >= -90 &&
  point.latitude <= 90 &&
  point.longitude >= -180 &&
  point.longitude <= 180;

const pointFrom = (latitude: number | null, longitude: number | null): Point | null =>
  latitude == null || longitude == null ? null : { latitude, longitude };

const cachePoint = (point: Point | null) =>
  point == null ? 'missing' : `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;

const durationSeconds = (value: unknown): number | null => {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(String(value));
  if (!match) return null;
  const seconds = Math.round(Number(match[1]));
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
};

const parseRouteMatrixRows = (responseBody: string): Record<string, unknown>[] => {
  const body = responseBody.trim();
  if (!body) return [];

  // Route Matrix is documented as a streaming endpoint, but gateways can
  // return either newline-delimited elements or a normal JSON payload. Parse
  // the complete body first so formatted JSON is not incorrectly parsed one
  // line at a time (where the opening "{" caused the previous 500 error).
  try {
    const parsed: unknown = JSON.parse(body);
    if (Array.isArray(parsed))
      return parsed.filter(
        (row): row is Record<string, unknown> => !!row && typeof row === 'object',
      );
    if (parsed && typeof parsed === 'object') return [parsed as Record<string, unknown>];
  } catch {
    // Fall through to the documented newline-delimited response format.
  }

  try {
    return body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch {
    throw new AppError('Google Routes returned an unreadable route response.', 502);
  }
};

export class MeetRouteMetricsService {
  static async getForRequest(userId: number, requestId: number) {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: {
        senderId: true,
        receiverId: true,
        meetLocationLatitude: true,
        meetLocationLongitude: true,
        senderCurrentLatitude: true,
        senderCurrentLongitude: true,
        receiverCurrentLatitude: true,
        receiverCurrentLongitude: true,
      },
    });
    if (!request || (request.senderId !== userId && request.receiverId !== userId)) {
      throw new AppError('Request not found.', 404);
    }

    const meet = pointFrom(request.meetLocationLatitude, request.meetLocationLongitude);
    if (!validPoint(meet)) throw new AppError('Meet location is not available.', 409);
    // Route metrics must use only coordinates published for this specific
    // live meet. Profile coordinates are not a valid substitute.
    const sender = pointFrom(request.senderCurrentLatitude, request.senderCurrentLongitude);
    const receiver = pointFrom(request.receiverCurrentLatitude, request.receiverCurrentLongitude);
    const you = userId === request.senderId ? sender : receiver;
    const partner = userId === request.senderId ? receiver : sender;
    const key = `${cachePoint(you)}:${cachePoint(partner)}:${cachePoint(meet)}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.savedAt < cacheTtlMs) return cached.value;

    const origins = [you, partner].filter(validPoint);
    if (!env.GOOGLE_ROUTES_API_KEY) {
      logger.error(
        `Route metrics unavailable: GOOGLE_ROUTES_API_KEY is not configured, request=${requestId}`,
      );
      return { you: null, partner: null };
    }
    if (origins.length === 0) {
      logger.info(
        `Route metrics waiting for live locations: request=${requestId}, hasYou=${validPoint(you)}, hasPartner=${validPoint(partner)}`,
      );
      return { you: null, partner: null };
    }
    const response = await fetch(
      'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_ROUTES_API_KEY,
          'X-Goog-FieldMask':
            'originIndex,destinationIndex,distanceMeters,duration,condition,status',
        },
        body: JSON.stringify({
          origins: origins.map((point) => ({ waypoint: { location: { latLng: point } } })),
          destinations: [{ waypoint: { location: { latLng: meet } } }],
          travelMode: 'DRIVE',
          // Google documents this as equivalent to the route calculation used
          // by Google Maps and the Google Maps mobile app.
          routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) {
      const responseBody = await response.text();
      logger.error(
        `Google Routes API failed: status=${response.status}, request=${requestId}, response=${responseBody}`,
      );
      throw new AppError('Could not calculate route metrics.', 502);
    }
    const rows = parseRouteMatrixRows(await response.text());
    const metrics = origins.map((_, index): RouteMetric | null => {
      const row = rows.find(
        (candidate) => candidate.originIndex === index && candidate.condition === 'ROUTE_EXISTS',
      );
      const meters = Number(row?.distanceMeters);
      const seconds = durationSeconds(row?.duration);
      return Number.isFinite(meters) && meters >= 0 && seconds != null
        ? { distanceMeters: Math.round(meters), durationSeconds: seconds }
        : null;
    });
    const value = {
      you: validPoint(you) ? (metrics[origins.indexOf(you)] ?? null) : null,
      partner: validPoint(partner) ? (metrics[origins.indexOf(partner)] ?? null) : null,
    };
    cache.set(key, { savedAt: Date.now(), value });
    return value;
  }
}
