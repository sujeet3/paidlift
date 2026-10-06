import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { UserProvider } from "@/src/context/user";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// 1. Foreground handler — MODULE SCOPE (native only)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// 2. Android channel — MODULE SCOPE (exists before any push arrives)
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const router = useRouter();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // Push tap handlers (native only)
  useEffect(() => {
    if (Platform.OS === "web") return;

    // Warm tap — user taps notification while app is open
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      const url = (data.deeplink || data.action_url) as string | undefined;
      if (!url) return;
      url.startsWith("http") ? Linking.openURL(url) : router.push(url as any);
    });

    // Cold-start tap — app was killed, user tapped notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data || {};
      const url = (data.deeplink || data.action_url) as string | undefined;
      if (url) {
        url.startsWith("http") ? Linking.openURL(url) : router.push(url as any);
      }
    });

    // Weekly nudge for users who permanently denied permission
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
        const { Alert } = require("react-native");
        Alert.alert(
          "Stay in the loop",
          "Enable notifications to know instantly when your booking is accepted or your driver messages you.",
          [
            {
              text: "Later",
              style: "cancel",
              onPress: async () => AsyncStorage.setItem("pushNudgeAt", String(Date.now())),
            },
            {
              text: "Open Settings",
              onPress: async () => {
                await AsyncStorage.setItem("pushNudgeAt", String(Date.now()));
                Linking.openSettings();
              },
            },
          ],
        );
      } catch {}
    })();

    return () => {
      tapSub.remove();
    };
  }, [router]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <UserProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }} />
        </UserProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
