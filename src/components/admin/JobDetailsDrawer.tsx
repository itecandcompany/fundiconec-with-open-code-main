import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SERVICE_META, formatTsh, type ServiceKey } from "@/lib/geo";
import type { Database } from "@/integrations/supabase/types";
import SignedImage, { useSignedJobPhotoUrl } from "@/components/SignedImage";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errorMessages";
import { STATUS_COLORS, STATUS_TONE, type JobStatus } from "@/lib/jobStatus";
import {
  Search,
  MessageSquareQuote,
  CheckCircle2,
  Navigation2,
  MapPin,
  Wrench,
  Flag,
  XCircle,
  Clock,
  User,
  Phone,
  ChevronLeft,
  ChevronRight,
  X as XIcon,
  UserCog,
} from "lucide-react";

export type JobDetailsRow = {
  id: string;
  client_id: string;
  fundi_id: string | null;
  service: ServiceKey;
  status: JobStatus;
  price: number;
  agreed_price: number | null;
  client_address: string | null;
  problem_title: string | null;
  problem_description: string | null;
  job_photos: string[] | null;
  created_at: string;
  updated_at: string;
  arrived_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
};

type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: string;
  avatar_url: string | null;
};

type TimelineEntry = {
  key: string;
  label: string;
  at: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  note?: string;
};

function buildTimeline(job: JobDetailsRow): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  entries.push({
    key: "created",
    label: "Job created · searching for fundi",
    at: job.created_at,
    icon: Search,
    tone: STATUS_TONE.searching,
  });
  if (job.fundi_id && (job.status === "quoting" || job.agreed_price != null)) {
    entries.push({
      key: "quoting",
      label: "Negotiation / quoting",
      at: job.updated_at,
      icon: MessageSquareQuote,
      tone: STATUS_TONE.quoting,
    });
  }
  if (
    job.fundi_id &&
    ["accepted", "on_the_way", "arrived", "in_progress", "completed"].includes(job.status)
  ) {
    entries.push({
      key: "accepted",
      label: "Fundi accepted",
      at: job.updated_at,
      icon: CheckCircle2,
      tone: STATUS_TONE.accepted,
    });
  }
  if (job.arrived_at) {
    entries.push({
      key: "arrived",
      label: "Fundi arrived on site",
      at: job.arrived_at,
      icon: Navigation2,
      tone: STATUS_TONE.arrived,
    });
  }
  if (job.status === "in_progress" || job.completed_at) {
    entries.push({
      key: "in_progress",
      label: "Work in progress",
      at: job.arrived_at ?? job.updated_at,
      icon: Wrench,
      tone: STATUS_TONE.in_progress,
    });
  }
  if (job.completed_at) {
    entries.push({
      key: "completed",
      label: "Job completed",
      at: job.completed_at,
      icon: Flag,
      tone: STATUS_TONE.completed,
    });
  }
  if (job.cancelled_at) {
    entries.push({
      key: "cancelled",
      label: "Job cancelled",
      at: job.cancelled_at,
      icon: XCircle,
      tone: STATUS_TONE.cancelled,
      note: job.cancellation_reason ?? undefined,
    });
  }
  return entries.sort((a, b) => +new Date(a.at) - +new Date(b.at));
}

function PartyCard({ title, profile }: { title: string; profile: Profile | null }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      {profile ? (
        <>
          <div className="flex items-center gap-2 font-medium text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            {profile.full_name}
          </div>
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              className="mt-1 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Phone className="h-3 w-3" /> {profile.phone}
            </a>
          )}
          <div className="mt-1 text-[10px] uppercase text-muted-foreground">{profile.role}</div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Unassigned</div>
      )}
    </div>
  );
}

