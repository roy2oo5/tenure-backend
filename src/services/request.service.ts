import { prisma } from '../config/database';
import { AppError } from '../utils/app-error';
import { Prisma, Profile, RequestStatus, SessionStatus } from '@prisma/client';
import { NotificationService } from './notification.service';
import { sendToUserForRequest, sendGlobalToAll, sendGlobalToUser } from './websocket.service';
import { randomInt, randomUUID } from 'crypto';
import { otpProximityForRequest } from '../utils/otp-proximity';
import {
  getCategoryMatchVariants,
  profileAcceptsSupportBasedRequests,
} from '../constants/mate-categories';
import { deleteExpiredMessages } from './message-retention.service';
import { RealtimeMessageService } from './realtime-message.service';
import {
  confirmedOtpExpiresAt,
  scheduleConfirmedOtpExpiry,
  scheduleReadyNowExpiration,
} from './request-expiration.service';
import { restoreReadyNow, suspendReadyNow } from './ready-now.service';
import { scheduleScheduledSessionReminder } from './scheduled-session-reminder.service';

export type CreateRequestInput = {
  receiverId: number;
  categoryId: string;
  categoryLabel: string;
  meetLocation: string;
  meetLocationLatitude?: number | null;
  meetLocationLongitude?: number | null;
  fromDateTime: Date;
  toDateTime?: Date | null;
  /** Client local time minus UTC, in minutes (for example India is 330). */
  timezoneOffsetMinutes?: number;
  instantBooking?: boolean;
  responseTime?: number | null;
  responseDeadlineAt?: Date | null;
  message?: string | null;
  bookingFor?: 'self' | 'someone_else';
  beneficiaryName?: string | null;
  beneficiaryPhone?: string | null;
  beneficiaryRelation?: string | null;
  beneficiaryNote?: string | null;
  readyToPayTravelCharges?: boolean;
  readyToPayTip?: boolean;
  extraSupportAmount?: number | null;
  needsMateVehicle?: boolean;
  offersRequesterVehicle?: boolean;
  neededMateVehicleTypes?: Array<'two_wheeler' | 'four_wheeler'>;
  offeredRequesterVehicleType?: 'two_wheeler' | 'four_wheeler' | null;
};

export type QuickPickInput = {
  category: string;
  meetLocation: string;
  latitude: number;
  longitude: number;
  hourlyRate: number;
  durationMinutes: number;
  responseTime: number;
  radiusKm?: number;
  timezoneOffsetMinutes: number;
  bookingFor?: 'self' | 'someone_else';
  beneficiaryName?: string | null;
  beneficiaryPhone?: string | null;
  beneficiaryRelation?: string | null;
  beneficiaryNote?: string | null;
  message?: string | null;
  readyToPayTravelCharges?: boolean;
  readyToPayTip?: boolean;
  extraSupportAmount?: number | null;
  neededMateVehicleTypes?: Array<'two_wheeler' | 'four_wheeler'>;
  offeredRequesterVehicleType?: 'two_wheeler' | 'four_wheeler' | null;
};

function distanceBetweenKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type FrontendRequestStatus =
  | 'pending'
  | 'awaiting_sender_confirmation'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'ended';

export type MappedRequest = {
  id: number;
  direction: 'sent' | 'received';
  mateUserId: number;
  mateName: string;
  mateTenureId: string;
  mateAvatar: string;
  categoryId: string;
  categoryLabel: string;
  meetLocation: string;
  meetLocationLatitude?: number | null;
  meetLocationLongitude?: number | null;
  fromDateTime: string;
  toDateTime: string | null;
  instantBooking: boolean;
  quickPickGroupId?: string | null;
  responseDeadlineAt: string | null;
  message: string;
  bookingFor: 'self' | 'someone_else';
  beneficiaryName?: string | null;
  beneficiaryPhone?: string | null;
  beneficiaryRelation?: string | null;
  beneficiaryNote?: string | null;
  readyToPayTravelCharges: boolean;
  readyToPayTip: boolean;
  extraSupportAmount: number | null;
  needsMateVehicle: boolean;
  offersRequesterVehicle: boolean;
  neededMateVehicleTypes: string[];
  offeredRequesterVehicleType: string | null;
  requestHourlyRate: number | null;
  mateGender?: string | null;
  mateDob?: string | null;
  mateIsMinor: boolean;
  mateLocation?: string | null;
  mateCategories: string[];
  mateCategoryRates: Record<string, number>;
  mateHourlyRate: number | null;
  mateLanguages: string[];
  mateAvailableDays: string[];
  mateAvailableTime?: string | null;
  mateWeeklyAvailability?: Prisma.JsonValue | null;
  mateBestTime?: string | null;
  mateVehicles: string[];
  mateAbout?: string | null;
  mateProfessions: string[];
  mateQualification?: string | null;
  mateBloodGroup?: string | null;
  mateAadhaarVerified: boolean;
  matePhoneAdded: boolean;
  mateEmailAdded: boolean;
  mateLivePhotoAdded: boolean;
  mateGalleryPhotos: string[];
  mateLatitude?: number | null;
  mateLongitude?: number | null;
  mateInstagram?: string | null;
  mateFacebook?: string | null;
  mateYoutube?: string | null;
  mateWebsite?: string | null;
  status: FrontendRequestStatus;
  sentAt: string;
  historyEventAt?: string | null;
  historyActor?: 'you' | 'mate' | null;
  historyReason?: string | null;
  sessionStatus?: string | null;
  sessionEndedAt?: string | null;
  sessionElapsedSec?: number | null;
  postMeet?: {
    rating: number | null;
    review: string | null;
    ratedAt: string | null;
    paymentCompleted: boolean;
    paymentUpiId: string | null;
    paymentMode: string | null;
    paidAt: string | null;
    amountPaid: number;
    amountReceived: number;
    reportAvailableUntil: string | null;
    reportSubmitted: boolean;
  };
  otp?: string | null;
  otpProximityReady?: boolean;
  otpDistanceMeters?: number | null;
  otpProximityMessage?: string;
  requesterGender?: string | null;
  cancellationFee: number;
  cancellationFeeReason?: string | null;
  cancelledAt?: string | null;
  cancelledById?: number | null;
  cancellationFeeApplies: boolean;
  cancellationFeePreview: number;
  quickChatSuggestions: string[];
};

const SCHEDULED_REQUEST_LEAD_TIME_MS = 15 * 60 * 1000;
const EXPIRABLE_STATUSES = [
  RequestStatus.PENDING,
  RequestStatus.ACCEPTED_BY_RECEIVER,
  RequestStatus.CONFIRMED,
] as RequestStatus[];
const ACTIVE_DUPLICATE_REQUEST_STATUSES = [
  RequestStatus.PENDING,
  RequestStatus.ACCEPTED_BY_RECEIVER,
  RequestStatus.CONFIRMED,
] as RequestStatus[];
const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const INSTANT_RESPONSE_WINDOWS_MINUTES = [5, 8, 10, 12, 15, 20] as const;
const SOMEONE_ELSE_DAILY_BOOKING_LIMIT = 3;
const SOMEONE_ELSE_BOOKING_LIMIT_MESSAGE = 'You have already booked for 3 people.';

