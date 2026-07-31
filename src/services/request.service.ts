import { prisma } from '../config/database';
import { AppError } from '../utils/app-error';
import { Profile, RequestStatus, SessionStatus } from '@prisma/client';
import { NotificationService } from './notification.service';
import { sendToUserForRequest, sendGlobalToUser } from './websocket.service';
import { getCategoryMatchVariants } from '../constants/mate-categories';

export type CreateRequestInput = {
  receiverId: number;
  categoryId: string;
  categoryLabel: string;
  meetLocation: string;
  meetLocationLatitude?: number | null;
  meetLocationLongitude?: number | null;
  fromDateTime: Date;
  toDateTime?: Date | null;
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
};

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
  responseDeadlineAt: string | null;
  message: string;
  bookingFor: 'self' | 'someone_else';
  beneficiaryName?: string | null;
  beneficiaryPhone?: string | null;
  beneficiaryRelation?: string | null;
  beneficiaryNote?: string | null;
  readyToPayTravelCharges: boolean;
  readyToPayTip: boolean;
  requestHourlyRate: number;
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
  sessionStatus?: string | null;
  sessionEndedAt?: string | null;
  otp?: string | null;
  requesterGender?: string | null;
  cancellationFee: number;
  cancellationFeeReason?: string | null;
  cancelledAt?: string | null;
  cancelledById?: number | null;
  cancellationFeeApplies: boolean;
  cancellationFeePreview: number;
};

const LATE_CANCELLATION_WINDOW_MS = 60 * 60 * 1000;
const SCHEDULED_REQUEST_LEAD_TIME_MS = 15 * 60 * 1000;
const LATE_CANCELLATION_REASON = 'Cancelled within 1 hour of the scheduled start time';
export const CONFIRMED_REQUEST_EXPIRY_WINDOW_MS = 12 * 60 * 60 * 1000;
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
const INSTANT_RESPONSE_WINDOWS_MINUTES = [10, 20, 30] as const;

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
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  toDateTime?: Date | null;
  responseDeadlineAt?: Date | null;
  instantBooking?: boolean | null;
  session?: unknown | null;
}): boolean => {
  const isInstantBooking = Boolean(request.instantBooking);
  const startsAt = request.fromDateTime?.getTime() ?? Number.POSITIVE_INFINITY;
  const responseTimedOut = Boolean(
    (request.status === RequestStatus.PENDING ||
      request.status === RequestStatus.ACCEPTED_BY_RECEIVER) &&
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
      startsAt + CONFIRMED_REQUEST_EXPIRY_WINDOW_MS <= Date.now() &&
      !request.session,
  );

  return (
    isExpirableStatus(request.status) &&
    (responseTimedOut || meetStartedWithoutRequiredConfirmation || confirmedMeetExpiredWithoutSession)
  );
};

const effectiveRequestStatus = (request: {
  status: RequestStatus;
  fromDateTime?: Date | null;
  toDateTime?: Date | null;
  responseDeadlineAt?: Date | null;
  instantBooking?: boolean | null;
  session?: unknown | null;
}): RequestStatus => {
  return shouldExpireRequest(request) ? RequestStatus.EXPIRED : request.status;
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
    case SessionStatus.ENDED:
      return 'ended';
  }
};

