import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useUser } from "@/src/context/user";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <View style={styles.container} testID="splash-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/onboarding" />;
  }
  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
