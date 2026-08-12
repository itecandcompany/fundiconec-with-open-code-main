import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
import Avatar from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/auth";
import { isValidAvatarFile, uploadAvatar } from "@/lib/avatar";
import { toUserMessage } from "@/lib/errorMessages";
import { useT } from "@/lib/i18n";

export default function EditProfileDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useT();
  const { refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed from the latest profile each time the dialog opens, rather than
  // once on mount — the dialog stays mounted (Dialog controls visibility
  // via CSS), so without this a second open would show stale edits from
  // a previous open/cancel cycle instead of the current saved values.
  const wasOpenRef = useRef(open);
  if (open && !wasOpenRef.current) {
    setFullName(profile.full_name);
    setPhone(profile.phone ?? "");
    setAvatarUrl(profile.avatar_url);
  }
  wasOpenRef.current = open;

  const pickAvatar = () => fileInputRef.current?.click();

  const onAvatarSelected = async (file: File | undefined) => {
    if (!file) return;
    const invalidReason = isValidAvatarFile(file);
    if (invalidReason) {
      toast.error(t(invalidReason));
      return;
    }
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(profile.id, file);
      setAvatarUrl(url);
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    const name = fullName.trim();
    if (!name) {
      toast.error(t("account.nameRequired"));
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name, phone: phone.trim() || null, avatar_url: avatarUrl })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error(toUserMessage(error));
      return;
    }
    await refreshProfile();
    toast.success(t("account.profileUpdated"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("account.editProfile")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={pickAvatar}
            disabled={uploadingAvatar}
            aria-label={t("account.changePhoto")}
            className="group relative"
          >
            <Avatar url={avatarUrl} name={fullName || "?"} size={88} />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/0 transition-colors group-hover:bg-black/40">
              {uploadingAvatar ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={pickAvatar}
            disabled={uploadingAvatar}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t("account.changePhoto")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onAvatarSelected(e.target.files?.[0])}
          />
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-name">{t("account.fullName")}</Label>
            <Input
              id="edit-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="edit-phone">{t("account.phone")}</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("account.phonePlaceholder")}
            />
          </div>
        </div>

        <Button
          onClick={save}
          disabled={saving || uploadingAvatar || !fullName.trim()}
          className="w-full h-12"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.submit")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
