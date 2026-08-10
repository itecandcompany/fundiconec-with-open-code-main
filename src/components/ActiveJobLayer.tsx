import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Polyline, Popup, useMap } from "react-leaflet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchRoute, SERVICE_META, type RouteResult, type ServiceKey } from "@/lib/geo";
import { servicePin } from "@/lib/mapIcons";
import { Button } from "@/components/ui/button";
import CancelJobDialog from "@/components/CancelJobDialog";
import { Phone, Navigation2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errorMessages";

type JobStatus =
  | "searching"
  | "quoting"
  | "accepted"
  | "on_the_way"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export type ActiveJob = {
  id: string;
  client_id: string;
  fundi_id: string | null;
  service: ServiceKey;
  status: JobStatus;
  client_lat: number;
  client_lng: number;
  fundi_lat: number | null;
  fundi_lng: number | null;
  price: number;
};

const STATUS_LABEL: Record<JobStatus, string> = {
  searching: "Searching for fundi…",
  quoting: "Reviewing quotes…",
  accepted: "Fundi accepted — preparing",
  on_the_way: "Fundi is on the way",
  arrived: "Fundi has arrived",
  in_progress: "Job in progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function FitBoundsOnce({
  a,
  b,
  trigger,
}: {
  a: [number, number];
  b: [number, number];
  trigger: string;
}) {
  const map = useMap();
  const last = useRef<string>("");
  useEffect(() => {
    if (last.current === trigger) return;
    last.current = trigger;
    map.fitBounds([a, b], { padding: [60, 60], maxZoom: 16 });
  }, [trigger, a, b, map]);
  return null;
}

export default function ActiveJobLayer({
  job,
  userPos,
  fundiName,
  fundiPhone,
  reverseTrack,
  onReverseTrackChange,
  onClose,
}: {
  job: ActiveJob;
  userPos: [number, number];
  fundiName: string;
  fundiPhone: string | null;
  reverseTrack: boolean;
  onReverseTrackChange: (v: boolean) => void;
  onClose: () => void;
}) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { user } = useAuth();
  const meta = SERVICE_META[job.service];

  const fundiLat = job.fundi_lat;
  const fundiLng = job.fundi_lng;
  const userLat = userPos[0];
  const userLng = userPos[1];

  const fundiPos = useMemo<[number, number] | null>(
    () => (fundiLat != null && fundiLng != null ? [fundiLat, fundiLng] : null),
    [fundiLat, fundiLng],
  );

  // When reverseTrack is enabled, route from user → fundi (client going to fundi).
  // Otherwise route from fundi → client (default — fundi coming to client).
  useEffect(() => {
    if (fundiLat == null || fundiLng == null) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const from = reverseTrack ? { lat: userLat, lng: userLng } : { lat: fundiLat, lng: fundiLng };
    const to = reverseTrack ? { lat: fundiLat, lng: fundiLng } : { lat: userLat, lng: userLng };
    fetchRoute(from, to, ctrl.signal).then((r) => {
      if (!cancelled && r) setRoute(r);
    });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [reverseTrack, fundiLat, fundiLng, userLat, userLng]);

  // Auto-clear reverse track when pickup completed
  useEffect(() => {
    if (reverseTrack && (job.status === "in_progress" || job.status === "completed")) {
      onReverseTrackChange(false);
      toast.success("Pickup complete");
    }
  }, [job.status, reverseTrack, onReverseTrackChange]);

  const submitCancel = async (reason: string) => {
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("jobs")
        .update({
          status: "cancelled",
          cancellation_reason: reason || "Cancelled by client",
          cancelled_at: new Date().toISOString(),
          cancelled_by: user?.id ?? null,
        })
        .eq("id", job.id);
      if (error) {
        toast.error(toUserMessage(error));
        return;
      }
      onClose();
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  };

  const showRoute =
    fundiPos &&
    job.status !== "completed" &&
    job.status !== "cancelled" &&
    job.status !== "in_progress";

  const distanceTxt = route ? `${route.km.toFixed(1)} km` : "…";
  const etaTxt = route ? `${route.minutes} min` : "…";

  return (
    <>
      {fundiPos && (
        <Marker position={fundiPos} icon={servicePin(job.service, 40)}>
          <Popup>{fundiName}</Popup>
        </Marker>
      )}
      {showRoute && fundiPos && route && (
        <Polyline
          positions={route.coords}
          pathOptions={{ color: meta.color, weight: 5, opacity: 0.85 }}
        />
      )}
      {fundiPos && (
        <FitBoundsOnce
          a={userPos}
          b={fundiPos}
          trigger={`${job.id}-${job.status}-${reverseTrack ? "rev" : "fwd"}`}
        />
      )}

      {/* Status panel */}
      <div className="absolute top-16 left-3 right-3 z-[1000] pointer-events-none">
        <div className="bg-background/95 backdrop-blur rounded-2xl shadow-elegant p-3 border pointer-events-auto">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full grid place-items-center shrink-0"
              style={{ background: meta.color, color: "white" }}
            >
              <meta.Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold leading-tight truncate">{fundiName}</div>
              <div className="text-xs text-muted-foreground">{STATUS_LABEL[job.status]}</div>
            </div>
            {job.status === "completed" ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setCancelOpen(true)}
                aria-label="Cancel request"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {fundiPos && job.status !== "completed" && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Distance</div>
                <div className="text-sm font-semibold">{distanceTxt}</div>
              </div>
              <div className="bg-muted rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">ETA</div>
                <div className="text-sm font-semibold">{etaTxt}</div>
              </div>
              <div className="bg-muted rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Mode</div>
                <div className="text-sm font-semibold">{reverseTrack ? "You go" : "Fundi"}</div>
              </div>
            </div>
          )}
          {fundiPos && (job.status === "accepted" || job.status === "on_the_way") && (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant={reverseTrack ? "default" : "outline"}
                className="flex-1"
                onClick={() => onReverseTrackChange(!reverseTrack)}
              >
                <Navigation2 className="h-4 w-4" />
                {reverseTrack ? "Following fundi" : "I'll go to fundi"}
              </Button>
              {fundiPhone && (
                <Button asChild size="sm" variant="outline">
                  <a href={`tel:${fundiPhone}`}>
                    <Phone className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          )}
          {job.status === "completed" && (
            <Button className="w-full mt-2" size="sm" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </div>
      <CancelJobDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onSubmit={submitCancel}
        busy={cancelling}
        who="the fundi"
      />
    </>
  );
}
