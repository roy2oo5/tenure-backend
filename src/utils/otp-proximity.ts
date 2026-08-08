export const OTP_PROXIMITY_METERS = 20;
export const OTP_LOCATION_FRESHNESS_MS = 60_000;

type RequestLocations = {
  senderCurrentLatitude: number | null;
  senderCurrentLongitude: number | null;
  senderLocationUpdatedAt: Date | null;
  receiverCurrentLatitude: number | null;
  receiverCurrentLongitude: number | null;
  receiverLocationUpdatedAt: Date | null;
};

export type OtpProximity = {
  ready: boolean;
  distanceMeters: number | null;
  message: string;
};

const validCoordinates = (latitude: number | null, longitude: number | null) =>
  latitude != null &&
  longitude != null &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function otpProximityForRequest(
  request: RequestLocations,
  now = new Date(),
): OtpProximity {
  const senderFresh =
    request.senderLocationUpdatedAt != null &&
    now.getTime() - request.senderLocationUpdatedAt.getTime() <= OTP_LOCATION_FRESHNESS_MS;
  const receiverFresh =
    request.receiverLocationUpdatedAt != null &&
    now.getTime() - request.receiverLocationUpdatedAt.getTime() <= OTP_LOCATION_FRESHNESS_MS;
  if (
    !senderFresh ||
    !receiverFresh ||
    !validCoordinates(request.senderCurrentLatitude, request.senderCurrentLongitude) ||
    !validCoordinates(request.receiverCurrentLatitude, request.receiverCurrentLongitude)
  ) {
    return {
      ready: false,
      distanceMeters: null,
      message: 'Waiting for fresh live locations from both users. Keep location access enabled.',
    };
  }

  const distance = distanceMeters(
    request.senderCurrentLatitude!,
    request.senderCurrentLongitude!,
    request.receiverCurrentLatitude!,
    request.receiverCurrentLongitude!,
  );
  const roundedDistance = Math.max(0, Math.round(distance));
  if (distance > OTP_PROXIMITY_METERS) {
    return {
      ready: false,
      distanceMeters: roundedDistance,
      message: `Move closer to the other user to generate the OTP. You are about ${roundedDistance} m apart; 20 m or less is required.`,
    };
  }
  return {
    ready: true,
    distanceMeters: roundedDistance,
    message: 'Both users are within 20 m. OTP is ready.',
  };
}
