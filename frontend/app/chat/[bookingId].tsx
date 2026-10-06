import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { api } from "@/src/api";
import { useUser } from "@/src/context/user";
import { colors, spacing, radius, type } from "@/src/theme";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const WS_BASE = BASE.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

export default function Chat() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { user } = useUser();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [booking, setBooking] = useState<any>(null);
  const [live, setLive] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    if (!bookingId) return;
    try {
      const [msgs, b] = await Promise.all([api.listChat(bookingId), api.getBooking(bookingId)]);
      setMessages(msgs);
      setBooking(b);
    } catch {}
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  // WebSocket with polling fallback
  useEffect(() => {
    if (!bookingId) return;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const startPolling = () => {
      if (!poll) poll = setInterval(load, 5000);
    };

    try {
      const ws = new WebSocket(`${WS_BASE}/api/chat/ws/${bookingId}`);
      wsRef.current = ws;
      ws.onopen = () => { setLive(true); if (poll) { clearInterval(poll); poll = null; } };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        } catch {}
      };
      ws.onerror = () => { setLive(false); startPolling(); };
      ws.onclose = () => { setLive(false); if (!closed) startPolling(); };
      // If socket never opens in 3s, start polling anyway
      setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) startPolling(); }, 3000);
    } catch {
      startPolling();
    }

    return () => {
      closed = true;
      if (poll) clearInterval(poll);
      try { wsRef.current?.close(); } catch {}
    };
  }, [bookingId, load]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const send = async () => {
    if (!user || !text.trim()) return;
    const t = text;
    setText("");
    try {
      await api.sendChat({ booking_id: bookingId, sender_id: user.id, text: t });
    } catch {}
  };

  const other = user?.id === booking?.owner_id ? booking?.passenger : booking?.owner;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="back-button"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{other?.name || "Chat"}</Text>
            <Text style={styles.sub}>{booking?.ride?.from_location} → {booking?.ride?.to_location}</Text>
          </View>
          <View style={[styles.liveDot, { backgroundColor: live ? colors.success : colors.onSurfaceTertiary }]} testID="chat-live-indicator" />
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.list}>
          {messages.length === 0 && (
            <View style={styles.empty} testID="chat-empty">
              <Ionicons name="chatbubbles-outline" size={40} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyText}>Say hi to coordinate your pickup.</Text>
            </View>
          )}
          {messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]} testID={`msg-${m.id}`}>
                <Text style={[styles.msgText, mine && { color: "#fff" }]}>{m.text}</Text>
              </View>
            );
          })}
        </ScrollView>

        <SafeAreaView edges={["bottom"]} style={styles.inputRow}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={colors.onSurfaceTertiary}
            value={text}
            onChangeText={setText}
          />
          <Pressable style={styles.sendBtn} onPress={send} testID="chat-send-button">
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </SafeAreaView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  list: { padding: spacing.lg, paddingBottom: spacing.lg, gap: 6 },
  empty: { alignItems: "center", padding: spacing.xxxl },
  emptyText: { ...type.bodySm, marginTop: spacing.sm },
  bubble: { padding: spacing.md, borderRadius: radius.md, maxWidth: "80%" },
  mine: { backgroundColor: colors.brandPrimary, alignSelf: "flex-end", borderBottomRightRadius: 2 },
  theirs: { backgroundColor: colors.surface, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 2 },
  msgText: { color: colors.onSurface, fontSize: 14 },
  inputRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: 15, color: colors.onSurface },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
});