function localDayBounds(date: Date, timezoneOffsetMinutes = 0): { start: Date; end: Date } {
  const offsetMs = timezoneOffsetMinutes * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const start = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs,
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function isToday(date: Date, timezoneOffsetMinutes = 0): boolean {
  const target = localDayBounds(date, timezoneOffsetMinutes);
  const now = localDayBounds(new Date(), timezoneOffsetMinutes);
  return target.start.getTime() === now.start.getTime();
}

const activeSessionFilter = {
  OR: [{ session: null }, { session: { is: { status: { not: SessionStatus.ENDED } } } }],
};

// A confirmed booking reserves its selected date until the support timer is
// actually ended. Payment and review happen after a support, but must not keep
// the date Full once the support itself is complete.
const dateBlockingSessionFilter = {
  OR: [
    { session: null },
    {
      session: {
        is: { status: { not: SessionStatus.ENDED } },
      },
    },
  ],
};

async function scheduledRequestsForUserOnDate(
  userId: number,
  date: Date,
  timezoneOffsetMinutes = 0,
  excludeRequestId?: number,
) {
  const { start, end } = localDayBounds(date, timezoneOffsetMinutes);
  return (
    (await prisma.request.findMany({
      where: {
        ...(excludeRequestId == null ? {} : { id: { not: excludeRequestId } }),
        instantBooking: false,
        status: RequestStatus.CONFIRMED,
        AND: [dateBlockingSessionFilter],
        fromDateTime: {
          gte: new Date(start.getTime() - 48 * 60 * 60 * 1000),
          lt: new Date(end.getTime() + 48 * 60 * 60 * 1000),
        },
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { id: true, fromDateTime: true, toDateTime: true, receiverId: true },
      orderBy: { fromDateTime: 'asc' },
    })) ?? []
  );
}

function hasMeetOnDate(
  meets: Array<{ fromDateTime: Date; toDateTime: Date | null }>,
  date: Date,
  timezoneOffsetMinutes = 0,
): boolean {
  const { start, end } = localDayBounds(date, timezoneOffsetMinutes);
  return meets.some((meet) => meet.fromDateTime >= start && meet.fromDateTime < end);
}

const mapStatusToFrontend = (status: RequestStatus): FrontendRequestStatus => {
  switch (status) {
    case RequestStatus.PENDING:
      return 'pending';
    case RequestStatus.ACCEPTED_BY_RECEIVER:
      return 'awaiting_sender_confirmation';
    case RequestStatus.CONFIRMED:
      return 'confirmed';
    case RequestStatus.DECLINED:
      return 'declined';
    case RequestStatus.CANCELLED:
      return 'cancelled';
    case RequestStatus.EXPIRED:
      return 'expired';
  }
};

const mapStatusToBackend = (status: 'declined' | 'cancelled'): RequestStatus => {
  switch (status) {
    case 'declined':
      return RequestStatus.DECLINED;
    case 'cancelled':
      return RequestStatus.CANCELLED;
  }
};

const formatSentAt = (date: Date): string => {
  return date.toISOString();
};

const mapRequestStatusWithSession = (
  status: RequestStatus,
  session?: { status: SessionStatus; endedAt?: Date | null } | null,
): FrontendRequestStatus => {
  if (session?.status === SessionStatus.ENDED) {
    return 'ended';
  }
  return mapStatusToFrontend(status);
};

const isExpirableStatus = (status: RequestStatus): boolean => EXPIRABLE_STATUSES.includes(status);

const shouldExpireRequest = (request: {
  status: RequestStatus;
  fromDateTime?: Date | null;
  timezoneOffsetMinutes?: number | null;
  toDateTime?: Date | null;
  responseDeadlineAt?: Date | null;
  instantBooking?: boolean | null;
  session?: unknown | null;
}): boolean => {
  const isInstantBooking = Boolean(request.instantBooking);
  const startsAt = request.fromDateTime?.getTime() ?? Number.POSITIVE_INFINITY;
  const responseTimedOut = Boolean(
    request.status === RequestStatus.PENDING &&
    request.responseDeadlineAt &&
    request.responseDeadlineAt.getTime() <= Date.now(),
  );
  const meetStartedWithoutRequiredConfirmation = Boolean(
    (request.status === RequestStatus.PENDING ||
      request.status === RequestStatus.ACCEPTED_BY_RECEIVER) &&
    !isInstantBooking &&
    startsAt <= Date.now(),
  );
  const confirmedMeetExpiredWithoutSession = Boolean(
    request.status === RequestStatus.CONFIRMED &&
    confirmedOtpExpiresAt(request.fromDateTime!, request.timezoneOffsetMinutes ?? 0).getTime() <=
      Date.now() &&
    !request.session,
  );

  return (
    isExpirableStatus(request.status) &&
    (responseTimedOut ||
      meetStartedWithoutRequiredConfirmation ||
      confirmedMeetExpiredWithoutSession)
  );
};

const isConfirmedOtpGraceExpired = (request: {
  status: RequestStatus;
  fromDateTime?: Date | null;
  timezoneOffsetMinutes?: number | null;
  session?: unknown | null;
}): boolean =>
  request.status === RequestStatus.CONFIRMED &&
  request.fromDateTime != null &&
  confirmedOtpExpiresAt(request.fromDateTime, request.timezoneOffsetMinutes ?? 0).getTime() <=
    Date.now() &&
  !request.session;

const effectiveRequestStatus = (request: {
  status: RequestStatus;
  fromDateTime?: Date | null;
  timezoneOffsetMinutes?: number | null;
  toDateTime?: Date | null;
  responseDeadlineAt?: Date | null;
  instantBooking?: boolean | null;
  session?: unknown | null;
  quickPickGroupId?: string | null;
}): RequestStatus => {
  if (isConfirmedOtpGraceExpired(request)) return RequestStatus.EXPIRED;
  if (shouldExpireRequest(request)) {
    return request.quickPickGroupId && request.status === RequestStatus.PENDING
      ? RequestStatus.CANCELLED
      : RequestStatus.EXPIRED;
  }
  return request.status;
};

const requestHistoryFields = (
  request: {
    id: number;
    status: RequestStatus;
    createdAt: Date;
    updatedAt: Date;
    fromDateTime?: Date | null;
    timezoneOffsetMinutes?: number | null;
    responseDeadlineAt?: Date | null;
    instantBooking?: boolean | null;
    cancelledAt?: Date | null;
    cancelledById?: number | null;
    cancellationFeeReason?: string | null;
    senderId: number;
    quotedHourlyRate?: number | null;
    session?: {
      status: SessionStatus;
      endedAt?: Date | null;
      senderRating?: number | null;
      senderReview?: string | null;
      senderRatedAt?: Date | null;
      receiverRating?: number | null;
      receiverReview?: string | null;
      receiverRatedAt?: Date | null;
      paymentCompletedAt?: Date | null;
      paymentCompletedBy?: number | null;
      totalElapsedSeconds?: number | null;
      paymentUpiId?: string | null;
      paymentMode?: string | null;
    } | null;
  },
  viewerId: number,
  reportedRequestIds: ReadonlySet<number> = new Set(),
) => {
  const status = effectiveRequestStatus(request);
  let eventAt = request.createdAt;

  if (request.session?.status === SessionStatus.ENDED && request.session.endedAt) {
    eventAt = request.session.endedAt;
  } else if (status === RequestStatus.CANCELLED || status === RequestStatus.DECLINED) {
    eventAt = request.cancelledAt ?? request.updatedAt;
  } else if (status === RequestStatus.EXPIRED) {
    if (request.status === RequestStatus.EXPIRED) {
      eventAt = request.updatedAt;
    } else if (request.responseDeadlineAt && request.responseDeadlineAt <= new Date()) {
      eventAt = request.responseDeadlineAt;
    } else if (request.fromDateTime) {
      eventAt =
        request.status === RequestStatus.CONFIRMED
          ? confirmedOtpExpiresAt(request.fromDateTime, request.timezoneOffsetMinutes ?? 0)
          : request.fromDateTime;
    }
  }

  return {
    historyEventAt: eventAt.toISOString(),
    historyActor:
      request.cancelledById == null
        ? null
        : request.cancelledById === viewerId
          ? ('you' as const)
          : ('mate' as const),
    historyReason: request.cancellationFeeReason ?? null,
    postMeet: request.session
      ? {
          rating:
            request.senderId === viewerId
              ? (request.session.senderRating ?? null)
              : (request.session.receiverRating ?? null),
          review:
            request.senderId === viewerId
              ? (request.session.senderReview ?? null)
              : (request.session.receiverReview ?? null),
          ratedAt:
            (request.senderId === viewerId
              ? request.session.senderRatedAt
              : request.session.receiverRatedAt
            )?.toISOString() ?? null,
          paymentCompleted: request.session.paymentCompletedAt != null,
          paymentUpiId: request.session.paymentUpiId ?? null,
          paymentMode: request.session.paymentMode ?? null,
          paidAt: request.session.paymentCompletedAt?.toISOString() ?? null,
          amountPaid:
            request.session.paymentCompletedAt != null &&
            request.session.paymentCompletedBy === viewerId
              ? Number(
                  (
                    ((request.session.totalElapsedSeconds ?? 0) / 3600) *
                    (request.quotedHourlyRate ?? 0)
                  ).toFixed(2),
                )
              : 0,
          amountReceived:
            request.session.paymentCompletedAt != null &&
            request.session.paymentCompletedBy != null &&
            request.session.paymentCompletedBy !== viewerId
              ? Number(
                  (
                    ((request.session.totalElapsedSeconds ?? 0) / 3600) *
                    (request.quotedHourlyRate ?? 0)
                  ).toFixed(2),
                )
              : 0,
          reportAvailableUntil: request.session.endedAt
            ? new Date(request.session.endedAt.getTime() + 2 * 60 * 60 * 1000).toISOString()
            : null,
          reportSubmitted: reportedRequestIds.has(request.id),
        }
      : undefined,
  };
};

const mapSessionStatus = (session?: { status: SessionStatus } | null): string | null => {
  if (!session) return null;
  switch (session.status) {
    case SessionStatus.RUNNING:
      return 'running';
    case SessionStatus.PAUSE_REQUESTED:
      return 'pause_requested';
    case SessionStatus.PAUSED:
      return 'paused';
    case SessionStatus.RESUME_REQUESTED:
      return 'resume_requested';
    case SessionStatus.END_REQUESTED:
      return 'end_requested';
    case SessionStatus.ENDED:
      return 'ended';
  }
};

const getProfileAvatar = (
  profile?: { profilePhoto?: string | null; gallery?: string[] | null } | null,
): string => {
  const profilePhoto = profile?.profilePhoto?.trim();
  return profilePhoto ?? '';
};

const categoryRatesRecord = (value?: Profile['categoryRates'] | null): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([category, rate]) => [category, Number(rate)] as const)
      .filter(([category, rate]) => category.trim() && Number.isFinite(rate) && rate >= 0),
  );
};

const profileLocation = (profile?: Profile | null): string | null => {
  const parts = [profile?.district, profile?.state, profile?.country]
    .map((value) => value?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

const hasUserProvidedEmail = (email?: string | null): boolean => {
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized && !/^phone_\d+@tenure\.app$/.test(normalized));
};

const isRequestBasedProfile = (profile?: Profile | null): boolean =>
  Boolean(
    profile?.categories?.some((category) => {
      const normalized = category.trim().toLowerCase();
      return normalized === 'support based on request' || normalized === 'open to any';
    }),
  );

const fixedHourlyRateForRequest = (
  profile: Profile | null | undefined,
  categoryLabel: string,
): number | null => {
  if (!profile || isRequestBasedProfile(profile)) return null;
  if (!profile.categories?.length) return null;
  const variants = new Set(
    [categoryLabel, ...getCategoryMatchVariants(categoryLabel)].map((value) =>
      value.trim().toLowerCase(),
    ),
  );
  const categorySelected = profile.categories.some((category) =>
    variants.has(category.trim().toLowerCase()),
  );
  if (!categorySelected) {
    throw new AppError('This supporter does not offer the selected support type', 400);
  }
  const matched = Object.entries(categoryRatesRecord(profile.categoryRates)).find(([category]) =>
    variants.has(category.trim().toLowerCase()),
  );
  const rate = matched?.[1];
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    throw new AppError('The selected support type does not have a valid hourly rate', 400);
  }
  return rate;
};

const profileFields = (user: {
  phone?: string | null;
  email?: string | null;
  profile?: Profile | null;
}) => {
  const profile = user.profile;
  const gallery = profile?.gallery ?? [];
  const publicGallery = gallery.filter((uri) => !uri.toLowerCase().includes('live-photo'));
  return {
    mateGender: profile?.gender ?? null,
    mateDob: profile?.dob?.toISOString() ?? null,
    mateIsMinor: profile?.isMinor ?? false,
    mateLocation: profileLocation(profile),
    mateCategories: profile?.categories ?? [],
    mateCategoryRates: categoryRatesRecord(profile?.categoryRates),
    mateHourlyRate: profile?.hourlyRate ?? null,
    mateLanguages: profile?.languages ?? [],
    mateAvailableDays: profile?.availableDays ?? [],
    mateAvailableTime: profile?.availableTimeRange ?? null,
    mateWeeklyAvailability: profile?.weeklyAvailability ?? null,
    mateBestTime: profile?.bestTime ?? null,
    mateVehicles: profile?.vehicles ?? [],
    mateAbout: profile?.about ?? null,
    mateProfessions: profile?.professions ?? [],
    mateQualification: profile?.qualification ?? null,
    mateBloodGroup: profile?.bloodGroup ?? null,
    mateAadhaarVerified: profile?.aadhaarVerified ?? false,
    matePhoneAdded: Boolean(user.phone?.trim()),
    mateEmailAdded: hasUserProvidedEmail(user.email),
    mateLivePhotoAdded:
      Boolean(profile?.livePhotoUrl?.trim()) ||
      gallery.some((uri) => uri.toLowerCase().includes('live-photo')),
    mateGalleryPhotos: publicGallery,
    mateLatitude: profile?.latitude ?? null,
    mateLongitude: profile?.longitude ?? null,
    mateInstagram: profile?.instagram ?? null,
    mateFacebook: profile?.facebook ?? null,
    mateYoutube: profile?.youtube ?? null,
    mateWebsite: profile?.website ?? null,
  };
};

