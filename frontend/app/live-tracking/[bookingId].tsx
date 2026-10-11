import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";
import RideMap from "@/src/components/RideMap";
import { fetchDirections, decodePolyline, formatEta, DirectionsResult } from "@/src/maps";

export default function LiveTracking() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { user } = useUser();
  const [b, setB] = useState<any>(null);
  const [directions, setDirections] = useState<DirectionsResult | null>(null);
  const [realDriverPos, setRealDriverPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [progress, setProgress] = useState(0);

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

  // Connect to live GPS streaming WebSocket
  useEffect(() => {
    if (!b?.ride_id) return;
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8001";
    const wsUrl = backendUrl.replace(/^http/, "ws") + `/ws/ride/${b.ride_id}/location`;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const loc = JSON.parse(event.data);
          if (loc.latitude && loc.longitude) {
            setRealDriverPos({ latitude: loc.latitude, longitude: loc.longitude });
          }
        } catch {}
      };
    } catch (e) {
      console.warn("Tracking WebSocket error:", e);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [b?.ride_id]);

  // Fallback simulator if driver is not actively streaming hardware GPS
  useEffect(() => {
    if (!directions || realDriverPos) return;
    const t = setInterval(() => {
      setProgress((p) => Math.min(1, p + 0.02));
    }, 3000);
    return () => clearInterval(t);
  }, [directions, realDriverPos]);

  const driverPos = useMemo(() => {
    if (realDriverPos) return realDriverPos;
    if (!directions?.overviewPolyline) return undefined;
    const pts = decodePolyline(directions.overviewPolyline);
    if (pts.length === 0) return undefined;
    const idx = Math.min(pts.length - 1, Math.floor(progress * (pts.length - 1)));
    return pts[idx];
  }, [realDriverPos, directions?.overviewPolyline, progress]);

  const etaSec = directions ? Math.max(0, Math.round(directions.durationSeconds * (1 - progress))) : 0;


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
      <RideMap
        polyline={directions?.overviewPolyline}
        driver={driverPos}
        stops={(b?.ride?.stops || []).map((s: string) => ({ latitude: 0, longitude: 0, label: s }))}
        showDriver
      />

      <SafeAreaView edges={["top"]} style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></Pressable>
        <View style={styles.trackingBadge}>
          <View style={styles.livePulse} />
          <Text style={styles.badgeText}>LIVE TRACKING</Text>
        </View>
      </SafeAreaView>

      <Pressable onPress={triggerSOS} style={styles.sos} testID="sos-fab">
        <Ionicons name="warning" size={22} color="#fff" />
        <Text style={styles.sosText}>SOS</Text>
      </Pressable>

      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.eta} testID="live-eta">{directions ? formatEta(etaSec) : "—"}</Text>
        <Text style={styles.etaSub}>
          Estimated arrival {directions?.mocked ? "· estimate" : ""}
        </Text>

        <View style={styles.driverRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(b?.owner?.name || "U").slice(0, 1)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.name}>{b?.owner?.name || "Driver"}</Text>
            <Text style={styles.small}>{b?.ride?.from_location} → {b?.ride?.to_location}</Text>
          </View>
          <Pressable style={styles.chatBtn} onPress={() => router.push({ pathname: "/chat/[bookingId]", params: { bookingId: bookingId! } })}>
            <Ionicons name="chatbubbles" size={18} color={colors.brandPrimary} />
          </Pressable>
        </View>

        <View style={styles.nextTurn}>
          <Ionicons name="arrow-forward-circle" size={20} color={colors.brandPrimary} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.turnText}>
              {progress < 1 ? "Continue on NH-48" : "Arrived at destination"}
            </Text>
            <Text style={styles.turnSub}>
              {progress < 1 ? `${Math.round((1 - progress) * 100)}% remaining` : "Complete the ride"}
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
