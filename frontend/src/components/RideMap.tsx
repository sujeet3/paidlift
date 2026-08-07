// Universal map component — uses a Leaflet WebView for a route + markers so it
// works in Expo Go, web preview, and native builds without needing a Google
// Maps native key. When the backend Directions API returns a real Google
// polyline (once GOOGLE_MAPS_API_KEY is configured server-side), the same
// component renders the true route.
//
// For native builds later, this can be swapped for react-native-maps via a
// platform-specific .native.tsx file — no callers need to change.

import { useMemo } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { WebView } from "react-native-webview";

import { decodePolyline } from "@/src/maps";
import { colors } from "@/src/theme";

type Props = {
  polyline?: string;
  driver?: { latitude: number; longitude: number };
  stops?: { latitude: number; longitude: number; label?: string }[];
  height?: number | string;
  showDriver?: boolean;
};

export default function RideMap({ polyline = "", driver, stops = [], height = "100%", showDriver = true }: Props) {
  const html = useMemo(() => buildLeafletHtml(polyline, driver, stops, showDriver), [polyline, driver?.latitude, driver?.longitude, stops.length, showDriver]);

  // Web (preview) — render an iframe-style webview via dangerouslySetInnerHTML equivalent using WebView.
  if (Platform.OS === "web") {
    return (
      <View style={[styles.wrap, { height: height as any }]}>
        {/* @ts-ignore srcDoc supported by react-native-webview on web */}
        <iframe title="ride-map" srcDoc={html} style={{ width: "100%", height: "100%", border: 0 }} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height: height as any }]}>
      <WebView
        source={{ html }}
        style={styles.web}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
      />
    </View>
  );
}

function buildLeafletHtml(polyline: string, driver: any, stops: any[], showDriver: boolean) {
  const coords = polyline ? decodePolyline(polyline) : [];
  const line = JSON.stringify(coords.map((c) => [c.latitude, c.longitude]));
  const stopArr = JSON.stringify(stops.map((s) => [s.latitude, s.longitude, s.label || ""]));
  const driverArr = showDriver && driver ? JSON.stringify([driver.latitude, driver.longitude]) : "null";
  const brand = colors.brandPrimary;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#map { margin:0; padding:0; height:100%; width:100%; background:#EBECEF; }
  .car-marker {
    width:36px; height:36px; border-radius:18px; background:${brand};
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 12px rgba(239,108,0,0.5); border:3px solid #fff;
    font-size:18px;
  }
  .pin { width:14px; height:14px; border-radius:7px; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.2); }
  .pin.start { background:${brand}; }
  .pin.end   { background:#1A1B1F; }
  .pin.stop  { background:#71747E; width:10px; height:10px; }
  .leaflet-container { background:#F5F6F8; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const line = ${line};
  const stops = ${stopArr};
  const driver = ${driverArr};
  const center = line.length ? line[Math.floor(line.length/2)] : (stops.length ? [stops[0][0], stops[0][1]] : [20.5937, 78.9629]);
  const map = L.map('map', { zoomControl:false, attributionControl:false }).setView(center, 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(map);

  if (line.length > 1) {
    const poly = L.polyline(line, { color: '${brand}', weight: 5, opacity: 0.9 }).addTo(map);
    // start / end markers
    const s = line[0], e = line[line.length-1];
    L.marker(s, { icon: L.divIcon({ className:'', html:'<div class="pin start"></div>', iconSize:[14,14], iconAnchor:[7,7] }) }).addTo(map);
    L.marker(e, { icon: L.divIcon({ className:'', html:'<div class="pin end"></div>',   iconSize:[14,14], iconAnchor:[7,7] }) }).addTo(map);
    map.fitBounds(poly.getBounds(), { padding:[24,24] });
  }
  stops.forEach(([lat,lng,label]) => {
    L.marker([lat,lng], { icon: L.divIcon({ className:'', html:'<div class="pin stop"></div>', iconSize:[10,10], iconAnchor:[5,5] }) })
     .bindTooltip(label || '', {permanent:false, direction:'top'}).addTo(map);
  });
  if (driver) {
    L.marker(driver, { icon: L.divIcon({ className:'', html:'<div class="car-marker">🚗</div>', iconSize:[36,36], iconAnchor:[18,18] }) }).addTo(map);
  }
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden", backgroundColor: colors.surfaceSecondary },
  web: { flex: 1, backgroundColor: colors.surfaceSecondary },
});