export default function JobDetailsDrawer({
  job,
  open,
  onOpenChange,
}: {
  job: JobDetailsRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [client, setClient] = useState<Profile | null>(null);
  const [fundi, setFundi] = useState<Profile | null>(null);
  const [canceller, setCanceller] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [candidates, setCandidates] = useState<{ id: string; full_name: string }[]>([]);
  const [pickedFundi, setPickedFundi] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const photos = job?.job_photos ?? [];
  const jobId = job?.id;
  const jobClientId = job?.client_id;
  const jobFundiId = job?.fundi_id;
  const jobCancelledBy = job?.cancelled_by;
  const lightboxSrc = useSignedJobPhotoUrl(lightboxIndex !== null ? photos[lightboxIndex] : null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Swipe thresholds (in CSS pixels). Tuned for consistent feel across devices.
  const SWIPE_THRESHOLD_X = 50;
  const SWIPE_THRESHOLD_Y = 70;

  // Per-job last viewed photo index — restored when reopening the lightbox.
  const lastIndexByJob = useRef<Map<string, number>>(new Map());

  // Tap/click debounce so finishing a swipe doesn't trigger a close.
  const TAP_DEBOUNCE_MS = 250;
  const lastGestureEnd = useRef<number>(0);
  const isClickSuppressed = () => Date.now() - lastGestureEnd.current < TAP_DEBOUNCE_MS;

  // Reduced motion.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Zoom + pan state.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;
  const DOUBLE_TAP_ZOOM = 2.5;
  const imgWrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef<number>(1);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const lastTapAt = useRef<number>(0);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Clamp pan within bounds based on current zoom and rendered image size.
  const clampPan = useCallback((px: number, py: number, z: number) => {
    const el = imgRef.current;
    const wrap = imgWrapRef.current;
    if (!el || !wrap) return { x: px, y: py };
    const rect = el.getBoundingClientRect();
    // rect already reflects scaled size since transform: scale is applied.
    const baseW = rect.width / z;
    const baseH = rect.height / z;
    const overflowX = Math.max(0, (baseW * z - wrap.clientWidth) / 2);
    const overflowY = Math.max(0, (baseH * z - wrap.clientHeight) / 2);
    return {
      x: Math.max(-overflowX, Math.min(overflowX, px)),
      y: Math.max(-overflowY, Math.min(overflowY, py)),
    };
  }, []);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevPhoto = useCallback(
    () => setLightboxIndex((i) => (i == null ? i : (i - 1 + photos.length) % photos.length)),
    [photos.length],
  );
  const nextPhoto = useCallback(
    () => setLightboxIndex((i) => (i == null ? i : (i + 1) % photos.length)),
    [photos.length],
  );

  // Reset zoom whenever the displayed photo changes.
  useEffect(() => {
    resetZoom();
  }, [lightboxIndex, resetZoom]);

  // Remember last viewed index per job.
  useEffect(() => {
    if (lightboxIndex != null && jobId) {
      lastIndexByJob.current.set(jobId, lightboxIndex);
    }
  }, [lightboxIndex, jobId]);

  const openLightboxAt = useCallback((i: number) => {
    setLightboxIndex(i);
  }, []);

  useEffect(() => {
    if (lightboxIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") {
        if (zoom === 1) prevPhoto();
      } else if (e.key === "ArrowRight") {
        if (zoom === 1) nextPhoto();
      } else if (e.key === "0") {
        resetZoom();
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => Math.min(MAX_ZOOM, z + 0.5));
      } else if (e.key === "-") {
        setZoom((z) => {
          const next = Math.max(MIN_ZOOM, z - 0.5);
          if (next === 1) setPan({ x: 0, y: 0 });
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, closeLightbox, prevPhoto, nextPhoto, zoom, resetZoom]);

  // Focus trap: focus the lightbox container when opened, restore on close.
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (lightboxIndex == null) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    // Defer to ensure the node is mounted.
    const t = window.setTimeout(() => lightboxRef.current?.focus(), 0);
    const onKeyTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = lightboxRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyTrap);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKeyTrap);
      lastFocusedRef.current?.focus?.();
    };
  }, [lightboxIndex]);

  // Scroll-lock the page behind the lightbox while it is open.
  useEffect(() => {
    if (lightboxIndex == null || typeof document === "undefined") return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevTouchAction = body.style.touchAction;
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    return () => {
      body.style.overflow = prevOverflow;
      body.style.touchAction = prevTouchAction;
    };
  }, [lightboxIndex]);

  useEffect(() => {
    setReassigning(false);
    setCandidates([]);
    setPickedFundi("");
  }, [jobId]);

  useEffect(() => {
    if (!jobClientId) {
      setClient(null);
      setFundi(null);
      setCanceller(null);
      return;
    }
    const ids = Array.from(
      new Set([jobClientId, jobFundiId, jobCancelledBy].filter(Boolean) as string[]),
    );
    supabase
      .from("profiles")
      .select("id, full_name, phone, role, avatar_url")
      .in("id", ids)
      .then(({ data }) => {
        const map = new Map<string, Profile>();
        for (const r of (data as Profile[]) ?? []) map.set(r.id, r);
        setClient(map.get(jobClientId) ?? null);
        setFundi(jobFundiId ? (map.get(jobFundiId) ?? null) : null);
        setCanceller(jobCancelledBy ? (map.get(jobCancelledBy) ?? null) : null);
      });
  }, [jobClientId, jobFundiId, jobCancelledBy]);

  const startReassign = async () => {
    if (!job) return;
    setReassigning(true);
    const { data: fundiRows } = await supabase
      .from("fundis")
      .select("id")
      .eq("service", job.service);
    const ids = (fundiRows ?? []).map((f) => f.id).filter((id) => id !== job.fundi_id);
    if (ids.length === 0) {
      setCandidates([]);
      return;
    }
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    setCandidates((profileRows as { id: string; full_name: string }[]) ?? []);
  };

  const confirmReassign = async () => {
    if (!job || !pickedFundi) return;
    setBusy(true);
    const patch: Database["public"]["Tables"]["jobs"]["Update"] = { fundi_id: pickedFundi };
    if (job.status === "searching" || job.status === "quoting") patch.status = "accepted";
    const { error } = await supabase.from("jobs").update(patch).eq("id", job.id);
    setBusy(false);
    if (error) {
      toast.error(toUserMessage(error));
      return;
    }
    toast.success("Fundi reassigned");
    onOpenChange(false);
  };

  const forceComplete = async () => {
    if (!job) return;
    setBusy(true);
    const { error } = await supabase
      .from("jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id);
    setBusy(false);
    if (error) {
      toast.error(toUserMessage(error));
      return;
    }
    toast.success("Job marked complete");
    onOpenChange(false);
  };

  if (!job) return null;
  const meta = SERVICE_META[job.service];
  const timeline = buildTimeline(job);
  const finalPrice = Number(job.agreed_price ?? job.price);
  const commission = Math.round(finalPrice * 0.1);

  const handleThumbClick = (i: number) => {
    const remembered = job ? lastIndexByJob.current.get(job.id) : undefined;
    // If reopening (lightbox closed) and clicking the same strip, prefer remembered index.
    // Here we always honor explicit thumbnail click; remembered index is used elsewhere if needed.
    void remembered;
    openLightboxAt(i);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
          <SheetHeader className="p-5 pb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                style={{ background: meta?.color, color: "white" }}
              >
                {meta && <meta.Icon className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">
                  {job.problem_title ?? meta?.label ?? "Job"}
                </SheetTitle>
                <SheetDescription className="truncate text-xs">{job.id}</SheetDescription>
              </div>
              <Badge className={`${STATUS_COLORS[job.status]} border-transparent capitalize`}>
                {job.status.replace(/_/g, " ")}
              </Badge>
            </div>
          </SheetHeader>

          <div className="px-5 pb-8 space-y-5">
            {/* Pricing */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Quoted</div>
                <div className="text-sm font-semibold">{formatTsh(Number(job.price))}</div>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Agreed</div>
                <div className="text-sm font-semibold">
                  {job.agreed_price != null ? formatTsh(finalPrice) : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Commission 10%</div>
                <div className="text-sm font-semibold">{formatTsh(commission)}</div>
              </div>
            </div>

            {/* Parties */}
            <div className="grid grid-cols-2 gap-2">
              <PartyCard title="Client" profile={client} />
              <PartyCard title="Fundi" profile={fundi} />
            </div>

            {/* Admin actions */}
            {job.status !== "completed" && job.status !== "cancelled" && (
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Admin actions
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.fundi_id && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={forceComplete}>
                      <Flag className="h-3.5 w-3.5 mr-1" /> Force complete
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => (reassigning ? setReassigning(false) : startReassign())}
                  >
                    <UserCog className="h-3.5 w-3.5 mr-1" />
                    {job.fundi_id ? "Reassign fundi" : "Assign fundi"}
                  </Button>
                </div>
                {reassigning && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      className="flex-1 min-w-0 rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={pickedFundi}
                      onChange={(e) => setPickedFundi(e.target.value)}
                    >
                      <option value="">
                        {candidates.length ? "Choose a fundi…" : "No other fundis for this service"}
                      </option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" disabled={!pickedFundi || busy} onClick={confirmReassign}>
                      Confirm
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Problem */}
            {(job.problem_description || (job.job_photos?.length ?? 0) > 0) && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Problem details
                </div>
                {job.problem_description && (
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {job.problem_description}
                  </p>
                )}
                {(job.job_photos?.length ?? 0) > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {job.job_photos!.map((src, i) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => handleThumbClick(i)}
                        className="shrink-0 rounded-lg overflow-hidden border focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label={`Open photo ${i + 1}`}
                      >
                        <SignedImage
                          src={src}
                          alt={`Job photo ${i + 1}`}
                          className="h-20 w-20 object-cover hover:opacity-90 transition-opacity"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Address */}
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{job.client_address ?? "Pinned location"}</span>
            </div>

            <Separator />

            {/* Timeline */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                Status history
              </div>
              <ol className="relative ml-2 border-l border-border space-y-4 pl-4">
                {timeline.map((e) => {
                  const Icon = e.icon;
                  return (
                    <li key={e.key} className="relative">
                      <span className="absolute -left-[22px] top-0.5 grid place-items-center w-5 h-5 rounded-full bg-background border">
                        <Icon className={`h-3 w-3 ${e.tone}`} />
                      </span>
                      <div className="text-sm font-medium">{e.label}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(e.at).toLocaleString()}
                      </div>
                      {e.note && <div className="mt-1 text-xs text-destructive">{e.note}</div>}
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Cancellation */}
            {job.cancelled_at && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold text-destructive">
                  <XCircle className="h-4 w-4" /> Cancellation
                </div>
                <div className="mt-1 text-destructive/90">
                  {job.cancellation_reason ?? "No reason provided."}
                </div>
                <div className="mt-1 text-xs text-destructive/70">
                  {new Date(job.cancelled_at).toLocaleString()}
                  {canceller ? ` · by ${canceller.full_name}` : ""}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {lightboxIndex != null &&
        photos[lightboxIndex] &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={lightboxRef}
            tabIndex={-1}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
            onClick={() => {
              if (isClickSuppressed()) return;
              if (zoom !== 1) return;
              closeLightbox();
            }}
            onTouchStart={(e) => {
              if (e.touches.length === 2) {
                const [a, b] = [e.touches[0], e.touches[1]];
                const dx = a.clientX - b.clientX;
                const dy = a.clientY - b.clientY;
                pinchStartDist.current = Math.hypot(dx, dy);
                pinchStartZoom.current = zoom;
                touchStartX.current = null;
                touchStartY.current = null;
                return;
              }
              const t = e.touches[0];
              touchStartX.current = t.clientX;
              touchStartY.current = t.clientY;
              if (zoom > 1) {
                panStart.current = {
                  x: t.clientX,
                  y: t.clientY,
                  px: pan.x,
                  py: pan.y,
                };
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 2 && pinchStartDist.current != null) {
                const [a, b] = [e.touches[0], e.touches[1]];
                const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                const ratio = dist / pinchStartDist.current;
                const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartZoom.current * ratio));
                setZoom(next);
                if (next === 1) setPan({ x: 0, y: 0 });
                e.preventDefault();
                return;
              }
              if (zoom > 1 && panStart.current && e.touches.length === 1) {
                const t = e.touches[0];
                const nx = panStart.current.px + (t.clientX - panStart.current.x);
                const ny = panStart.current.py + (t.clientY - panStart.current.y);
                setPan(clampPan(nx, ny, zoom));
                e.preventDefault();
              }
            }}
            onTouchEnd={(e) => {
              // End of pinch
              if (pinchStartDist.current != null && e.touches.length < 2) {
                pinchStartDist.current = null;
                lastGestureEnd.current = Date.now();
                return;
              }
              // End of pan
              if (panStart.current) {
                panStart.current = null;
                lastGestureEnd.current = Date.now();
                return;
              }
              if (touchStartX.current == null || touchStartY.current == null) return;
              const t = e.changedTouches[0];
              const dx = t.clientX - touchStartX.current;
              const dy = t.clientY - touchStartY.current;
              touchStartX.current = null;
              touchStartY.current = null;
              const absX = Math.abs(dx);
              const absY = Math.abs(dy);

              // Double-tap to zoom (only when not currently swiping).
              if (absX < 10 && absY < 10) {
                const now = Date.now();
                if (now - lastTapAt.current < 300) {
                  if (zoom === 1) {
                    setZoom(DOUBLE_TAP_ZOOM);
                  } else {
                    resetZoom();
                  }
                  lastTapAt.current = 0;
                  lastGestureEnd.current = now;
                  return;
                }
                lastTapAt.current = now;
                return; // let onClick handle single-tap close
              }

              lastGestureEnd.current = Date.now();

              // Don't navigate/close via swipe while zoomed in.
              if (zoom > 1) return;

              if (absY > absX && absY > SWIPE_THRESHOLD_Y) {
                // Vertical swipe (up or down) closes the lightbox.
                closeLightbox();
              } else if (absX > SWIPE_THRESHOLD_X && absX > absY && photos.length > 1) {
                if (dx < 0) nextPhoto();
                else prevPhoto();
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Photo viewer"
          >
            <span className="sr-only" aria-live="polite" aria-atomic="true">
              Photo {lightboxIndex + 1} of {photos.length}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeLightbox();
              }}
              className="absolute top-4 right-4 grid place-items-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
              aria-label="Close"
            >
              <XIcon className="h-5 w-5" />
            </button>
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    prevPhoto();
                  }}
                  className="absolute left-3 md:left-6 grid place-items-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    nextPhoto();
                  }}
                  className="absolute right-3 md:right-6 grid place-items-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
            <div
              ref={imgWrapRef}
              className="relative max-h-[90vh] max-w-[92vw] overflow-hidden"
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (zoom === 1) setZoom(DOUBLE_TAP_ZOOM);
                else resetZoom();
              }}
            >
              <img
                ref={imgRef}
                src={lightboxSrc ?? undefined}
                alt={`Job photo ${lightboxIndex + 1} of ${photos.length}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isClickSuppressed()) return;
                  if (zoom !== 1) return;
                  closeLightbox();
                }}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transition: reducedMotion
                    ? "none"
                    : panStart.current || pinchStartDist.current
                      ? "none"
                      : "transform 150ms ease-out",
                  cursor: zoom > 1 ? "grab" : "zoom-in",
                  touchAction: "none",
                }}
                className="max-h-[90vh] max-w-[92vw] object-contain rounded-lg shadow-2xl select-none"
                draggable={false}
              />
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/40 px-3 py-1 rounded-full">
              {lightboxIndex + 1} / {photos.length}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
