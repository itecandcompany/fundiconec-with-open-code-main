import { supabase } from "@/integrations/supabase/client";
import type { TKey } from "@/lib/i18n";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function isValidAvatarFile(file: File): TKey | null {
  if (!ALLOWED_TYPES.includes(file.type)) return "avatar.invalidType";
  if (file.size > MAX_BYTES) return "avatar.tooLarge";
  return null;
}

/**
 * Avatars live in the existing `job-photos` bucket rather than a new one —
 * it's already public with per-user-folder RLS (`{userId}/...`), so this
 * needs no new migration. A fixed filename (not timestamped, unlike job
 * photos) means re-uploading replaces the old avatar instead of
 * accumulating orphaned files, and `upsert: true` allows overwriting it.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage.from("job-photos").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("job-photos").getPublicUrl(path);
  // Bust CDN/browser caching for the fixed filename — otherwise a re-upload
  // can keep showing the old image until the cache header expires.
  return `${data.publicUrl}?v=${Date.now()}`;
}
