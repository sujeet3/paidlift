import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";
import { api } from "@/src/api";

async function registerForPush(userId: string) {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api.registerPush({
      user_id: userId,
      platform: Platform.OS,
      device_token: tokenResp.data,
    });
  } catch {}
}

export type User = {
  id: string;
  phone: string;
  name: string;
  email: string;
  aadhaar_last4: string;
  aadhaar_verified: boolean;
  role: "passenger" | "owner" | "both";
  photo: string;
  rating_avg: number;
  rating_count: number;
  wallet_balance: number;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const USER_KEY = "paidlift.user.v1";
const UserContext = createContext<Ctx>({} as Ctx);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string>(USER_KEY, "");
      if (raw) {
        try {
          setUserState(JSON.parse(raw as string));
        } catch {}
      }
      setLoading(false);
    })();
  }, []);

  const setUser = useCallback(async (u: User | null) => {
    setUserState(u);
    if (u) {
      await storage.setItem(USER_KEY, JSON.stringify(u));
      registerForPush(u.id); // re-register on every login (tokens rotate)
    } else {
      await storage.removeItem(USER_KEY);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const fresh = await api.getUser(user.id);
      await setUser(fresh);
    } catch {}
  }, [user, setUser]);

  useEffect(() => {
    if (user) registerForPush(user.id);
  }, [user?.id]);

  const signOut = useCallback(async () => {
    await storage.removeItem(USER_KEY);
    setUserState(null);
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, setUser, refresh, signOut }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
