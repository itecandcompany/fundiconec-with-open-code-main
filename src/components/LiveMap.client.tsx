import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DEFAULT_CENTER, haversineKm, type ServiceKey } from "@/lib/geo";
import { servicePin, userLocationIcon } from "@/lib/mapIcons";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import ActiveJobLayer, { type ActiveJob } from "./ActiveJobLayer";
import { sendBrowserNotification, ensureNotificationPermission } from "@/lib/push";
import BookingSheet from "./booking/BookingSheet";
import JobChat from "./chat/JobChat";

type FundiRow = {
  id: string;
  service: ServiceKey;
  hourly_rate: number;
  bio: string | null;
  is_available: boolean;
  current_lat: number | null;
  current_lng: number | null;
  rating: number;
  total_jobs: number;
};

type FundiWithProfile = FundiRow & { full_name: string; phone: string | null };

// Zoom level 15 alone can put an otherwise-correct fundi off-screen if
// they're actually far from the client (e.g. GPS fell back to a default
// center in a different city). Fit the view to include everyone found.
function FitToFundis({
  userPos,
  fundiPositions,
  follow,
}: {
  userPos: [number, number];
  fundiPositions: [number, number][];
  follow: boolean;
}) {
  const map = useMap();
  const key = fundiPositions.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (!follow) return;
    if (fundiPositions.length === 0) {
      map.setView(userPos, Math.max(map.getZoom(), 13));
      return;
    }
    const bounds = L.latLngBounds([userPos, ...fundiPositions]);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos[0], userPos[1], key, follow, map]);
  return null;
}

