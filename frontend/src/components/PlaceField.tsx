// Debounced Google Places autocomplete field backed by our FastAPI proxy.

import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { placesAutocomplete } from "@/src/maps";
import { colors, spacing, radius } from "@/src/theme";

type Suggestion = { placeId: string; text: string; secondary: string };

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  onSelect?: (s: Suggestion) => void;
  placeholder: string;
  dotColor?: string;
  testID?: string;
};

export default function PlaceField({ value, onChangeText, onSelect, placeholder, dotColor, testID }: Props) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const tokenRef = useRef<string>(Math.random().toString(36).slice(2));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const r = await placesAutocomplete(q, tokenRef.current);
      setItems(r.suggestions.slice(0, 6));
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(value), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, doSearch]);

  const pick = (s: Suggestion) => {
    onChangeText(s.text);
    onSelect?.(s);
    setItems([]);
    tokenRef.current = Math.random().toString(36).slice(2);
  };

  return (
    <View>
      <View style={styles.row}>
        {dotColor ? (
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
        ) : (
          <Ionicons name="location" size={16} color={colors.onSurfaceSecondary} />
        )}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
        />
        {loading && <ActivityIndicator size="small" color={colors.brandPrimary} />}
      </View>
      {focused && items.length > 0 && (
        <View style={styles.dropdown} testID={`${testID}-dropdown`}>
          {items.map((s) => (
            <Pressable
              key={s.placeId}
              style={styles.suggest}
              onPress={() => pick(s)}
              testID={`${testID}-suggestion-${s.placeId}`}
            >
              <Ionicons name="location-outline" size={16} color={colors.onSurfaceSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestPrimary}>{s.text}</Text>
                {!!s.secondary && <Text style={styles.suggestSecondary}>{s.secondary}</Text>}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, marginLeft: 2 },
  input: { flex: 1, fontSize: 15, color: colors.onSurface, paddingVertical: 12 },
  dropdown: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    overflow: "hidden",
  },
  suggest: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  suggestPrimary: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  suggestSecondary: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
});
