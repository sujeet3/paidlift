// File upload helper — Emergent Object Storage via backend.
// Handles the native-vs-web FormData split (SDK 54) and legacy FS entry point.

import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export async function uploadFile(opts: {
  uri: string;
  user_id: string;
  kind?: string;   // vehicle_doc | profile
  ref_id?: string; // vehicle id etc.
  fileName?: string;
  mimeType?: string;
}): Promise<{ path: string; upload_id: string }> {
  const { uri, user_id, kind = "vehicle_doc", ref_id = "", fileName = "photo.jpg", mimeType = "image/jpeg" } = opts;

  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, fileName);
  } else {
    form.append("file", { uri, name: fileName, type: mimeType } as any);
  }
  form.append("user_id", user_id);
  form.append("kind", kind);
  form.append("ref_id", ref_id);

  const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function fileUrl(path: string): string {
  return `${BASE}/api/files/${path}`;
}
