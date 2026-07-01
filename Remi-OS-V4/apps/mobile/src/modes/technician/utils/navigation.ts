import { Linking, Platform } from "react-native";

export function openMapsNavigation(
  address: string,
  _lat?: number | null,
  _lng?: number | null
): void {
  const encoded = encodeURIComponent(address);
  const googleUrl =
    Platform.OS === "ios"
      ? `comgooglemaps://?daddr=${encoded}&directionsmode=driving`
      : `google.navigation:q=${encoded}`;
  Linking.openURL(googleUrl).catch(() => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
    );
  });
}

export function formatTravelTime(minutes: number): string {
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}
