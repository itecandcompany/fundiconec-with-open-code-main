import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sendBrowserNotification } from "@/lib/push";

type IncomingMessage = {
  id: string;
  sender_id: string;
  body: string;
};

/**
 * Chat awareness for a job that's independent of whether the chat sheet is
 * open. Without this, `JobChat` only subscribed to `job_messages` while its
 * own sheet was mounted and open — if either side was looking at the map,
 * tracking screen, or any other tab, an incoming message was invisible
 * until they happened to think to open chat and check.
 *
 * Mount this once per active job (in the parent that owns `activeJob`, e.g.
 * LiveMap.client.tsx / FundiLivePanel.tsx), not inside JobChat itself —
 * JobChat only exists while its sheet is in the tree, which is exactly the
 * state this needs to see past.
 */
export function useChatNotifications({
  jobId,
  chatOpen,
  otherPartyName,
  onOpenChat,
}: {
  jobId: string | null;
  chatOpen: boolean;
  otherPartyName: string;
  onOpenChat: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs for values the subscription effect reads but shouldn't re-run for
  // — `onOpenChat` in particular is typically a fresh inline closure every
  // render in the caller, and resubscribing on every render would mean
  // briefly missing INSERTs during each channel teardown/rebuild.
  const chatOpenRef = useRef(chatOpen);
  const otherPartyNameRef = useRef(otherPartyName);
  const onOpenChatRef = useRef(onOpenChat);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
    otherPartyNameRef.current = otherPartyName;
    onOpenChatRef.current = onOpenChat;
  });

  // JobChat marks messages read as soon as its sheet is open; mirror that
  // transition here rather than re-querying, so the badge clears in step
  // with the sheet opening instead of on the next unread-count fetch.
  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  useEffect(() => {
    if (!jobId || !userId) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;

    supabase
      .from("job_messages")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .neq("sender_id", userId)
      .is("read_at", null)
      .then(({ count }) => {
        if (!cancelled) setUnreadCount(count ?? 0);
      });

    const channel = supabase
      .channel(`chat-notify-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "job_messages",
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          const msg = payload.new as IncomingMessage;
          if (msg.sender_id === userId) return;
          if (chatOpenRef.current) return; // sheet's own view already covers this

          setUnreadCount((n) => n + 1);
          // Matches the existing pattern for job-status notifications
          // (see LiveMap.client.tsx / FundiLivePanel.tsx): an in-app toast
          // for when the app is open but on a different screen, plus an OS
          // notification so a backgrounded tab or minimized PWA still
          // surfaces it — chat was the one event type missing this.
          toast.message(otherPartyNameRef.current, {
            description: msg.body,
            action: { label: "Reply", onClick: () => onOpenChatRef.current() },
          });
          sendBrowserNotification(otherPartyNameRef.current, msg.body);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [jobId, userId]);

  return { unreadCount };
}