// Leaflet caches its container size and only recomputes on window `resize`.
// Anything that resizes the map *without* resizing the window — crossing the
// desktop breakpoint into the side-by-side layout, or the booking sheet
// expanding over it — leaves Leaflet believing it's still the old size, which
// renders as grey gutters and tiles/markers landing in the wrong place.
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function CenterOn({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  const lat = pos?.[0];
  const lng = pos?.[1];
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export default function LiveMap({
  service,
  setService,
  hideIdleSheet = false,
  onActiveJobChange,
}: {
  service: ServiceKey;
  setService: (s: ServiceKey) => void;
  hideIdleSheet?: boolean;
  onActiveJobChange?: (job: ActiveJob | null) => void;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [follow, setFollow] = useState(true);
  const [fundis, setFundis] = useState<Record<string, FundiWithProfile>>({});
  const watchRef = useRef<number | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [reverseTrack, setReverseTrack] = useState(false);
  const [chat, setChat] = useState<{ jobId: string; title: string } | null>(null);

  // Request permission for cancellation/status notifications
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  // 1. Watch user GPS. A browser permission prompt left unanswered never
  // fires either geolocation callback, so the `timeout` option alone isn't
  // reliable — fall back on our own clock too.
  useEffect(() => {
    let settled = false;
    const fallback = (message: string) => {
      if (settled) return;
      settled = true;
      toast.error(message);
      setPos([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]);
    };

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      fallback("GPS not available; using Dar es Salaam");
      return;
    }

    const hardTimeout = window.setTimeout(
      () => fallback("Couldn't get your location — using default"),
      8000,
    );
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        settled = true;
        window.clearTimeout(hardTimeout);
        setPos([p.coords.latitude, p.coords.longitude]);
      },
      (err) => {
        console.warn("geo error", err);
        window.clearTimeout(hardTimeout);
        fallback("Couldn't get your location — using default");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      window.clearTimeout(hardTimeout);
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // 2. Initial fundi fetch + realtime subscription
  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      const { data: rows } = await supabase
        .from("fundis")
        .select("*")
        .eq("service", service)
        .eq("is_available", true)
        .not("current_lat", "is", null)
        .not("current_lng", "is", null);

      if (!rows || cancelled) return;
      const ids = rows.map((r) => r.id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
      const next: Record<string, FundiWithProfile> = {};
      for (const r of rows) {
        const p = profMap.get(r.id);
        next[r.id] = {
          ...(r as FundiRow),
          full_name: p?.full_name ?? "Fundi",
          phone: p?.phone ?? null,
        };
      }
      if (!cancelled) setFundis(next);
    };

    fetchAll();

    const channel = supabase
      .channel(`fundis-live-${service}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fundis", filter: `service=eq.${service}` },
        async (payload) => {
          const row = (payload.new ?? payload.old) as FundiRow | undefined;
          if (!row) return;
          if (payload.eventType === "DELETE") {
            setFundis((prev) => {
              const cp = { ...prev };
              delete cp[row.id];
              return cp;
            });
            return;
          }
          const visible = row.is_available && row.current_lat != null && row.current_lng != null;
          if (!visible) {
            setFundis((prev) => {
              const cp = { ...prev };
              delete cp[row.id];
              return cp;
            });
            return;
          }
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, full_name, phone")
            .eq("id", row.id)
            .maybeSingle();
          setFundis((prev) => ({
            ...prev,
            [row.id]: {
              ...(row as FundiRow),
              full_name: prof?.full_name ?? "Fundi",
              phone: prof?.phone ?? null,
            },
          }));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [service]);

  // Subscribe to the user's active job + status changes in realtime
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const loadActive = async () => {
      const { data } = await supabase
        .from("jobs")
        .select("*")
        .eq("client_id", userId)
        .in("status", ["searching", "quoting", "accepted", "on_the_way", "arrived", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setActiveJob((data as ActiveJob) ?? null);
    };
    loadActive();

    const channel = supabase
      .channel(`client-jobs-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: `client_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as ActiveJob | undefined;
          if (!row) return;
          if (payload.eventType === "DELETE") {
            setActiveJob((prev) => (prev?.id === row.id ? null : prev));
            return;
          }
          const prevStatus = activeJobRef.current?.status;
          if (row.status === "completed") {
            setActiveJob(row);
            toast.success("Job completed 🎉");
            return;
          }
          if (row.status === "cancelled") {
            // No dedicated "cancelled" screen in BookingSheet — clear the
            // active job so the sheet reverts to idle, same as FundiLivePanel
            // does on its side. Keeping the cancelled row as `activeJob`
            // would fall through to the active-job tracking UI, which reads
            // as "cancel did nothing."
            const r = row as ActiveJob & {
              cancellation_reason?: string | null;
              cancelled_by?: string | null;
              cancelled_at?: string | null;
            };
            const byOther = r.cancelled_by && r.cancelled_by !== userId;
            const reason = r.cancellation_reason || "No reason provided";
            const when = r.cancelled_at
              ? new Date(r.cancelled_at).toLocaleTimeString()
              : new Date().toLocaleTimeString();
            if (byOther) {
              toast.error(`Fundi cancelled the job · ${when}`, { description: reason });
              sendBrowserNotification("Job cancelled by fundi", `${reason} · ${when}`);
            } else {
              toast.message(`Job cancelled · ${when}`, { description: reason });
            }
            setActiveJob(null);
            return;
          }
          setActiveJob(row);
          if (prevStatus && prevStatus !== row.status) {
            const map: Record<string, string> = {
              accepted: "Fundi accepted your request",
              on_the_way: "Fundi is on the way",
              arrived: "Fundi has arrived",
              in_progress: "Job started",
            };
            if (map[row.status]) {
              toast.message(map[row.status]);
              sendBrowserNotification(map[row.status], "Open the app for details");
            }
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Seed from the audit trail, then receive ephemeral fundi GPS over Broadcast.
  const activeJobId = activeJob?.id;
  const activeJobFundiId = activeJob?.fundi_id;
  useEffect(() => {
    if (!activeJobId || !activeJobFundiId) return;
    const jobId = activeJobId;
    const fundiId = activeJobFundiId;
    let cancelled = false;

    // Seed with the most recent fundi location for this job
    supabase
      .from("job_locations")
      .select("lat, lng, created_at")
      .eq("job_id", jobId)
      .eq("user_id", fundiId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setActiveJob((prev) =>
          prev && prev.id === jobId ? { ...prev, fundi_lat: data.lat, fundi_lng: data.lng } : prev,
        );
      });

    const channel = supabase
      .channel(`job:${jobId}`, { config: { private: true } })
      .on("broadcast", { event: "location" }, ({ payload }) => {
        const row = payload as { user_id?: string; lat?: number; lng?: number };
        if (row.user_id !== fundiId || row.lat == null || row.lng == null) return;
        const lat = row.lat;
        const lng = row.lng;
        setActiveJob((prev) =>
          prev && prev.id === jobId ? { ...prev, fundi_lat: lat, fundi_lng: lng } : prev,
        );
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeJobId, activeJobFundiId]);

  // keep ref in sync for status transition detection
  const activeJobRef = useRef<ActiveJob | null>(null);
  useEffect(() => {
    activeJobRef.current = activeJob;
    onActiveJobChange?.(activeJob);
  }, [activeJob, onActiveJobChange]);

  // Look up fundi profile for active job
  const [activeFundi, setActiveFundi] = useState<{ name: string; phone: string | null } | null>(
    null,
  );
  useEffect(() => {
    if (!activeJob?.fundi_id) {
      setActiveFundi(null);
      return;
    }
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", activeJob.fundi_id)
      .maybeSingle()
      .then(({ data }) =>
        setActiveFundi({ name: data?.full_name ?? "Fundi", phone: data?.phone ?? null }),
      );
  }, [activeJob?.fundi_id]);

  const list = useMemo(() => {
    const arr = Object.values(fundis);
    if (!pos) return arr.map((f) => ({ f, km: 0 }));
    return arr
      .map((f) => ({
        f,
        km: haversineKm({ lat: pos[0], lng: pos[1] }, { lat: f.current_lat!, lng: f.current_lng! }),
      }))
      .sort((a, b) => a.km - b.km);
  }, [fundis, pos]);

  if (!pos) {
    return (
      <div className="h-full grid place-items-center text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Locating you…
        </div>
      </div>
    );
  }

  // While reverse-tracking, the map should follow the FUNDI marker, not the user.
  const fundiPos: [number, number] | null =
    activeJob && activeJob.fundi_lat != null && activeJob.fundi_lng != null
      ? [activeJob.fundi_lat, activeJob.fundi_lng]
      : null;

  const hasActive = !!activeJob;

  return (
    // Phone: the sheet overlays the map. Desktop: they sit side by side, so
    // the map keeps its full height instead of being covered by the form.
    <div className="relative h-full w-full lg:flex lg:flex-row">
      <div className="h-full w-full lg:order-last lg:w-auto lg:flex-1">
        <MapContainer
          center={pos}
          zoom={15}
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: "#0b1220" }}
        >
          <AutoResize />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {!hasActive && (
            <FitToFundis
              userPos={pos}
              fundiPositions={list.map(
                ({ f }) => [f.current_lat!, f.current_lng!] as [number, number],
              )}
              follow={follow}
            />
          )}
          {hasActive && reverseTrack && fundiPos && <CenterOn pos={fundiPos} />}

          <Marker position={pos} icon={userLocationIcon()}>
            <Popup>You are here</Popup>
          </Marker>

          {!hasActive &&
            list.map(({ f }) => (
              <Marker
                key={f.id}
                position={[f.current_lat!, f.current_lng!]}
                icon={servicePin(service)}
                eventHandlers={{ click: () => setFollow(false) }}
              />
            ))}

          {activeJob && (
            <ActiveJobLayer
              job={activeJob}
              userPos={pos}
              fundiName={activeFundi?.name ?? "Fundi"}
              fundiPhone={activeFundi?.phone ?? null}
              reverseTrack={reverseTrack}
              onReverseTrackChange={setReverseTrack}
              onClose={() => {
                setActiveJob(null);
                setReverseTrack(false);
              }}
            />
          )}
        </MapContainer>
      </div>

      {(!hideIdleSheet || activeJob) && (
        <BookingSheet
          service={service}
          setService={setService}
          pos={pos}
          activeJob={activeJob as unknown as Parameters<typeof BookingSheet>[0]["activeJob"]}
          onOpenChat={(jobId, title) => setChat({ jobId, title })}
          onClose={() => {
            setActiveJob(null);
            setReverseTrack(false);
          }}
        />
      )}
      <JobChat
        jobId={chat?.jobId ?? null}
        open={!!chat}
        onOpenChange={(o) => !o && setChat(null)}
        title={chat?.title ?? "Chat"}
      />
    </div>
  );
}