const cancellationFields = (request: {
  cancellationFee: number;
  cancellationFeeReason?: string | null;
  cancelledAt?: Date | null;
  cancelledById?: number | null;
}) => ({
  // Late-cancellation charges are no longer part of the product. Keep the
  // response fields temporarily for older clients, but never expose a charge.
  cancellationFee: 0,
  cancellationFeeReason: request.cancellationFeeReason ?? null,
  cancelledAt: request.cancelledAt?.toISOString() ?? null,
  cancelledById: request.cancelledById ?? null,
});

const beneficiaryFields = (request: {
  bookingFor?: string | null;
  beneficiaryName?: string | null;
  beneficiaryPhone?: string | null;
  beneficiaryRelation?: string | null;
  beneficiaryNote?: string | null;
}) => ({
  bookingFor: request.bookingFor === 'someone_else' ? ('someone_else' as const) : ('self' as const),
  beneficiaryName: request.beneficiaryName ?? null,
  beneficiaryPhone: request.beneficiaryPhone ?? null,
  beneficiaryRelation: request.beneficiaryRelation ?? null,
  beneficiaryNote: request.beneficiaryNote ?? null,
});

const quickChatSuggestions = (request: {
  sender?: { profile: { aadhaarVerified: boolean } | null };
  receiver?: { profile: { aadhaarVerified: boolean } | null };
  needsMateVehicle: boolean;
  neededMateVehicleTypes?: string[];
  offersRequesterVehicle: boolean;
  offeredRequesterVehicleType?: string | null;
}): string[] => {
  const suggestions: string[] = [];
  if (
    (request.sender !== undefined && request.sender.profile?.aadhaarVerified !== true) ||
    (request.receiver !== undefined && request.receiver.profile?.aadhaarVerified !== true)
  ) {
    suggestions.push('Please verify your KYC.');
  }
  if (
    request.needsMateVehicle ||
    (request.neededMateVehicleTypes?.length ?? 0) > 0 ||
    request.offersRequesterVehicle ||
    request.offeredRequesterVehicleType != null
  ) {
    suggestions.push('Please bring your vehicle documents and driving licence.');
  }
  return suggestions;
};

const instantRequestFields = (request: {
  instantBooking?: boolean | null;
  responseDeadlineAt?: Date | null;
}) => ({
  instantBooking: Boolean(request.instantBooking),
  responseDeadlineAt: request.responseDeadlineAt?.toISOString() ?? null,
});

const normalizeOptionalText = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

async function cancelOutgoingNormalRequests(
  tx: Prisma.TransactionClient,
  senderId: number,
  quickPickRequestId: number,
  now: Date,
): Promise<Array<{ id: number; receiverId: number }>> {
  await tx.request.updateMany({
    where: {
      senderId,
      id: { not: quickPickRequestId },
      quickPickGroupId: null,
      status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
    },
    data: {
      status: RequestStatus.CANCELLED,
      otp: null,
      cancelledAt: now,
      cancellationFeeReason: 'Auto Cancelled',
    },
  });
  return tx.request.findMany({
    where: {
      senderId,
      quickPickGroupId: null,
      status: RequestStatus.CANCELLED,
      cancelledAt: now,
      cancellationFeeReason: 'Auto Cancelled',
    },
    select: { id: true, receiverId: true },
  });
}

const cancellationPreviewFields = (_request: {
  status: RequestStatus;
  fromDateTime: Date;
  quotedHourlyRate?: number | null;
}) => ({
  cancellationFeeApplies: false,
  cancellationFeePreview: 0,
});

const normalizeDayKey = (value: string): string => value.trim().slice(0, 3).toUpperCase();

const minutesFromTimeParts = (hourRaw: number, minute: number, marker?: string): number | null => {
  if (!Number.isFinite(hourRaw) || !Number.isFinite(minute)) {
    return null;
  }
  let hour = hourRaw;
  const normalizedMarker = marker?.toLowerCase();
  if (normalizedMarker === 'pm' && hour < 12) {
    hour += 12;
  }
  if (normalizedMarker === 'am' && hour === 12) {
    hour = 0;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
};

const parseAvailabilityRange = (value?: string | null): { start: number; end: number } | null => {
  const matches = [...(value ?? '').matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)?/gi)];
  if (matches.length < 2) {
    return null;
  }
  const firstMarker = matches[0][3];
  const secondMarker = matches[1][3] ?? firstMarker;
  const start = minutesFromTimeParts(Number(matches[0][1]), Number(matches[0][2]), firstMarker);
  const end = minutesFromTimeParts(Number(matches[1][1]), Number(matches[1][2]), secondMarker);
  if (start == null || end == null || start === end) {
    return null;
  }
  return { start, end };
};

const localDateParts = (date: Date, timezoneOffsetMinutes: number) => {
  const shifted = new Date(date.getTime() + timezoneOffsetMinutes * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
};

const minimumScheduledStart = (): Date => {
  const now = new Date();
  const flooredToMinute = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    0,
    0,
  );
  return new Date(flooredToMinute.getTime() + SCHEDULED_REQUEST_LEAD_TIME_MS);
};

const requestFitsAvailability = (
  profile:
    | Pick<Profile, 'availableDays' | 'availableTimeRange' | 'weeklyAvailability'>
    | null
    | undefined,
  from: Date,
  to?: Date | null,
  timezoneOffsetMinutes = 0,
): boolean => {
  if (!profile) {
    return true;
  }

  const weekly =
    profile.weeklyAvailability &&
    typeof profile.weeklyAvailability === 'object' &&
    !Array.isArray(profile.weeklyAvailability)
      ? (profile.weeklyAvailability as Record<string, { start?: unknown; end?: unknown }>)
      : null;
  const weeklyDays = weekly ? Object.keys(weekly).map(normalizeDayKey).filter(Boolean) : [];
  const days = weeklyDays.length
    ? weeklyDays
    : (profile.availableDays ?? []).map(normalizeDayKey).filter(Boolean);
  const effectiveTo = to ?? from;

  const fromLocal = localDateParts(from, timezoneOffsetMinutes);
  const toLocal = localDateParts(effectiveTo, timezoneOffsetMinutes);
  const dayKey = DAY_KEYS[fromLocal.day];
  const daySlot = weekly?.[dayKey];
  const range = daySlot
    ? parseAvailabilityRange(`${String(daySlot.start)} - ${String(daySlot.end)}`)
    : parseAvailabilityRange(profile.availableTimeRange);
  if (!days.length && !range) {
    return true;
  }

  // Weekday is the first availability gate for recurring weekly schedules.
  if (days.length && !days.includes(dayKey)) {
    return false;
  }

  if (weeklyDays.length && !daySlot) return false;

  if (
    fromLocal.year !== toLocal.year ||
    fromLocal.month !== toLocal.month ||
    fromLocal.date !== toLocal.date
  ) {
    return false;
  }

  if (!range) {
    return true;
  }

  const start = fromLocal.minutes;
  const end = toLocal.minutes;

  if (range.end > range.start) {
    return start >= range.start && end <= range.end;
  }

  return start >= range.start || end <= range.end;
};

