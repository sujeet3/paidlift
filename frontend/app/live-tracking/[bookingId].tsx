import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius } from "@/src/theme";
import RideMap from "@/src/components/RideMap";
import { fetchDirections, decodePolyline, formatEta, DirectionsResult } from "@/src/maps";

export default function LiveTracking() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { user } = useUser();
  const [b, setB] = useState<any>(null);
  const [directions, setDirections] = useState<DirectionsResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [realLoc, setRealLoc] = useState<{ latitude: number; longitude: number; age_seconds: number } | null>(null);
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const bk = await api.getBooking(bookingId!);
        setB(bk);
        if (bk?.ride?.from_location && bk?.ride?.to_location) {
          const d = await fetchDirections(bk.ride.from_location, bk.ride.to_location, bk.ride.stops || []);
          setDirections(d);
        }
      } catch {}
    })();
  }, [bookingId]);

  // Poll real driver GPS; fall back to simulated progress when stale
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const loc = await api.getLocation(bookingId!);
        if (loc?.available) {
          setRealLoc(loc);
        } else {
          setRealLoc(null);
        }
      } catch {
        setRealLoc(null);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [bookingId]);

  // Simulated progress only when no real GPS
  useEffect(() => {
    if (realLoc || !directions) return;
    if (simRef.current) return;
    simRef.current = setInterval(() => setProgress((p) => Math.min(1, p + 0.02)), 3000);
    return () => { if (simRef.current) { clearInterval(simRef.current); simRef.current = null; } };
  }, [realLoc, directions]);

  useEffect(() => {
    if (realLoc && simRef.current) { clearInterval(simRef.current); simRef.current = null; }
  }, [realLoc]);

  const simPos = useMemo(() => {
    if (!directions?.overviewPolyline) return undefined;
    const pts = decodePolyline(directions.overviewPolyline);
    if (pts.length === 0) return undefined;
    const idx = Math.min(pts.length - 1, Math.floor(progress * (pts.length - 1)));
    return pts[idx];
  }, [directions?.overviewPolyline, progress]);

  const driverPos = realLoc ? { latitude: realLoc.latitude, longitude: realLoc.longitude } : simPos;

  // ETA: from real position if we can, else progress-based
  const etaSec = useMemo(() => {
    if (!directions) return 0;
    if (realLoc && directions.end) {
      // rough straight-line ETA from real position
      const R = 6371000;
      const dLat = (directions.end.lat - realLoc.latitude) * Math.PI / 180;
      const dLng = (directions.end.lng - realLoc.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(realLoc.latitude * Math.PI / 180) * Math.cos(directions.end.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      const dist = 2 * R * Math.asin(Math.sqrt(a));
      return Math.round(dist / (45_000 / 3600));
    }
    return Math.max(0, Math.round(directions.durationSeconds * (1 - progress)));
  }, [directions, realLoc, progress]);

  const triggerSOS = async () => {
    if (!user) return;
    Alert.alert("SOS Alert", "Send emergency alert to PAID LIFT team?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send Alert",
        style: "destructive",
        onPress: async () => {
          try {
            await api.sos({ booking_id: bookingId!, user_id: user.id, location: driverPos ? `${driverPos.latitude},${driverPos.longitude}` : "unknown" });
            Alert.alert("SOS sent", "Our team has been notified. Stay safe.");
          } catch {}
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <RideMap polyline={directions?.overviewPolyline} driver={driverPos} showDriver />

      <SafeAreaView edges={["top"]} style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="back-button"><Ionicons name="chevron-back" size={22} color="#fff" /></Pressable>
        <View style={styles.trackingBadge} testID="gps-mode-badge">
          <View style={[styles.livePulse, !realLoc && { backgroundColor: colors.warning }]} />
          <Text style={styles.badgeText}>{realLoc ? "LIVE GPS" : "ESTIMATED"}</Text>
        </View>
      </SafeAreaView>

      <Pressable onPress={triggerSOS} style={styles.sos} testID="sos-fab">
        <Ionicons name="warning" size={22} color="#fff" />
        <Text style={styles.sosText}>SOS</Text>
      </Pressable>

      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.eta} testID="live-eta">{directions ? formatEta(etaSec) : "—"}</Text>
        <Text style={styles.etaSub}>Estimated arrival{realLoc ? "" : " · driver GPS pending"}</Text>

        <View style={styles.driverRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(b?.owner?.name || "U").slice(0, 1)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.name}>{b?.owner?.name || "Driver"}</Text>
            <Text style={styles.small}>{b?.ride?.from_location} → {b?.ride?.to_location}</Text>
          </View>
          <Pressable style={styles.chatBtn} onPress={() => router.push({ pathname: "/chat/[bookingId]", params: { bookingId: bookingId! } })} testID="chat-button">
            <Ionicons name="chatbubbles" size={18} color={colors.brandPrimary} />
          </Pressable>
        </View>

        <View style={styles.nextTurn}>
          <Ionicons name="arrow-forward-circle" size={20} color={colors.brandPrimary} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.turnText}>{etaSec < 120 ? "Arriving now" : "En route"}</Text>
            <Text style={styles.turnSub}>
              {realLoc ? "Tracking driver's live position" : "Driver hasn't started GPS sharing yet"}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", padding: spacing.md, alignItems: "center" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  trackingBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  sos: { position: "absolute", right: spacing.lg, bottom: 320, backgroundColor: colors.error, width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8 },
  sosText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  eta: { fontSize: 36, fontWeight: "800", color: colors.brandPrimary },
  etaSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: -4 },
  driverRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontWeight: "800" },
  name: { fontWeight: "700", fontSize: 15, color: colors.onSurface },
  small: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  chatBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  nextTurn: { flexDirection: "row", alignItems: "center", marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  turnText: { fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  turnSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
});
