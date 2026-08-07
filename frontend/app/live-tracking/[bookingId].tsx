import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

const MAP = "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1200&auto=format&fit=crop";

export default function LiveTracking() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { user } = useUser();
  const [b, setB] = useState<any>(null);
  const [etaMin, setEtaMin] = useState(28);

  useEffect(() => {
    (async () => {
      try { setB(await api.getBooking(bookingId!)); } catch {}
    })();
    const t = setInterval(() => setEtaMin((v) => Math.max(0, v - 1)), 5000);
    return () => clearInterval(t);
  }, [bookingId]);

  const triggerSOS = async () => {
    if (!user) return;
    Alert.alert("SOS Alert", "Send emergency alert to PAID LIFT team?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send Alert",
        style: "destructive",
        onPress: async () => {
          try {
            await api.sos({ booking_id: bookingId!, user_id: user.id, location: "Live tracking screen" });
            Alert.alert("SOS sent", "Our team has been notified. Stay safe.");
          } catch {}
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <Image source={MAP} style={styles.map} contentFit="cover" />
      <LinearGradient colors={["rgba(0,0,0,0.4)", "transparent"]} style={styles.scrimTop} />

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
        <Text style={styles.eta}>{etaMin} min</Text>
        <Text style={styles.etaSub}>Estimated arrival</Text>

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
            <Text style={styles.turnText}>Continue on NH-48 for 4.2 km</Text>
            <Text style={styles.turnSub}>Then take the exit toward destination</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  map: { width: "100%", height: "100%", position: "absolute" },
  scrimTop: { position: "absolute", top: 0, left: 0, right: 0, height: 140 },
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
