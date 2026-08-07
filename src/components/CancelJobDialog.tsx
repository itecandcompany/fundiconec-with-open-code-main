import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export default function CancelJobDialog({
  open,
  onOpenChange,
  onSubmit,
  busy = false,
  who = "the other party",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (reason: string) => Promise<void> | void;
  busy?: boolean;
  who?: string;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this job?</AlertDialogTitle>
          <AlertDialogDescription>
            Your reason will be shared with {who}. Please tell them why.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          autoFocus
          rows={3}
          maxLength={300}
          placeholder="Reason for cancelling…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep job</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !reason.trim()}
            onClick={(e) => {
              e.preventDefault();
              void onSubmit(reason.trim());
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel job"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