export class RequestService {
  public static async createQuickPick(senderId: number, input: QuickPickInput) {
    const now = new Date();
    const radiusKm = input.radiusKm ?? 50;
    const { start, end } = localDayBounds(now, input.timezoneOffsetMinutes);
    const bookingFor = input.bookingFor === 'someone_else' ? 'someone_else' : 'self';
    const beneficiaryName = normalizeOptionalText(input.beneficiaryName);
    if (bookingFor === 'someone_else' && !beneficiaryName) {
      throw new AppError('Person name is required', 400);
    }
    const senderProfile = await prisma.profile.findUnique({ where: { userId: senderId } });
    if (senderProfile?.readyNowEnabled) {
      throw new AppError('Turn off Ready Now before sending a Ready Now request', 409);
    }
    if (bookingFor === 'someone_else') {
      const confirmedCount = await prisma.request.count({
        where: {
          senderId,
          bookingFor: 'someone_else',
          status: RequestStatus.CONFIRMED,
          fromDateTime: { gte: start, lt: end },
        },
      });
      if (confirmedCount >= SOMEONE_ELSE_DAILY_BOOKING_LIMIT) {
        throw new AppError(SOMEONE_ELSE_BOOKING_LIMIT_MESSAGE, 409);
      }
    }

    const blocks = await prisma.block.findMany({
      where: { OR: [{ blockerId: senderId }, { blockedId: senderId }] },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = blocks.map((block) =>
      block.blockerId === senderId ? block.blockedId : block.blockerId,
    );
    const profiles = await prisma.profile.findMany({
      where: {
        userId: { notIn: [senderId, ...blockedIds] },
        instantAvailable: true,
        readyNowEnabled: true,
        instantAvailableUntil: { gt: now },
        isMinor: false,
        user: { isActive: true },
      },
      select: { userId: true, latitude: true, longitude: true, categories: true },
    });
    const nearbyIds = profiles
      .filter(
        (profile) =>
          profileAcceptsSupportBasedRequests(profile.categories) &&
          profile.latitude != null &&
          profile.longitude != null &&
          distanceBetweenKm(input.latitude, input.longitude, profile.latitude, profile.longitude) <=
            radiusKm,
      )
      .map((profile) => profile.userId);

    const activeSelfBooking = await prisma.request.findFirst({
      where: {
        OR: [{ senderId }, { receiverId: senderId }],
        status: RequestStatus.CONFIRMED,
        AND: [activeSessionFilter],
      },
      select: { id: true },
    });
    if (bookingFor === 'self' && activeSelfBooking) {
      throw new AppError('Book for Someone Else while your support is confirmed or running.', 409);
    }
    const scheduledMeetings = await prisma.request.findMany({
      where: {
        instantBooking: false,
        status: RequestStatus.CONFIRMED,
        fromDateTime: { gte: start, lt: end },
        AND: [dateBlockingSessionFilter],
        OR: [
          { senderId: { in: [senderId, ...nearbyIds] } },
          { receiverId: { in: [senderId, ...nearbyIds] } },
        ],
      },
      select: { senderId: true, receiverId: true },
    });
    const bookedIds = new Set(
      scheduledMeetings.flatMap((meeting) => [meeting.senderId, meeting.receiverId]),
    );
    if (bookingFor === 'self' && bookedIds.has(senderId)) {
      throw new AppError('Ready Now is unavailable on a date with a scheduled meet', 409);
    }

    const existing = nearbyIds.length
      ? await prisma.request.findMany({
          where: {
            senderId,
            receiverId: { in: nearbyIds },
            status: {
              in: [
                RequestStatus.PENDING,
                RequestStatus.ACCEPTED_BY_RECEIVER,
                RequestStatus.CONFIRMED,
              ],
            },
            AND: [activeSessionFilter],
          },
          select: { receiverId: true },
        })
      : [];
    const busyIds = new Set(existing.map((request) => request.receiverId));
    const eligibleIds = nearbyIds.filter((id) => !busyIds.has(id) && !bookedIds.has(id));
    if (!eligibleIds.length) {
      throw new AppError(
        `No supporter found within ${radiusKm} km of your selected location.`,
        404,
      );
    }

    const groupId = randomUUID();
    const responseDeadlineAt = new Date(now.getTime() + input.responseTime * 60_000);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(${senderId})::text AS lock_result`,
      );
      const activeQuickPick = await tx.request.findFirst({
        where: {
          senderId,
          quickPickGroupId: { not: null },
          status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
          responseDeadlineAt: { gt: now },
        },
        select: { id: true },
      });
      if (activeQuickPick) {
        throw new AppError('A Quick Pick request is already active', 409);
      }
      if (bookingFor === 'someone_else') {
        const confirmedCount = await tx.request.count({
          where: {
            senderId,
            bookingFor: 'someone_else',
            status: RequestStatus.CONFIRMED,
            fromDateTime: { gte: start, lt: end },
          },
        });
        if (confirmedCount >= SOMEONE_ELSE_DAILY_BOOKING_LIMIT) {
          throw new AppError(SOMEONE_ELSE_BOOKING_LIMIT_MESSAGE, 409);
        }
      } else {
        const currentSupport = await tx.request.findFirst({
          where: {
            OR: [{ senderId }, { receiverId: senderId }],
            status: RequestStatus.CONFIRMED,
            AND: [activeSessionFilter],
          },
          select: { id: true },
        });
        if (currentSupport) {
          throw new AppError(
            'Book for Someone Else while your support is confirmed or running.',
            409,
          );
        }
      }
      await tx.request.createMany({
        data: eligibleIds.map((receiverId) => ({
          senderId,
          receiverId,
          categoryId: input.category,
          categoryLabel: input.category,
          meetLocation: input.meetLocation,
          meetLocationLatitude: input.latitude,
          meetLocationLongitude: input.longitude,
          fromDateTime: now,
          toDateTime: new Date(now.getTime() + input.durationMinutes * 60_000),
          timezoneOffsetMinutes: input.timezoneOffsetMinutes,
          instantBooking: true,
          quickPickGroupId: groupId,
          responseDeadlineAt,
          quotedHourlyRate: input.hourlyRate,
          bookingFor,
          beneficiaryName: bookingFor === 'someone_else' ? beneficiaryName : null,
          beneficiaryPhone:
            bookingFor === 'someone_else' ? normalizeOptionalText(input.beneficiaryPhone) : null,
          beneficiaryRelation:
            bookingFor === 'someone_else' ? normalizeOptionalText(input.beneficiaryRelation) : null,
          beneficiaryNote:
            bookingFor === 'someone_else' ? normalizeOptionalText(input.beneficiaryNote) : null,
          message: normalizeOptionalText(input.message) ?? '',
          readyToPayTravelCharges: input.readyToPayTravelCharges ?? false,
          readyToPayTip: input.readyToPayTip ?? false,
          extraSupportAmount: input.readyToPayTip ? (input.extraSupportAmount ?? null) : null,
          needsMateVehicle: (input.neededMateVehicleTypes?.length ?? 0) > 0,
          offersRequesterVehicle: input.offeredRequesterVehicleType != null,
          neededMateVehicleTypes: input.neededMateVehicleTypes ?? [],
          offeredRequesterVehicleType: input.offeredRequesterVehicleType ?? null,
          status: RequestStatus.PENDING,
        })),
      });
    });
    scheduleReadyNowExpiration(responseDeadlineAt);
    const created = await prisma.request.findMany({
      where: { quickPickGroupId: groupId },
      select: { id: true, receiverId: true },
    });
    for (const request of created) {
      sendGlobalToUser(request.receiverId, { event: 'request_created', requestId: request.id });
      void NotificationService.createNotification(
        request.receiverId,
        'new_request',
        `Quick Pick request at Rs ${input.hourlyRate}/hr. Please respond within ${input.responseTime} minutes.`,
        senderId,
      ).catch((error) => console.error('Quick Pick notification failed:', error));
    }
    sendGlobalToUser(senderId, { event: 'request_updated' });
    return {
      groupId,
      responseDeadlineAt: responseDeadlineAt.toISOString(),
      supporterCount: created.length,
    };
  }

  public static async getQuickPickStatus(senderId: number, groupId: string) {
    const requests = await prisma.request.findMany({
      where: { quickPickGroupId: groupId, senderId },
      include: { receiver: { include: { profile: true } } },
      orderBy: { id: 'asc' },
    });
    if (!requests.length) throw new AppError('Quick Pick request not found', 404);
    const accepted = requests.find(
      (request) => request.status === RequestStatus.ACCEPTED_BY_RECEIVER,
    );
    const confirmed = requests.find((request) => request.status === RequestStatus.CONFIRMED);
    const winner = accepted ?? confirmed;
    return {
      state: winner
        ? accepted
          ? 'accepted'
          : 'confirmed'
        : requests.some(
              (request) =>
                request.status === RequestStatus.CANCELLED &&
                request.cancellationFeeReason !== 'Response time elapsed',
            ) && requests.every((request) => request.status !== RequestStatus.PENDING)
          ? 'cancelled'
          : requests[0].responseDeadlineAt != null && requests[0].responseDeadlineAt > new Date()
            ? 'waiting'
            : 'timed_out',
      responseDeadlineAt: requests[0].responseDeadlineAt?.toISOString() ?? null,
      responseTimeMinutes:
        requests[0].responseDeadlineAt && requests[0].createdAt
          ? Math.round(
              (requests[0].responseDeadlineAt.getTime() - requests[0].createdAt.getTime()) / 60_000,
            )
          : null,
      supporter: winner
        ? {
            requestId: winner.id,
            name: winner.receiver.profile?.fullName ?? winner.receiver.name ?? 'Supporter',
            avatar: getProfileAvatar(winner.receiver.profile),
            tenureId: winner.receiver.tenureId,
            category: winner.categoryLabel,
            meetLocation: winner.meetLocation,
            hourlyRate: winner.quotedHourlyRate,
            durationMinutes: winner.toDateTime
              ? Math.round((winner.toDateTime.getTime() - winner.fromDateTime.getTime()) / 60_000)
              : null,
          }
        : null,
    };
  }

  public static async cancelQuickPick(senderId: number, groupId: string): Promise<void> {
    const requests = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(${senderId})::text AS lock_result`,
      );
      const requests = await tx.request.findMany({
        where: { quickPickGroupId: groupId, senderId },
        select: { id: true, receiverId: true, status: true },
      });
      if (!requests.length) throw new AppError('Quick Pick request not found', 404);
      if (requests.some((request) => request.status === RequestStatus.CONFIRMED)) {
        throw new AppError('Cancel the confirmed request from chat instead.', 409);
      }
      await tx.request.updateMany({
        where: {
          quickPickGroupId: groupId,
          senderId,
          status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
        },
        data: {
          status: RequestStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: senderId,
          otp: null,
        },
      });
      return requests;
    });
    for (const request of requests) {
      sendGlobalToUser(request.receiverId, { event: 'request_updated', requestId: request.id });
    }
    sendGlobalToUser(senderId, { event: 'request_updated' });
  }

  private static async persistExpiredRequests(
    requests: Array<{
      id: number;
      status: RequestStatus;
      fromDateTime?: Date | null;
      timezoneOffsetMinutes?: number | null;
      toDateTime?: Date | null;
      responseDeadlineAt?: Date | null;
      instantBooking?: boolean | null;
      session?: unknown | null;
      quickPickGroupId?: string | null;
    }>,
  ): Promise<void> {
    const confirmedGraceExpiredIds = requests
      .filter(isConfirmedOtpGraceExpired)
      .map((request) => request.id);
    const overdue = requests.filter(
      (request) => !isConfirmedOtpGraceExpired(request) && shouldExpireRequest(request),
    );
    const cancelledQuickPickIds = overdue
      .filter((request) => request.quickPickGroupId && request.status === RequestStatus.PENDING)
      .map((request) => request.id);
    const expiredIds = overdue
      .filter((request) => !request.quickPickGroupId || request.status !== RequestStatus.PENDING)
      .map((request) => request.id);

    if (!expiredIds.length && !confirmedGraceExpiredIds.length && !cancelledQuickPickIds.length) {
      return;
    }

    if (confirmedGraceExpiredIds.length) {
      await prisma.request.updateMany({
        where: {
          id: { in: confirmedGraceExpiredIds },
          status: RequestStatus.CONFIRMED,
          session: null,
        },
        data: {
          status: RequestStatus.EXPIRED,
          otp: null,
          cancellationFeeReason: 'OTP was not entered on the scheduled support date.',
        },
      });
    }

    if (cancelledQuickPickIds.length) {
      await prisma.request.updateMany({
        where: { id: { in: cancelledQuickPickIds }, status: RequestStatus.PENDING },
        data: {
          status: RequestStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationFeeReason: 'Response time elapsed',
          otp: null,
        },
      });
    }

    if (!expiredIds.length) return;
    await prisma.request.updateMany({
      where: { id: { in: expiredIds } },
      data: {
        status: RequestStatus.EXPIRED,
        otp: null,
      },
    });
  }

  public static async expireStaleRequestsForUsers(
    senderId: number,
    receiverId: number,
  ): Promise<void> {
    const now = new Date();
    const confirmedRequests =
      (await prisma.request.findMany({
        where: {
          senderId,
          receiverId,
          status: RequestStatus.CONFIRMED,
          session: null,
        },
        select: { id: true, fromDateTime: true, timezoneOffsetMinutes: true },
      })) ?? [];
    const confirmedExpiredIds = confirmedRequests
      .filter(
        (request) =>
          confirmedOtpExpiresAt(request.fromDateTime, request.timezoneOffsetMinutes).getTime() <=
          now.getTime(),
      )
      .map((request) => request.id);

    if (confirmedExpiredIds.length)
      await prisma.request.updateMany({
        where: {
          id: { in: confirmedExpiredIds },
          status: RequestStatus.CONFIRMED,
          session: null,
        },
        data: {
          status: RequestStatus.EXPIRED,
          otp: null,
          cancellationFeeReason: 'OTP was not entered on the scheduled support date.',
        },
      });

    await prisma.request.updateMany({
      where: {
        senderId,
        receiverId,
        quickPickGroupId: { not: null },
        status: RequestStatus.PENDING,
        responseDeadlineAt: { lte: now },
      },
      data: {
        status: RequestStatus.CANCELLED,
        cancelledAt: now,
        cancellationFeeReason: 'Response time elapsed',
        otp: null,
      },
    });

    await prisma.request.updateMany({
      where: {
        senderId,
        receiverId,
        status: { in: ACTIVE_DUPLICATE_REQUEST_STATUSES },
        OR: [
          {
            status: RequestStatus.PENDING,
            quickPickGroupId: null,
            responseDeadlineAt: { lte: now },
          },
          {
            status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
            instantBooking: false,
            fromDateTime: { lte: now },
          },
        ],
      },
      data: {
        status: RequestStatus.EXPIRED,
        otp: null,
      },
    });
  }

  public static async createRequest(
    senderId: number,
    data: CreateRequestInput,
  ): Promise<MappedRequest> {
    if (senderId === data.receiverId) {
      throw new AppError('You cannot send a mate request to yourself', 400);
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequestCount = await prisma.request.count({
      where: {
        senderId,
        receiverId: data.receiverId,
        createdAt: { gte: oneHourAgo },
      },
    });
    if (recentRequestCount >= 5) {
      throw new AppError(
        'You can send up to 5 requests per hour to this supporter. Please try again later.',
        429,
      );
    }

    const receiver = await prisma.user.findUnique({
      where: { id: data.receiverId },
      include: { profile: true },
    });

    if (!receiver) {
      throw new AppError('The target companion user does not exist', 404);
    }
    const isBlocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: data.receiverId },
          { blockerId: data.receiverId, blockedId: senderId },
        ],
      },
    });
    if (isBlocked) {
      throw new AppError('Cannot send request to a blocked user or if blocked by them', 400);
    }

    await RequestService.expireStaleRequestsForUsers(senderId, data.receiverId);

    const instantBooking = Boolean(data.instantBooking);
    const timezoneOffsetMinutes = data.timezoneOffsetMinutes ?? 0;
    const selectedDay = localDayBounds(data.fromDateTime, timezoneOffsetMinutes);

    if (instantBooking && data.bookingFor !== 'someone_else') {
      const activeSupport = await prisma.request.findFirst({
        where: {
          OR: [{ senderId }, { receiverId: senderId }],
          status: RequestStatus.CONFIRMED,
          AND: [activeSessionFilter],
        },
        select: { id: true },
      });
      if (activeSupport) {
        throw new AppError(
          'Book for Someone Else while your support is confirmed or running.',
          409,
        );
      }
    }

    const existingActiveRequest = await prisma.request.findFirst({
      where: {
        senderId,
        receiverId: data.receiverId,
        AND: [
          activeSessionFilter,
          {
            OR: [
              {
                status: {
                  in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER],
                },
              },
              {
                status: RequestStatus.CONFIRMED,
                ...(!instantBooking
                  ? { fromDateTime: { gte: selectedDay.start, lt: selectedDay.end } }
                  : {}),
                OR: [{ toDateTime: null }, { toDateTime: { gt: new Date() } }],
              },
            ],
          },
        ],
      },
      select: { id: true },
    });

    if (existingActiveRequest) {
      throw new AppError('You have already sent a request to this user', 409);
    }

    if (data.bookingFor === 'someone_else') {
      const { start, end } = localDayBounds(data.fromDateTime, data.timezoneOffsetMinutes ?? 0);
      const confirmedCount = await prisma.request.count({
        where: {
          senderId,
          bookingFor: 'someone_else',
          status: RequestStatus.CONFIRMED,
          fromDateTime: { gte: start, lt: end },
        },
      });
      if (confirmedCount >= SOMEONE_ELSE_DAILY_BOOKING_LIMIT) {
        throw new AppError(SOMEONE_ELSE_BOOKING_LIMIT_MESSAGE, 409);
      }
    }

    const [senderMeetings, receiverMeetings] = await Promise.all([
      scheduledRequestsForUserOnDate(senderId, data.fromDateTime, timezoneOffsetMinutes),
      scheduledRequestsForUserOnDate(data.receiverId, data.fromDateTime, timezoneOffsetMinutes),
    ]);

    if (!instantBooking) {
      if (
        (data.bookingFor !== 'someone_else' &&
          hasMeetOnDate(senderMeetings, data.fromDateTime, timezoneOffsetMinutes)) ||
        hasMeetOnDate(receiverMeetings, data.fromDateTime, timezoneOffsetMinutes)
      ) {
        throw new AppError('This date is fully booked by a confirmed scheduled meet', 409);
      }
    } else if (
      (data.bookingFor !== 'someone_else' &&
        hasMeetOnDate(senderMeetings, data.fromDateTime, timezoneOffsetMinutes)) ||
      hasMeetOnDate(receiverMeetings, data.fromDateTime, timezoneOffsetMinutes)
    ) {
      throw new AppError('Ready Now is unavailable on a date with a scheduled meet', 409);
    }

    if (!instantBooking && isToday(data.fromDateTime, timezoneOffsetMinutes)) {
      const senderProfile = await prisma.profile.findUnique({ where: { userId: senderId } });
      if (senderProfile?.readyNowEnabled) {
        throw new AppError('Turn off Ready Now before creating a scheduled request for today', 409);
      }
      if (receiver.profile?.readyNowEnabled) {
        throw new AppError(
          'This user is Ready Now and cannot receive a scheduled request today',
          409,
        );
      }
    }

    if (!instantBooking && data.fromDateTime < minimumScheduledStart()) {
      throw new AppError('Scheduled requests must start at least 15 minutes from now', 400);
    }

    if (
      !instantBooking &&
      !requestFitsAvailability(
        receiver.profile,
        data.fromDateTime,
        data.toDateTime,
        data.timezoneOffsetMinutes,
      )
    ) {
      throw new AppError('Please choose a meeting time within this companion availability', 400);
    }

    if (instantBooking) {
      const senderProfile = await prisma.profile.findUnique({ where: { userId: senderId } });
      if (senderProfile?.readyNowEnabled) {
        throw new AppError('Turn off Ready Now before sending a Ready Now request', 409);
      }
    }

    if (instantBooking && !receiver.profile?.instantAvailable) {
      throw new AppError('This companion is not ready now', 400);
    }

    let responseDeadlineAt: Date | null = null;
    if (instantBooking) {
      const responseMinutes = data.responseTime;
      if (responseMinutes == null) {
        throw new AppError('Response time must be 5, 8, 10, 12, 15, or 20 minutes', 400);
      }
      if (!INSTANT_RESPONSE_WINDOWS_MINUTES.some((minutes) => minutes === responseMinutes)) {
        throw new AppError('Response time must be 5, 8, 10, 12, 15, or 20 minutes', 400);
      }
      responseDeadlineAt = new Date(Date.now() + responseMinutes * 60 * 1000);
    }

    const bookingFor = data.bookingFor === 'someone_else' ? 'someone_else' : 'self';
    const fixedHourlyRate = fixedHourlyRateForRequest(receiver.profile, data.categoryLabel);
    const beneficiaryData =
      bookingFor === 'someone_else'
        ? {
            beneficiaryName: normalizeOptionalText(data.beneficiaryName),
            beneficiaryPhone: normalizeOptionalText(data.beneficiaryPhone),
            beneficiaryRelation: normalizeOptionalText(data.beneficiaryRelation),
            beneficiaryNote: normalizeOptionalText(data.beneficiaryNote),
          }
        : {
            beneficiaryName: null,
            beneficiaryPhone: null,
            beneficiaryRelation: null,
            beneficiaryNote: null,
          };

    const newRequest = await prisma.request.create({
      data: {
        senderId,
        receiverId: data.receiverId,
        categoryId: data.categoryId,
        categoryLabel: data.categoryLabel,
        meetLocation: data.meetLocation,
        meetLocationLatitude: data.meetLocationLatitude ?? null,
        meetLocationLongitude: data.meetLocationLongitude ?? null,
        fromDateTime: data.fromDateTime,
        toDateTime: data.toDateTime,
        timezoneOffsetMinutes,
        instantBooking,
        responseDeadlineAt,
        message: data.message ?? '',
        bookingFor,
        ...beneficiaryData,
        readyToPayTravelCharges: data.readyToPayTravelCharges ?? false,
        readyToPayTip: data.readyToPayTip ?? false,
        extraSupportAmount: data.readyToPayTip ? (data.extraSupportAmount ?? null) : null,
        needsMateVehicle:
          (data.neededMateVehicleTypes?.length ?? 0) > 0 || (data.needsMateVehicle ?? false),
        offersRequesterVehicle:
          data.offeredRequesterVehicleType != null || (data.offersRequesterVehicle ?? false),
        neededMateVehicleTypes: data.neededMateVehicleTypes ?? [],
        offeredRequesterVehicleType: data.offeredRequesterVehicleType ?? null,
        quotedHourlyRate: fixedHourlyRate,
        status: RequestStatus.PENDING,
      },
    });
    if (newRequest.instantBooking && newRequest.responseDeadlineAt) {
      scheduleReadyNowExpiration(newRequest.responseDeadlineAt);
    }

    const result = {
      id: newRequest.id,
      direction: 'sent' as const,
      mateUserId: receiver.id,
      mateName: receiver.profile?.fullName ?? receiver.name ?? 'Anonymous',
      mateTenureId: receiver.tenureId ?? 'Not assigned',
      mateAvatar: getProfileAvatar(receiver.profile),
      categoryId: newRequest.categoryId,
      categoryLabel: newRequest.categoryLabel,
      meetLocation: newRequest.meetLocation,
      meetLocationLatitude: newRequest.meetLocationLatitude,
      meetLocationLongitude: newRequest.meetLocationLongitude,
      fromDateTime: newRequest.fromDateTime.toISOString(),
      toDateTime: newRequest.toDateTime?.toISOString() ?? null,
      ...instantRequestFields(newRequest),
      message: newRequest.message ?? '',
      ...beneficiaryFields(newRequest),
      readyToPayTravelCharges: newRequest.readyToPayTravelCharges,
      readyToPayTip: newRequest.readyToPayTip,
      extraSupportAmount: newRequest.extraSupportAmount,
      needsMateVehicle: newRequest.needsMateVehicle,
      offersRequesterVehicle: newRequest.offersRequesterVehicle,
      neededMateVehicleTypes: newRequest.neededMateVehicleTypes,
      offeredRequesterVehicleType: newRequest.offeredRequesterVehicleType,
      requestHourlyRate: newRequest.quotedHourlyRate,
      ...profileFields(receiver),
      status: 'pending' as const,
      sentAt: formatSentAt(newRequest.createdAt),
      otp: null,
      requesterGender: null,
      ...cancellationFields(newRequest),
      ...cancellationPreviewFields(newRequest),
      quickChatSuggestions: [],
    };

    try {
      const sender = await prisma.user.findUnique({
        where: { id: senderId },
        include: { profile: true },
      });
      const senderName = sender?.profile?.fullName ?? sender?.name ?? 'Someone';

      await NotificationService.createNotification(
        data.receiverId,
        'new_request',
        `${senderName} sent you a new booking request.`,
        senderId,
      );
    } catch (notifErr: any) {
      console.error('Failed to create new request notification:', notifErr.message);
    }

    sendGlobalToUser(data.receiverId, {
      event: 'request_created',
      requestId: newRequest.id,
    });

    return result;
  }

  public static async listUserRequests(
    userId: number,
  ): Promise<{ sent: MappedRequest[]; received: MappedRequest[] }> {
    const [sentRequests, receivedRequests] = await Promise.all([
      prisma.request.findMany({
        where: { senderId: userId },
        include: {
          sender: {
            include: { profile: true },
          },
          receiver: {
            include: { profile: true },
          },
          session: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.request.findMany({
        where: { receiverId: userId },
        include: {
          receiver: {
            include: { profile: true },
          },
          sender: {
            include: { profile: true },
          },
          session: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const completedRequestIds = [...sentRequests, ...receivedRequests]
      .filter((request) => request.session?.endedAt != null)
      .map((request) => request.id);
    const submittedReports =
      completedRequestIds.length === 0
        ? []
        : await prisma.report.findMany({
            where: { reporterId: userId, requestId: { in: completedRequestIds } },
            select: { requestId: true },
          });
    const reportedRequestIds = new Set(
      submittedReports.flatMap((report) => (report.requestId == null ? [] : [report.requestId])),
    );

    await RequestService.persistExpiredRequests([...sentRequests, ...receivedRequests]);

    const sent = sentRequests.map(
      (req): MappedRequest => ({
        id: req.id,
        direction: 'sent',
        mateUserId: req.receiver.id,
        mateName: req.receiver.profile?.fullName ?? req.receiver.name ?? 'Anonymous',
        mateTenureId: req.receiver.tenureId ?? 'Not assigned',
        mateAvatar: getProfileAvatar(req.receiver.profile),
        categoryId: req.categoryId,
        categoryLabel: req.categoryLabel,
        meetLocation: req.meetLocation,
        meetLocationLatitude: req.meetLocationLatitude,
        meetLocationLongitude: req.meetLocationLongitude,
        fromDateTime: req.fromDateTime.toISOString(),
        toDateTime: req.toDateTime?.toISOString() ?? null,
        ...instantRequestFields(req),
        quickPickGroupId: req.quickPickGroupId,
        message: req.message ?? '',
        ...beneficiaryFields(req),
        readyToPayTravelCharges: req.readyToPayTravelCharges,
        readyToPayTip: req.readyToPayTip,
        extraSupportAmount: req.extraSupportAmount,
        needsMateVehicle: req.needsMateVehicle,
        offersRequesterVehicle: req.offersRequesterVehicle,
        neededMateVehicleTypes: req.neededMateVehicleTypes,
        offeredRequesterVehicleType: req.offeredRequesterVehicleType,
        requestHourlyRate: req.quotedHourlyRate,
        ...profileFields(req.receiver),
        status: mapRequestStatusWithSession(effectiveRequestStatus(req), req.session),
        sentAt: formatSentAt(req.createdAt),
        ...requestHistoryFields(req, userId, reportedRequestIds),
        sessionStatus: mapSessionStatus(req.session),
        sessionEndedAt: req.session?.endedAt?.toISOString() ?? null,
        sessionElapsedSec: req.session?.totalElapsedSeconds ?? null,
        // The request sender (beneficiary) owns and shares the OTP.
        otp: req.otp,
        requesterGender: null,
        ...cancellationFields(req),
        ...cancellationPreviewFields({ ...req, status: effectiveRequestStatus(req) }),
        quickChatSuggestions: quickChatSuggestions(req),
      }),
    );

    const received = receivedRequests.map(
      (req): MappedRequest => ({
        id: req.id,
        direction: 'received',
        mateUserId: req.sender.id,
        mateName: req.sender.profile?.fullName ?? req.sender.name ?? 'Anonymous',
        mateTenureId: req.sender.tenureId ?? 'Not assigned',
        mateAvatar: getProfileAvatar(req.sender.profile),
        categoryId: req.categoryId,
        categoryLabel: req.categoryLabel,
        meetLocation: req.meetLocation,
        meetLocationLatitude: req.meetLocationLatitude,
        meetLocationLongitude: req.meetLocationLongitude,
        fromDateTime: req.fromDateTime.toISOString(),
        toDateTime: req.toDateTime?.toISOString() ?? null,
        ...instantRequestFields(req),
        quickPickGroupId: req.quickPickGroupId,
        message: req.message ?? '',
        ...beneficiaryFields(req),
        readyToPayTravelCharges: req.readyToPayTravelCharges,
        readyToPayTip: req.readyToPayTip,
        extraSupportAmount: req.extraSupportAmount,
        needsMateVehicle: req.needsMateVehicle,
        offersRequesterVehicle: req.offersRequesterVehicle,
        neededMateVehicleTypes: req.neededMateVehicleTypes,
        offeredRequesterVehicleType: req.offeredRequesterVehicleType,
        requestHourlyRate: req.quotedHourlyRate,
        ...profileFields(req.sender),
        status: mapRequestStatusWithSession(effectiveRequestStatus(req), req.session),
        sentAt: formatSentAt(req.createdAt),
        ...requestHistoryFields(req, userId, reportedRequestIds),
        sessionStatus: mapSessionStatus(req.session),
        sessionEndedAt: req.session?.endedAt?.toISOString() ?? null,
        sessionElapsedSec: req.session?.totalElapsedSeconds ?? null,
        // The supporter must never receive the OTP through the API; they
        // receive only the prompt to enter the code shared by the sender.
        otp: null,
        requesterGender: req.sender.profile?.gender ?? null,
        ...cancellationFields(req),
        ...cancellationPreviewFields({ ...req, status: effectiveRequestStatus(req) }),
        quickChatSuggestions: quickChatSuggestions(req),
      }),
    );

    return { sent, received };
  }

  public static async updateRequestStatus(
    userId: number,
    requestId: number,
    status: 'confirmed' | 'declined' | 'cancelled',
    cancellationReason?: string | null,
    hourlyRate?: number | null,
  ): Promise<MappedRequest> {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      include: {
        receiver: { include: { profile: true } },
        session: true,
      },
    });

    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (shouldExpireRequest(request)) {
      await prisma.request.update({
        where: { id: requestId },
        data:
          request.quickPickGroupId && request.status === RequestStatus.PENDING
            ? {
                status: RequestStatus.CANCELLED,
                cancelledAt: new Date(),
                cancellationFeeReason: 'Response time elapsed',
                otp: null,
              }
            : { status: RequestStatus.EXPIRED, otp: null },
      });
      if (request.status === RequestStatus.CONFIRMED) {
        await restoreReadyNow([request.senderId, request.receiverId]);
      }
      throw new AppError('This request has expired', 400);
    }

    if (status === 'cancelled') {
      if (request.senderId !== userId && request.receiverId !== userId) {
        throw new AppError('You are not authorized to cancel this request', 403);
      }
      if (
        request.status !== RequestStatus.PENDING &&
        request.status !== RequestStatus.ACCEPTED_BY_RECEIVER &&
        request.status !== RequestStatus.CONFIRMED
      ) {
        throw new AppError('Only active requests can be cancelled', 400);
      }
      if (request.session) {
        throw new AppError('This meet has already started. End the session instead.', 400);
      }
      if (request.status === RequestStatus.CONFIRMED && !cancellationReason?.trim()) {
        throw new AppError('A cancellation reason is required for a confirmed meet', 400);
      }
      if (
        request.status === RequestStatus.CONFIRMED &&
        !request.instantBooking &&
        request.fromDateTime <= new Date()
      ) {
        throw new AppError('A confirmed support cannot be cancelled after its scheduled time', 400);
      }
    } else {
      if (status === 'declined') {
        const receiverDecliningPending =
          request.receiverId === userId && request.status === RequestStatus.PENDING;
        const senderRejectingQuote =
          request.senderId === userId && request.status === RequestStatus.ACCEPTED_BY_RECEIVER;
        if (!receiverDecliningPending && !senderRejectingQuote) {
          throw new AppError('You are not authorized to decline this request', 403);
        }
      } else if (status === 'confirmed') {
        if (request.status === RequestStatus.PENDING) {
          if (request.receiverId !== userId) {
            throw new AppError('You are not authorized to accept this request', 403);
          }
          if (!request.instantBooking) {
            const timezoneOffsetMinutes = request.timezoneOffsetMinutes ?? 0;
            const [senderMeetings, receiverMeetings] = await Promise.all([
              scheduledRequestsForUserOnDate(
                request.senderId,
                request.fromDateTime,
                timezoneOffsetMinutes,
                request.id,
              ),
              scheduledRequestsForUserOnDate(
                request.receiverId,
                request.fromDateTime,
                timezoneOffsetMinutes,
                request.id,
              ),
            ]);
            if (
              (request.bookingFor !== 'someone_else' &&
                hasMeetOnDate(senderMeetings, request.fromDateTime, timezoneOffsetMinutes)) ||
              hasMeetOnDate(receiverMeetings, request.fromDateTime, timezoneOffsetMinutes)
            ) {
              throw new AppError('This date is fully booked by a confirmed scheduled meet', 409);
            }
          }
          if (
            request.quotedHourlyRate == null &&
            (hourlyRate == null || !Number.isFinite(hourlyRate) || hourlyRate <= 0)
          ) {
            throw new AppError('Enter a valid hourly rate before accepting', 400);
          }
        } else if (request.status === RequestStatus.ACCEPTED_BY_RECEIVER) {
          if (request.senderId !== userId) {
            throw new AppError('Only the requester can give final confirmation', 403);
          }
          if (request.quotedHourlyRate == null || request.quotedHourlyRate <= 0) {
            throw new AppError('This request does not have a valid support quote', 400);
          }
        } else {
          throw new AppError('This request cannot be confirmed right now', 400);
        }
      }
    }

    const senderConfirmingQuote =
      status === 'confirmed' &&
      request.status === RequestStatus.ACCEPTED_BY_RECEIVER &&
      request.senderId === userId;
    // Receiver acceptance is always the first confirmation, including when
    // the support rate was already known. Only the original requester can
    // move an accepted request to the final CONFIRMED state.
    const finalConfirmation = senderConfirmingQuote;
    const otpProximity = finalConfirmation ? otpProximityForRequest(request) : null;
    const otpVal =
      finalConfirmation && otpProximity?.ready ? String(randomInt(1000, 10_000)) : null;
    const nextStatus =
      status === 'confirmed'
        ? finalConfirmation
          ? RequestStatus.CONFIRMED
          : RequestStatus.ACCEPTED_BY_RECEIVER
        : mapStatusToBackend(status);

    const now = new Date();
    const normalizedCancellationReason = cancellationReason?.trim() || null;

    const updateData = {
      status: nextStatus,
      otp: otpVal,
      ...(status === 'confirmed' &&
      request.status === RequestStatus.PENDING &&
      request.quotedHourlyRate == null
        ? { quotedHourlyRate: hourlyRate }
        : {}),
      ...(status === 'cancelled' || status === 'declined'
        ? {
            cancelledAt: now,
            cancelledById: userId,
            cancellationFee: 0,
            cancellationFeeReason: normalizedCancellationReason,
          }
        : {}),
    };
    const updateInclude = {
      sender: { include: { profile: true } },
      receiver: { include: { profile: true } },
    } as const;

    let autoCancelledNormalRequests: Array<{ id: number; receiverId: number }> = [];
    const updatedRequest =
      status === 'confirmed' && request.status === RequestStatus.PENDING && request.quickPickGroupId
        ? await prisma.$transaction(async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(${request.senderId})::text AS lock_result`,
            );
            const current = await tx.request.findUnique({
              where: { id: requestId },
              select: { status: true, responseDeadlineAt: true },
            });
            if (
              current?.status !== RequestStatus.PENDING ||
              !current.responseDeadlineAt ||
              current.responseDeadlineAt <= new Date()
            ) {
              throw new AppError('This Quick Pick request is no longer available', 409);
            }
            const groupWinner = await tx.request.findFirst({
              where: {
                quickPickGroupId: request.quickPickGroupId,
                status: { in: [RequestStatus.ACCEPTED_BY_RECEIVER, RequestStatus.CONFIRMED] },
              },
              select: { id: true },
            });
            if (groupWinner) throw new AppError('Another supporter accepted this Quick Pick', 409);
            const winner = await tx.request.update({
              where: { id: requestId },
              data: updateData,
              include: updateInclude,
            });
            await tx.request.updateMany({
              where: {
                quickPickGroupId: request.quickPickGroupId,
                id: { not: requestId },
                status: RequestStatus.PENDING,
              },
              data: { status: RequestStatus.EXPIRED, otp: null },
            });
            autoCancelledNormalRequests = await cancelOutgoingNormalRequests(
              tx,
              request.senderId,
              requestId,
              now,
            );
            return winner;
          })
        : finalConfirmation
          ? await prisma.$transaction(
              async (tx) => {
                for (const participantId of [request.senderId, request.receiverId].sort(
                  (left, right) => left - right,
                )) {
                  await tx.$queryRaw(
                    Prisma.sql`SELECT pg_advisory_xact_lock(${participantId})::text AS lock_result`,
                  );
                }

                const current = await tx.request.findUnique({
                  where: { id: requestId },
                  select: { status: true },
                });
                if (current?.status !== RequestStatus.ACCEPTED_BY_RECEIVER) {
                  throw new AppError('Another request was confirmed first', 409);
                }

                const timezoneOffsetMinutes = request.timezoneOffsetMinutes ?? 0;
                const { start, end } = localDayBounds(request.fromDateTime, timezoneOffsetMinutes);
                if (request.bookingFor === 'someone_else') {
                  const confirmedCount = await tx.request.count({
                    where: {
                      senderId: request.senderId,
                      bookingFor: 'someone_else',
                      status: RequestStatus.CONFIRMED,
                      fromDateTime: { gte: start, lt: end },
                    },
                  });
                  if (confirmedCount >= SOMEONE_ELSE_DAILY_BOOKING_LIMIT) {
                    throw new AppError(SOMEONE_ELSE_BOOKING_LIMIT_MESSAGE, 409);
                  }
                } else if (request.instantBooking) {
                  const activeSupport = await tx.request.findFirst({
                    where: {
                      id: { not: requestId },
                      OR: [{ senderId: request.senderId }, { receiverId: request.senderId }],
                      status: RequestStatus.CONFIRMED,
                      AND: [activeSessionFilter],
                    },
                    select: { id: true },
                  });
                  if (activeSupport) {
                    throw new AppError(
                      'Book for Someone Else while your support is confirmed or running.',
                      409,
                    );
                  }
                }
                const conflictingMeeting = await tx.request.findFirst({
                  where: {
                    id: { not: requestId },
                    status: RequestStatus.CONFIRMED,
                    fromDateTime: { gte: start, lt: end },
                    OR: [
                      { senderId: request.receiverId },
                      { receiverId: request.receiverId },
                      ...(request.bookingFor === 'someone_else'
                        ? []
                        : [{ senderId: request.senderId }, { receiverId: request.senderId }]),
                    ],
                    AND: [
                      activeSessionFilter,
                      {
                        OR: [{ toDateTime: null }, { toDateTime: { gt: now } }],
                      },
                    ],
                  },
                  select: { id: true },
                });
                if (conflictingMeeting) {
                  throw new AppError('Another request was confirmed first', 409);
                }

                const winner = await tx.request.update({
                  where: { id: requestId },
                  data: updateData,
                  include: updateInclude,
                });
                if (request.quickPickGroupId) {
                  autoCancelledNormalRequests = await cancelOutgoingNormalRequests(
                    tx,
                    request.senderId,
                    requestId,
                    now,
                  );
                }
                const sameDateAlternatives = {
                  id: { not: requestId },
                  fromDateTime: { gte: start, lt: end },
                  session: null,
                } as const;

                await tx.request.updateMany({
                  where: {
                    ...sameDateAlternatives,
                    OR:
                      request.bookingFor === 'someone_else'
                        ? [
                            {
                              senderId: request.receiverId,
                              receiverId: request.senderId,
                            },
                          ]
                        : [
                            { senderId: request.senderId },
                            {
                              senderId: request.receiverId,
                              receiverId: request.senderId,
                            },
                          ],
                    status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
                  },
                  data: {
                    status: RequestStatus.CANCELLED,
                    otp: null,
                    cancelledAt: now,
                    cancellationFeeReason: 'Auto Cancelled',
                  },
                });
                await tx.request.updateMany({
                  where: {
                    ...sameDateAlternatives,
                    receiverId: request.receiverId,
                    senderId: { not: request.senderId },
                    status: RequestStatus.ACCEPTED_BY_RECEIVER,
                  },
                  data: {
                    status: RequestStatus.CANCELLED,
                    otp: null,
                    cancelledAt: now,
                    cancellationFeeReason: 'Late Response',
                  },
                });
                await tx.request.updateMany({
                  where: {
                    ...sameDateAlternatives,
                    receiverId: request.receiverId,
                    senderId: { not: request.senderId },
                    status: RequestStatus.PENDING,
                  },
                  data: {
                    status: RequestStatus.CANCELLED,
                    otp: null,
                    cancelledAt: now,
                    cancellationFeeReason: 'Auto Cancelled',
                  },
                });
                return winner;
              },
              { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
            )
          : await prisma.request.update({
              where: { id: requestId },
              data: updateData,
              include: updateInclude,
            });

    if (autoCancelledNormalRequests.length) {
      sendGlobalToUser(request.senderId, { event: 'request_auto_cancelled' });
      for (const receiverId of new Set(
        autoCancelledNormalRequests.map((item) => item.receiverId),
      )) {
        sendGlobalToUser(receiverId, { event: 'request_auto_cancelled' });
      }
      for (const cancelled of autoCancelledNormalRequests) {
        for (const participantId of [request.senderId, cancelled.receiverId]) {
          sendToUserForRequest(participantId, cancelled.id, {
            event: 'request_auto_cancelled',
            requestId: cancelled.id,
            status: 'cancelled',
          });
        }
        void NotificationService.createNotification(
          cancelled.receiverId,
          'meet_canceled',
          'This request was automatically cancelled because another support request was confirmed.',
        ).catch((error) => console.error('Auto-cancel notification failed:', error));
      }
    }

    if (
      request.quickPickGroupId &&
      status === 'confirmed' &&
      request.status === RequestStatus.PENDING
    ) {
      const alternatives = await prisma.request.findMany({
        where: { quickPickGroupId: request.quickPickGroupId, id: { not: requestId } },
        select: { id: true, receiverId: true },
      });
      for (const alternative of alternatives) {
        sendGlobalToUser(alternative.receiverId, {
          event: 'request_updated',
          requestId: alternative.id,
        });
      }
    }

    if (finalConfirmation && updatedRequest.instantBooking) {
      await suspendReadyNow([updatedRequest.senderId, updatedRequest.receiverId]);
    } else if (status === 'cancelled' && request.status === RequestStatus.CONFIRMED) {
      await restoreReadyNow([updatedRequest.senderId, updatedRequest.receiverId]);
    }
    if (
      finalConfirmation ||
      (status === 'cancelled' && request.status === RequestStatus.CONFIRMED)
    ) {
      sendGlobalToAll({
        event: 'busy_now_changed',
        userIds: [updatedRequest.senderId, updatedRequest.receiverId],
        busyNow: finalConfirmation,
      });
    }
    if (finalConfirmation) {
      // Confirmation can cancel several same-date alternatives inside the
      // transaction. A global invalidation ensures every affected account
      // refreshes even when it is not a participant in the winning request.
      sendGlobalToAll({
        event: 'request_auto_cancelled',
        confirmedRequestId: updatedRequest.id,
      });
    }
    if (finalConfirmation) {
      scheduleConfirmedOtpExpiry(updatedRequest.fromDateTime, updatedRequest.timezoneOffsetMinutes);
      if (!updatedRequest.instantBooking) {
        scheduleScheduledSessionReminder(updatedRequest.fromDateTime);
      }
    }

    const isSender = updatedRequest.senderId === userId;
    const partner = isSender ? updatedRequest.receiver : updatedRequest.sender;

    const senderName =
      updatedRequest.sender.profile?.fullName ?? updatedRequest.sender.name ?? 'Anonymous';
    const receiverName =
      updatedRequest.receiver.profile?.fullName ?? updatedRequest.receiver.name ?? 'Anonymous';

    // Create notifications based on request actions
    if (status === 'confirmed' && nextStatus === RequestStatus.ACCEPTED_BY_RECEIVER) {
      await NotificationService.createNotification(
        updatedRequest.senderId,
        'request_accepted',
        `${receiverName} accepted your ${updatedRequest.categoryLabel} request at Rs ${updatedRequest.quotedHourlyRate}/hr. Please confirm or reject it.`,
        updatedRequest.receiverId,
      );
    } else if (status === 'confirmed') {
      await NotificationService.createNotification(
        updatedRequest.receiverId,
        'request_accepted',
        otpVal
          ? `${senderName} confirmed the request. OTP is ready.`
          : `${senderName} confirmed the request. OTP will appear when both of you are within 20 m.`,
        updatedRequest.senderId,
      );
    } else if (status === 'cancelled') {
      const reasonText = normalizedCancellationReason
        ? `. Reason: ${normalizedCancellationReason}`
        : '';
      const cancelledBySender = userId === updatedRequest.senderId;
      await NotificationService.createNotification(
        cancelledBySender ? updatedRequest.receiverId : updatedRequest.senderId,
        'meet_canceled',
        `${cancelledBySender ? senderName : receiverName} cancelled your meet${reasonText}`,
        userId,
      );
    } else if (status === 'declined') {
      const senderRejectedQuote = userId === updatedRequest.senderId;
      await NotificationService.createNotification(
        senderRejectedQuote ? updatedRequest.receiverId : updatedRequest.senderId,
        'meet_canceled',
        senderRejectedQuote
          ? `${senderName} rejected your Rs ${updatedRequest.quotedHourlyRate}/hr quote`
          : `${receiverName} declined your request`,
        userId,
      );
    }

    const result = {
      id: updatedRequest.id,
      direction: (isSender ? 'sent' : 'received') as 'sent' | 'received',
      mateUserId: partner.id,
      mateName: partner.profile?.fullName ?? partner.name ?? 'Anonymous',
      mateTenureId: partner.tenureId ?? 'Not assigned',
      mateAvatar: getProfileAvatar(partner.profile),
      categoryId: updatedRequest.categoryId,
      categoryLabel: updatedRequest.categoryLabel,
      meetLocation: updatedRequest.meetLocation,
      meetLocationLatitude: updatedRequest.meetLocationLatitude,
      meetLocationLongitude: updatedRequest.meetLocationLongitude,
      fromDateTime: updatedRequest.fromDateTime.toISOString(),
      toDateTime: updatedRequest.toDateTime?.toISOString() ?? null,
      ...instantRequestFields(updatedRequest),
      message: updatedRequest.message ?? '',
      ...beneficiaryFields(updatedRequest),
      readyToPayTravelCharges: updatedRequest.readyToPayTravelCharges,
      readyToPayTip: updatedRequest.readyToPayTip,
      extraSupportAmount: updatedRequest.extraSupportAmount,
      needsMateVehicle: updatedRequest.needsMateVehicle,
      offersRequesterVehicle: updatedRequest.offersRequesterVehicle,
      neededMateVehicleTypes: updatedRequest.neededMateVehicleTypes,
      offeredRequesterVehicleType: updatedRequest.offeredRequesterVehicleType,
      requestHourlyRate: updatedRequest.quotedHourlyRate,
      ...profileFields(partner),
      status: mapStatusToFrontend(updatedRequest.status),
      sentAt: formatSentAt(updatedRequest.createdAt),
      // The request sender is the beneficiary and is the sole holder of the
      // OTP. The receiver/supporter enters it to start the session.
      otp: isSender ? updatedRequest.otp : null,
      ...(otpProximity != null
        ? {
            otpProximityReady: otpProximity.ready,
            otpDistanceMeters: otpProximity.distanceMeters,
            otpProximityMessage: otpProximity.message,
          }
        : {}),
      requesterGender: updatedRequest.sender.profile?.gender ?? null,
      ...cancellationFields(updatedRequest),
      ...cancellationPreviewFields(updatedRequest),
      quickChatSuggestions: quickChatSuggestions(updatedRequest),
    };

    const partnerRequest = {
      ...result,
      direction: (isSender ? 'received' : 'sent') as 'sent' | 'received',
      mateUserId: userId,
      mateName: isSender ? senderName : receiverName,
      mateTenureId:
        (isSender ? updatedRequest.sender.tenureId : updatedRequest.receiver.tenureId) ??
        'Not assigned',
      mateAvatar: getProfileAvatar(
        isSender ? updatedRequest.sender.profile : updatedRequest.receiver.profile,
      ),
      otp: partner.id === updatedRequest.senderId ? updatedRequest.otp : null,
      requesterGender: updatedRequest.sender.profile?.gender ?? null,
    };

    sendGlobalToUser(partner.id, {
      event: 'request_updated',
      requestId: updatedRequest.id,
      request: partnerRequest,
    });

    sendToUserForRequest(partner.id, updatedRequest.id, {
      event: 'request_updated',
      requestId: updatedRequest.id,
      request: partnerRequest,
    });

    sendToUserForRequest(userId, updatedRequest.id, {
      event: 'request_updated',
      requestId: updatedRequest.id,
      request: result,
    });

    if (status === 'cancelled' || status === 'declined') {
      sendToUserForRequest(partner.id, updatedRequest.id, {
        event: 'request_cancelled',
        requestId: updatedRequest.id,
        request: partnerRequest,
      });
      sendToUserForRequest(userId, updatedRequest.id, {
        event: 'request_cancelled',
        requestId: updatedRequest.id,
        request: result,
      });
    }

    return result;
  }

  public static async getRequestMessages(
    userId: number,
    requestId: number,
    pagination: { limit?: number; before?: string } = {},
  ) {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (request.senderId !== userId && request.receiverId !== userId) {
      throw new AppError('You are not authorized to view messages for this request', 403);
    }

    if (request.status !== RequestStatus.CONFIRMED) {
      throw new AppError('Chat is available after both users confirm the request', 403);
    }

    const session = await prisma.session.findUnique({
      where: { requestId },
      select: { status: true },
    });
    if (session?.status === SessionStatus.ENDED) {
      // Self-heal records created by older deployments and never expose ended
      // meeting chat history again.
      await prisma.message.deleteMany({ where: { requestId } });
      return [];
    }

    await deleteExpiredMessages();
    const limit = Math.min(Math.max(pagination.limit ?? 30, 1), 100);
    const before = pagination.before ? new Date(pagination.before) : null;
    if (before && Number.isNaN(before.getTime())) {
      throw new AppError('Invalid message pagination cursor', 400);
    }
    const messages = await prisma.message.findMany({
      where: {
        requestId,
        expiresAt: { gt: new Date() },
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return messages.reverse().map((msg) => ({
      id: msg.clientMessageId,
      sender: msg.senderId === userId ? 'me' : 'them',
      type: msg.type,
      text: msg.isDeleted
        ? 'This message was deleted'
        : msg.type === 'text' || msg.type === 'system'
          ? msg.content
          : undefined,
      imageUri: msg.type === 'image' ? (msg.mediaUrl ?? msg.content) : undefined,
      voiceUri: msg.type === 'voice' ? (msg.mediaUrl ?? msg.content) : undefined,
      voiceDurationSec: msg.voiceDuration ?? undefined,
      viewOnce: msg.viewOnce,
      expiresAt: msg.expiresAt.getTime(),
      createdAt: msg.createdAt.getTime(),
      isDeleted: msg.isDeleted,
    }));
  }

  public static async deleteRequestMessage(
    userId: number,
    requestId: number,
    messageId: string,
  ): Promise<void> {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (request.senderId !== userId && request.receiverId !== userId) {
      throw new AppError('You are not authorized to delete messages for this request', 403);
    }

    await RealtimeMessageService.handleDeleteForEveryone(userId, {
      event: 'delete_for_everyone',
      messageId,
      chatRoomId: String(requestId),
    });
  }
}