const getProfileAvatar = (
  profile?: { profilePhoto?: string | null; gallery?: string[] | null } | null,
): string => {
  const profilePhoto = profile?.profilePhoto?.trim();
  if (profilePhoto) {
    return profilePhoto;
  }
  return profile?.gallery?.find((uri) => uri.trim()) ?? '';
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

const hourlyRateForRequest = (
  profile: Profile | null | undefined,
  categoryLabel?: string | null,
): number => {
  if (!profile) {
    return 50;
  }

  const requestedCategory = categoryLabel?.trim().toLowerCase();
  if (requestedCategory) {
    const variants = new Set([
      requestedCategory,
      ...getCategoryMatchVariants(categoryLabel ?? '').map((value) => value.toLowerCase()),
    ]);
    const matched = Object.entries(categoryRatesRecord(profile.categoryRates)).find(([category]) =>
      variants.has(category.trim().toLowerCase()),
    );
    if (matched) {
      return matched[1];
    }
  }

  return profile.hourlyRate ?? 50;
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

const ageFromDob = (dob: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};

const profileFields = (
  user: {
    phone?: string | null;
    email?: string | null;
    profile?: Profile | null;
  },
) => {
  const profile = user.profile;
  const gallery = profile?.gallery ?? [];
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
    mateGalleryPhotos: gallery,
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
  cancellationFee: request.cancellationFee,
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

const cancellationPreviewFields = (
  request: {
    status: RequestStatus;
    fromDateTime: Date;
    categoryLabel: string;
  },
  receiverProfile: Profile | null | undefined,
) => {
  const now = Date.now();
  const startsAt = request.fromDateTime.getTime();
  const applies =
    request.status === RequestStatus.CONFIRMED &&
    now >= startsAt - LATE_CANCELLATION_WINDOW_MS &&
    now < startsAt;

  return {
    cancellationFeeApplies: applies,
    cancellationFeePreview: applies
      ? hourlyRateForRequest(receiverProfile, request.categoryLabel)
      : 0,
  };
};

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

const minutesInDay = (date: Date): number => date.getHours() * 60 + date.getMinutes();

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
  profile: Pick<Profile, 'availableDays' | 'availableTimeRange'> | null | undefined,
  from: Date,
  to?: Date | null,
): boolean => {
  if (!profile) {
    return true;
  }

  const days = (profile.availableDays ?? []).map(normalizeDayKey).filter(Boolean);
  const range = parseAvailabilityRange(profile.availableTimeRange);
  if (!days.length && !range) {
    return true;
  }

  const effectiveTo = to ?? from;

  if (from.toDateString() !== effectiveTo.toDateString()) {
    return false;
  }

  if (days.length && !days.includes(DAY_KEYS[from.getDay()])) {
    return false;
  }

  if (!range) {
    return true;
  }

  const start = minutesInDay(from);
  const end = minutesInDay(effectiveTo);

  if (range.end > range.start) {
    return start >= range.start && end <= range.end;
  }

  return start >= range.start || end <= range.end;
};

export class RequestService {
  private static async persistExpiredRequests(
    requests: Array<{
      id: number;
      status: RequestStatus;
      fromDateTime?: Date | null;
      toDateTime?: Date | null;
      responseDeadlineAt?: Date | null;
      instantBooking?: boolean | null;
      session?: unknown | null;
    }>,
  ): Promise<void> {
    const expiredIds = requests.filter(shouldExpireRequest).map((request) => request.id);

    if (!expiredIds.length) {
      return;
    }

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
    const confirmedExpiryCutoff = new Date(now.getTime() - CONFIRMED_REQUEST_EXPIRY_WINDOW_MS);

    await prisma.request.updateMany({
      where: {
        senderId,
        receiverId,
        status: { in: ACTIVE_DUPLICATE_REQUEST_STATUSES },
        OR: [
          {
            status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
            responseDeadlineAt: { lte: now },
          },
          {
            status: { in: [RequestStatus.PENDING, RequestStatus.ACCEPTED_BY_RECEIVER] },
            instantBooking: false,
            fromDateTime: { lte: now },
          },
          {
            status: RequestStatus.CONFIRMED,
            fromDateTime: { lte: confirmedExpiryCutoff },
            session: null,
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

    const receiver = await prisma.user.findUnique({
      where: { id: data.receiverId },
      include: { profile: true },
    });

    if (!receiver) {
      throw new AppError('The target companion user does not exist', 404);
    }
    if (
      receiver.profile?.isMinor ||
      (receiver.profile?.dob && ageFromDob(receiver.profile.dob) < 18)
    ) {
      throw new AppError('Users under 18 cannot provide support or receive support requests.', 403);
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

    const existingActiveRequest = await prisma.request.findFirst({
      where: {
        senderId,
        receiverId: data.receiverId,
        status: { in: ACTIVE_DUPLICATE_REQUEST_STATUSES },
        OR: [
          { session: null },
          { session: { is: { status: { not: SessionStatus.ENDED } } } },
        ],
      },
      select: { id: true },
    });

    if (existingActiveRequest) {
      throw new AppError('You have already sent a request to this user', 409);
    }

    const instantBooking = Boolean(data.instantBooking);

    if (!instantBooking && data.fromDateTime < minimumScheduledStart()) {
      throw new AppError(
        'Scheduled requests must start at least 15 minutes from now',
        400,
      );
    }

    if (
      !instantBooking &&
      !requestFitsAvailability(receiver.profile, data.fromDateTime, data.toDateTime)
    ) {
      throw new AppError('Please choose a meeting time within this companion availability', 400);
    }

    if (instantBooking && !receiver.profile?.instantAvailable) {
      throw new AppError('This companion is not ready now', 400);
    }

    let responseDeadlineAt: Date | null = null;
    if (instantBooking) {
      const responseMinutes = data.responseTime;
      if (responseMinutes == null) {
        throw new AppError('Response time must be 10, 20, or 30 minutes', 400);
      }
      if (!INSTANT_RESPONSE_WINDOWS_MINUTES.some((minutes) => minutes === responseMinutes)) {
        throw new AppError('Response time must be 10, 20, or 30 minutes', 400);
      }
      responseDeadlineAt = new Date(Date.now() + responseMinutes * 60 * 1000);
    }

    const bookingFor = data.bookingFor === 'someone_else' ? 'someone_else' : 'self';
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
        instantBooking,
        responseDeadlineAt,
        message: data.message ?? '',
        bookingFor,
        ...beneficiaryData,
        readyToPayTravelCharges: data.readyToPayTravelCharges ?? false,
        readyToPayTip: data.readyToPayTip ?? false,
        status: RequestStatus.PENDING,
      },
    });

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
      requestHourlyRate: hourlyRateForRequest(receiver.profile, newRequest.categoryLabel),
      ...profileFields(receiver),
      status: 'pending' as const,
      sentAt: formatSentAt(newRequest.createdAt),
      otp: null,
      requesterGender: null,
      ...cancellationFields(newRequest),
      ...cancellationPreviewFields(newRequest, receiver.profile),
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
        message: req.message ?? '',
        ...beneficiaryFields(req),
        readyToPayTravelCharges: req.readyToPayTravelCharges,
        readyToPayTip: req.readyToPayTip,
        requestHourlyRate: hourlyRateForRequest(req.receiver?.profile, req.categoryLabel),
        ...profileFields(req.receiver),
        status: mapRequestStatusWithSession(effectiveRequestStatus(req), req.session),
        sentAt: formatSentAt(req.createdAt),
        sessionStatus: mapSessionStatus(req.session),
        sessionEndedAt: req.session?.endedAt?.toISOString() ?? null,
        otp: null,
        requesterGender: null,
        ...cancellationFields(req),
        ...cancellationPreviewFields(
          { ...req, status: effectiveRequestStatus(req) },
          req.receiver?.profile,
        ),
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
        message: req.message ?? '',
        ...beneficiaryFields(req),
        readyToPayTravelCharges: req.readyToPayTravelCharges,
        readyToPayTip: req.readyToPayTip,
        requestHourlyRate: hourlyRateForRequest(req.receiver?.profile, req.categoryLabel),
        ...profileFields(req.sender),
        status: mapRequestStatusWithSession(effectiveRequestStatus(req), req.session),
        sentAt: formatSentAt(req.createdAt),
        sessionStatus: mapSessionStatus(req.session),
        sessionEndedAt: req.session?.endedAt?.toISOString() ?? null,
        otp: req.otp,
        requesterGender: req.sender.profile?.gender ?? null,
        ...cancellationFields(req),
        ...cancellationPreviewFields(
          { ...req, status: effectiveRequestStatus(req) },
          req.receiver?.profile,
        ),
      }),
    );

    return { sent, received };
  }

  public static async updateRequestStatus(
    userId: number,
    requestId: number,
    status: 'confirmed' | 'declined' | 'cancelled',
    cancellationReason?: string | null,
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
        data: {
          status: RequestStatus.EXPIRED,
          otp: null,
        },
      });
      throw new AppError('This request has expired', 400);
    }

    if (status === 'cancelled') {
      if (request.senderId !== userId) {
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
    } else {
      if (status === 'declined') {
        if (request.receiverId !== userId) {
          throw new AppError('You are not authorized to decline this request', 403);
        }
        if (
          request.status !== RequestStatus.PENDING &&
          request.status !== RequestStatus.ACCEPTED_BY_RECEIVER
        ) {
          throw new AppError('Only pending requests can be declined', 400);
        }
      } else if (status === 'confirmed') {
        if (request.status === RequestStatus.PENDING) {
          if (request.receiverId !== userId) {
            throw new AppError('You are not authorized to accept this request', 403);
          }
        } else if (request.status === RequestStatus.ACCEPTED_BY_RECEIVER) {
          if (request.senderId !== userId) {
            throw new AppError('Only the requester can give final confirmation', 403);
          }
        } else {
          throw new AppError('This request cannot be confirmed right now', 400);
        }
      }
    }

    const finalSenderConfirmation =
      status === 'confirmed' &&
      request.status === RequestStatus.ACCEPTED_BY_RECEIVER &&
      request.senderId === userId;
    const otpVal = finalSenderConfirmation ? String(Math.floor(1000 + Math.random() * 9000)) : null;
    const nextStatus =
      status === 'confirmed'
        ? finalSenderConfirmation
          ? RequestStatus.CONFIRMED
          : RequestStatus.ACCEPTED_BY_RECEIVER
        : mapStatusToBackend(status);

    const now = new Date();
    const isLateCancellation =
      status === 'cancelled' &&
      request.status === RequestStatus.CONFIRMED &&
      request.senderId === userId &&
      now.getTime() >= request.fromDateTime.getTime() - LATE_CANCELLATION_WINDOW_MS &&
      now.getTime() < request.fromDateTime.getTime();

    const cancellationFee = isLateCancellation
      ? hourlyRateForRequest(request.receiver.profile, request.categoryLabel)
      : 0;
    const normalizedCancellationReason = cancellationReason?.trim() || null;
    const storedCancellationReason =
      normalizedCancellationReason ?? (isLateCancellation ? LATE_CANCELLATION_REASON : null);

    const updatedRequest = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        otp: otpVal,
        ...(status === 'cancelled'
          ? {
              cancelledAt: now,
              cancelledById: userId,
              cancellationFee,
              cancellationFeeReason: storedCancellationReason,
            }
          : {}),
      },
      include: {
        sender: { include: { profile: true } },
        receiver: { include: { profile: true } },
      },
    });

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
        `${receiverName} accepted your request. Please confirm to generate the OTP.`,
      );
    } else if (status === 'confirmed') {
      await NotificationService.createNotification(
        updatedRequest.receiverId,
        'request_accepted',
        `${senderName} confirmed the request. OTP is ready.`,
      );
    } else if (status === 'cancelled') {
      const reasonText = normalizedCancellationReason
        ? `. Reason: ${normalizedCancellationReason}`
        : '';
      await NotificationService.createNotification(
        updatedRequest.receiverId,
        'meet_canceled',
        `${senderName} cancelled your meet${reasonText}`,
      );
      if (cancellationFee > 0) {
        await NotificationService.createNotification(
          updatedRequest.senderId,
          'payment_sent',
          `you paid ${cancellationFee} late cancellation fee to ${receiverName}`,
        );
        await NotificationService.createNotification(
          updatedRequest.receiverId,
          'payment_received',
          `you received ${cancellationFee} late cancellation fee from ${senderName}`,
        );
      }
    } else if (status === 'declined') {
      await NotificationService.createNotification(
        updatedRequest.senderId,
        'meet_canceled',
        `${receiverName} declined your request`,
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
      requestHourlyRate: hourlyRateForRequest(
        updatedRequest.receiver.profile,
        updatedRequest.categoryLabel,
      ),
      ...profileFields(partner),
      status: mapStatusToFrontend(updatedRequest.status),
      sentAt: formatSentAt(updatedRequest.createdAt),
      otp: isSender ? null : updatedRequest.otp,
      requesterGender: updatedRequest.sender.profile?.gender ?? null,
      ...cancellationFields(updatedRequest),
      ...cancellationPreviewFields(updatedRequest, updatedRequest.receiver.profile),
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
      otp: partner.id === updatedRequest.receiverId ? updatedRequest.otp : null,
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

  public static async getRequestMessages(userId: number, requestId: number) {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new AppError('Request not found', 404);
    }

    if (request.senderId !== userId && request.receiverId !== userId) {
      throw new AppError('You are not authorized to view messages for this request', 403);
    }

    const messages = await prisma.message.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((msg) => ({
      id: msg.id,
      sender: msg.senderId === userId ? 'me' : 'them',
      type: msg.type,
      text: msg.type === 'text' ? msg.content : undefined,
      imageUri: msg.type === 'image' ? (msg.mediaUrl ?? msg.content) : undefined,
      voiceUri: msg.type === 'voice' ? (msg.mediaUrl ?? msg.content) : undefined,
      voiceDurationSec: msg.voiceDuration ?? undefined,
      createdAt: msg.createdAt.getTime(),
    }));
  }

  public static async deleteRequestMessage(
    userId: number,
    requestId: number,
    messageId: number,
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

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.requestId !== requestId) {
      throw new AppError('Message not found', 404);
    }

    if (message.senderId !== userId) {
      throw new AppError('You can only delete your own messages', 403);
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    const receiverId = request.senderId === userId ? request.receiverId : request.senderId;
    sendToUserForRequest(receiverId, requestId, {
      event: 'message_deleted',
      requestId,
      messageId,
    });
  }
}
