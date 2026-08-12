/** Browser geolocation → short city/place label (no external geo API required). */
export async function detectPlaceLabel(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8_000,
      maximumAge: 60_000,
    });
  }).catch(() => null);

  if (!position) return null;

  const { latitude, longitude } = position.coords;
  // Compact stamp until a reverse-geocode provider is wired.
  return `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
}
