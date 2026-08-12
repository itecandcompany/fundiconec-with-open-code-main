import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SERVICE_META, formatTsh, haversineKm, etaMinutes, type ServiceKey } from "@/lib/geo";
import { uploadJobPhotos } from "@/lib/jobPhotos";
import RadarPulse from "./RadarPulse";
import SignedImage from "@/components/SignedImage";
import {
  Camera,
  ChevronUp,
  ChevronDown,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  X,
  Check,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errorMessages";
import JobReceiptDialog from "@/components/JobReceiptDialog";
import CancelJobDialog from "@/components/CancelJobDialog";
import { useT, useI18n, type TFunc } from "@/lib/i18n";

type ProblemTemplate = {
  id: string;
  service: ServiceKey;
  title: string;
  description: string | null;
  suggested_price: number;
};

type Quote = {
  id: string;
  job_id: string;
  fundi_id: string;
  price: number;
  note: string | null;
  status: string;
  created_at: string;
};

type FundiProfile = {
  id: string;
  full_name: string;
  phone: string | null;
  rating: number;
  total_jobs: number;
  current_lat: number | null;
  current_lng: number | null;
};

type ActiveJob = {
  id: string;
  service: ServiceKey;
  status:
    | "searching"
    | "quoting"
    | "accepted"
    | "on_the_way"
    | "arrived"
    | "in_progress"
    | "completed"
    | "cancelled";
  fundi_id: string | null;
  agreed_price: number | null;
  price: number;
  problem_title: string | null;
  problem_description: string | null;
  job_photos: string[];
  client_lat: number;
  client_lng: number;
  fundi_lat: number | null;
  fundi_lng: number | null;
  started_at?: string | null;
  before_photos?: string[];
  after_photos?: string[];
  signature_url?: string | null;
};

const stageLabel = (t: TFunc, status: ActiveJob["status"]) => t(`status.${status}`);

export default function BookingSheet({
  service,
  setService,
  pos,
  activeJob,
  onOpenChat,
  chatUnreadCount = 0,
  onClose,
  onPickQuoteFundi,
}: {
  service: ServiceKey;
  setService: (s: ServiceKey) => void;
  pos: [number, number] | null;
  activeJob: ActiveJob | null;
  onOpenChat: (jobId: string, title: string) => void;
  chatUnreadCount?: number;
  onClose: () => void;
  onPickQuoteFundi?: (fundiId: string) => void;
}) {
  const { t, lang } = useI18n();
  // SERVICE_META already carries both names ("Electrician" / "Umeme"), so the
  // dictionary doesn't need to duplicate them.
  const serviceName = (k: ServiceKey) =>
    lang === "sw" ? SERVICE_META[k].sw : SERVICE_META[k].label;
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [templates, setTemplates] = useState<ProblemTemplate[]>([]);
  const [pickedTemplate, setPickedTemplate] = useState<ProblemTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState<string>("");
  const [urgency, setUrgency] = useState<"now" | "today" | "schedule">("now");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [detailQuote, setDetailQuote] = useState<Quote | null>(null);
  const [fundiProfiles, setFundiProfiles] = useState<Record<string, FundiProfile>>({});
  const [activeFundi, setActiveFundi] = useState<FundiProfile | null>(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeJobId = activeJob?.id;
  const activeJobStatus = activeJob?.status;

  // Fetch templates for current service
  useEffect(() => {
    if (activeJobId) return;
    supabase
      .from("problem_templates")
      .select("*")
      .eq("service", service)
      .eq("is_active", true)
      .order("suggested_price", { ascending: true })
      .then(({ data }) => setTemplates((data as ProblemTemplate[]) ?? []));
    setPickedTemplate(null);
    setTitle("");
    setBudget("");
  }, [service, activeJobId]);

  // Subscribe to quotes for the active job
  useEffect(() => {
    if (!activeJobId || !["searching", "quoting"].includes(activeJobStatus ?? "")) {
      setQuotes([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("job_quotes")
        .select("*")
        .eq("job_id", activeJobId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const qs = (data as Quote[]) ?? [];
      setQuotes(qs);
      const ids = Array.from(new Set(qs.map((q) => q.fundi_id)));
      if (ids.length) {
        const [{ data: profs }, { data: fs }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, phone").in("id", ids),
          supabase
            .from("fundis")
            .select("id, rating, total_jobs, current_lat, current_lng")
            .in("id", ids),
        ]);
        const next: Record<string, FundiProfile> = {};
        for (const id of ids) {
          const p = profs?.find((x) => x.id === id);
          const f = fs?.find((x) => x.id === id);
          next[id] = {
            id,
            full_name: p?.full_name ?? "Fundi",
            phone: p?.phone ?? null,
            rating: f?.rating ?? 5,
            total_jobs: f?.total_jobs ?? 0,
            current_lat: f?.current_lat ?? null,
            current_lng: f?.current_lng ?? null,
          };
        }
        setFundiProfiles(next);
      }
    };
    load();
    const ch = supabase
      .channel(`quotes-${activeJobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_quotes", filter: `job_id=eq.${activeJobId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [activeJobId, activeJobStatus]);

  // Active fundi profile
  useEffect(() => {
    if (!activeJob?.fundi_id) {
      setActiveFundi(null);
      return;
    }
    const id = activeJob.fundi_id;
    Promise.all([
      supabase.from("profiles").select("full_name, phone").eq("id", id).maybeSingle(),
      supabase
        .from("fundis")
        .select("rating, total_jobs, current_lat, current_lng")
        .eq("id", id)
        .maybeSingle(),
    ]).then(([{ data: p }, { data: f }]) =>
      setActiveFundi({
        id,
        full_name: p?.full_name ?? "Fundi",
        phone: p?.phone ?? null,
        rating: f?.rating ?? 5,
        total_jobs: f?.total_jobs ?? 0,
        current_lat: f?.current_lat ?? null,
        current_lng: f?.current_lng ?? null,
      }),
    );
  }, [activeJob?.fundi_id]);

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).slice(0, 5);
    setFiles(arr);
  };

  const submitRequest = async () => {
    if (!user || !pos) {
      toast.error("Waiting for your GPS…");
      return;
    }
    const finalTitle = pickedTemplate?.title || title.trim();
    if (!finalTitle) {
      toast.error("Describe the problem in a short title");
      return;
    }
    const numericBudget = Number(budget);
    const suggested = pickedTemplate?.suggested_price ?? SERVICE_META[service].price;
    const startingPrice = numericBudget > 0 ? numericBudget : suggested;
    setSubmitting(true);
    let photoUrls: string[] = [];
    let failedPhotoCount = 0;
    if (files.length) {
      const uploaded = await uploadJobPhotos(user.id, files);
      photoUrls = uploaded.paths;
      failedPhotoCount = uploaded.failedCount;
    }
    const commission = Math.round(startingPrice * 0.1);
    const basePayload = {
      client_id: user.id,
      service,
      price: startingPrice,
      commission,
      status: "searching" as const,
      client_lat: pos[0],
      client_lng: pos[1],
      problem_title: finalTitle,
      problem_description: description.trim() || null,
      job_photos: photoUrls,
    };
    let { error } = await supabase.from("jobs").insert({ ...basePayload, urgency });
    // The `urgency` column may not be migrated onto this database yet — an
    // unmigrated, non-essential preference field shouldn't block the whole
    // booking. Retry once without it rather than failing the request.
    let urgencyDropped = false;
    if (
      error &&
      // 42703: raw Postgres "undefined column". PGRST204: PostgREST's own
      // schema-cache validation rejects an insert payload key it doesn't
      // recognize — this is the one Supabase actually returns here.
      (error.code === "42703" || error.code === "PGRST204") &&
      /urgency/i.test(error.message)
    ) {
      urgencyDropped = true;
      ({ error } = await supabase.from("jobs").insert(basePayload));
    }
    setSubmitting(false);
    if (error) {
      toast.error(toUserMessage(error));
      return;
    }
    toast.success("Request sent — fundis are sending quotes");
    if (urgencyDropped) {
      toast.message(
        "Note: your timing preference wasn't saved this time — everything else went through fine.",
      );
    }
    if (failedPhotoCount > 0) {
      toast.error(
        `${failedPhotoCount} photo${failedPhotoCount > 1 ? "s" : ""} failed to upload — job was still submitted.`,
      );
    }
    setFiles([]);
    setDescription("");
    setUrgency("now");
  };

  const cancel = async (reason: string) => {
    if (!activeJob) return;
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
        .eq("id", activeJob.id);
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

  const acceptQuote = async (q: Quote) => {
    if (!activeJob) return;
    const { error } = await supabase
      .from("jobs")
      .update({
        fundi_id: q.fundi_id,
        agreed_price: q.price,
        price: q.price,
        status: "accepted",
      })
      .eq("id", activeJob.id);
    if (error) {
      toast.error(toUserMessage(error));
      return;
    }
    const [{ error: acceptErr }, { error: declineErr }] = await Promise.all([
      supabase.from("job_quotes").update({ status: "accepted" }).eq("id", q.id),
      supabase
        .from("job_quotes")
        .update({ status: "declined" })
        .eq("job_id", activeJob.id)
        .neq("id", q.id),
    ]);
    onPickQuoteFundi?.(q.fundi_id);
    toast.success("Fundi confirmed — they're on the way");
    // The job itself is already accepted at this point (checked above) —
    // these are secondary bookkeeping updates, so a failure here shouldn't
    // undo the acceptance, just flag that the quote records may be stale.
    if (acceptErr || declineErr) {
      toast.error("Quote records may be out of sync — the job itself was accepted fine.");
    }
  };

  const submitRating = async () => {
    if (!activeJob || !user || !activeJob.fundi_id || rating === 0) return;
    const { error } = await supabase.from("ratings").insert({
      job_id: activeJob.id,
      client_id: user.id,
      fundi_id: activeJob.fundi_id,
      stars: rating,
      review: review.trim() || null,
    });
    if (error) {
      toast.error(toUserMessage(error));
      return;
    }
    toast.success("Thanks for the feedback");
    setReceiptOpen(true);
  };

  // ----- RENDER -----

  // Stage 0 — Idle: service picker + custom problem form
  if (!activeJob) {
    return (
      <Shell expanded={expanded} setExpanded={setExpanded}>
        <div className="px-4">
          <h2 className="text-2xl font-display font-bold leading-tight">{t("booking.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("booking.subtitle")}</p>
        </div>

        {/* Service tiles */}
        <div className="px-4 mt-4 flex gap-2.5 overflow-x-auto scrollbar-none">
          {(Object.keys(SERVICE_META) as ServiceKey[]).map((k) => {
            const s = SERVICE_META[k];
            const active = service === k;
            return (
              <button
                key={k}
                aria-pressed={active}
                onClick={() => {
                  setService(k);
                  // Picking a service *is* the intent to book, so open the form
                  // with it. Without this the sheet stays collapsed on phones
                  // and the tap looks like it did nothing — the form is there,
                  // but hidden below the fold behind the drag handle.
                  setExpanded(true);
                }}
                className={`shrink-0 w-26 flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition-colors ${
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary"
                }`}
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center">
                  <s.Icon className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-[13px] font-medium leading-tight">{s.sw}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{s.label}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Collapsed by default on phones so the map stays visible; the desktop
            panel has the room to always show the full form. */}
        <div className={`px-4 mt-4 space-y-4 pb-6 lg:block ${expanded ? "" : "hidden"}`}>
          {/* Templates */}
          {templates.length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-2">
                {t("booking.commonProblems")}
              </div>
              <div className="flex flex-wrap gap-2">
                {templates.map((tpl) => {
                  const active = pickedTemplate?.id === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        setPickedTemplate(active ? null : tpl);
                        if (!active) {
                          setTitle(tpl.title);
                          setBudget(String(tpl.suggested_price));
                        }
                      }}
                      className={`text-left rounded-xl px-3 py-2 border text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary"
                      }`}
                    >
                      <div className="font-medium">{tpl.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t("booking.from", { price: formatTsh(tpl.suggested_price) })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Input
              placeholder={t("booking.problemPlaceholder")}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setPickedTemplate(null);
              }}
            />
            <Textarea
              placeholder={t("booking.detailsPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <Input
              type="number"
              inputMode="numeric"
              placeholder={t("booking.budgetPlaceholder", {
                price: pickedTemplate?.suggested_price ?? SERVICE_META[service].price,
              })}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <span className="text-sm font-semibold">{t("booking.photos")}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("booking.photosAdded", { count: files.length })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("booking.photosHint")}</p>
            <div className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative aspect-square">
                  <img
                    alt=""
                    src={URL.createObjectURL(f)}
                    className="h-full w-full object-cover rounded-xl border"
                  />
                  <button
                    type="button"
                    onClick={() => setFiles((arr) => arr.filter((_, idx) => idx !== i))}
                    aria-label={t("booking.removePhoto")}
                    className="absolute top-1 right-1 bg-background/90 border rounded-full p-1 shadow-sm"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {files.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed grid place-items-center gap-1 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  <Camera className="h-5 w-5" />
                  <span className="text-[11px] font-medium">{t("booking.addPhoto")}</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </div>
          </div>

          {/* Urgency */}
          <div>
            <div className="text-sm font-semibold mb-2">{t("booking.whenNeeded")}</div>
            <div className="flex bg-muted border rounded-xl p-1 gap-1">
              {(
                [
                  ["now", "booking.now"],
                  ["today", "booking.today"],
                  ["schedule", "booking.schedule"],
                ] as const
              ).map(([value, labelKey]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setUrgency(value)}
                  className={`flex-1 py-2.5 text-center rounded-lg text-[13px] font-medium transition-colors ${
                    urgency === value
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/80 hover:bg-background/60"
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          <Button className="w-full h-12 text-base" onClick={submitRequest} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {t("booking.request", { service: serviceName(service) })}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </Shell>
    );
  }

  // Stage: Searching / Quoting
  if (activeJob.status === "searching" || activeJob.status === "quoting") {
    return (
      <Shell expanded={expanded} setExpanded={setExpanded}>
        <div className="px-4 pb-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase text-muted-foreground">
                {stageLabel(t, activeJob.status)}
              </div>
              <div className="font-display font-bold text-lg leading-tight">
                {activeJob.problem_title}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("booking.cancelRequest")}
              onClick={() => setCancelOpen(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {quotes.length === 0 ? (
            <div className="grid place-items-center py-6">
              <RadarPulse />
              <div className="mt-3 text-sm text-muted-foreground">{t("booking.searching")}</div>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-muted-foreground">
                {t(quotes.length === 1 ? "booking.responded" : "booking.respondedPlural", {
                  count: quotes.length,
                })}
              </div>
              {quotes.map((q) => {
                const fp = fundiProfiles[q.fundi_id];
                const km =
                  pos && fp?.current_lat && fp.current_lng
                    ? haversineKm(
                        { lat: pos[0], lng: pos[1] },
                        { lat: fp.current_lat, lng: fp.current_lng },
                      )
                    : 0;
                return (
                  <div
                    key={q.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailQuote(q)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setDetailQuote(q);
                    }}
                    className="w-full text-left border rounded-2xl p-3 flex items-center gap-3 hover:border-primary transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold">
                      {(fp?.full_name ?? "F").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {fp?.full_name ?? "Fundi"}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Star className="h-3 w-3 fill-accent text-accent" />
                        {(fp?.rating ?? 5).toFixed(1)} · {km.toFixed(1)} km · {etaMinutes(km || 1)}{" "}
                        min
                      </div>
                      {q.note && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          “{q.note}”
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-base">{formatTsh(q.price)}</div>
                      <div className="flex gap-1 mt-1">
                        {/* Real buttons, not role="button" spans: as spans these
                            took focus but had no key handler, so Enter/Space
                            did nothing. Keydown is stopped as well as click so
                            activating them doesn't also fire the card's own
                            "open details" handler. */}
                        <button
                          type="button"
                          aria-label={t("booking.messageFundi")}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenChat(activeJob.id, fp?.full_name ?? "Fundi");
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="inline-flex h-7 items-center rounded-md border px-2 text-xs hover:bg-muted"
                        >
                          <MessageCircle className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            acceptQuote(q);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          <Check className="h-3 w-3" /> {t("booking.accept")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <CancelJobDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          onSubmit={cancel}
          busy={cancelling}
          who="the fundi"
        />
        <QuoteDetailsDialog
          quote={detailQuote}
          fundi={detailQuote ? fundiProfiles[detailQuote.fundi_id] : undefined}
          job={activeJob}
          open={!!detailQuote}
          onOpenChange={(o) => !o && setDetailQuote(null)}
          onApprove={(q) => {
            acceptQuote(q);
            setDetailQuote(null);
          }}
          onChat={(q) => {
            onOpenChat(activeJob.id, fundiProfiles[q.fundi_id]?.full_name ?? "Fundi");
            setDetailQuote(null);
          }}
        />
      </Shell>
    );
  }

  // Stage: completed — rate
  if (activeJob.status === "completed") {
    return (
      <Shell expanded={expanded} setExpanded={setExpanded}>
        <div className="px-4 pb-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-success/15 text-success grid place-items-center">
            <Check className="h-7 w-7" />
          </div>
          <div className="mt-2 font-display font-bold text-xl">{t("booking.jobComplete")}</div>
          <div className="text-sm text-muted-foreground">
            {t("booking.totalPaid", {
              price: formatTsh(activeJob.agreed_price ?? activeJob.price),
            })}
          </div>
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">
              {t("booking.howWas", { name: activeFundi?.full_name ?? "Fundi" })}
            </div>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n} star`}>
                  <Star
                    className={`h-7 w-7 ${
                      n <= rating ? "fill-accent text-accent" : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            <Textarea
              placeholder={t("booking.reviewPlaceholder")}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={2}
              className="mt-3"
            />
            <div className="flex gap-2 mt-3">
              <Button variant="outline" className="flex-1" onClick={() => setReceiptOpen(true)}>
                {t("booking.viewReceipt")}
              </Button>
              <Button className="flex-1" onClick={submitRating} disabled={rating === 0}>
                {t("common.submit")}
              </Button>
            </div>
          </div>
        </div>
        <JobReceiptDialog
          jobId={activeJob.id}
          open={receiptOpen}
          onOpenChange={(o) => {
            setReceiptOpen(o);
            if (!o) onClose();
          }}
          role="client"
        />
      </Shell>
    );
  }

  // Stage: accepted / on_the_way / arrived / in_progress — fundi card
  const fundiPos =
    activeJob.fundi_lat != null && activeJob.fundi_lng != null
      ? { lat: activeJob.fundi_lat, lng: activeJob.fundi_lng }
      : null;
  const km = pos && fundiPos ? haversineKm({ lat: pos[0], lng: pos[1] }, fundiPos) : 0;

  const jobMeta = SERVICE_META[activeJob.service];

  return (
    <Shell expanded={expanded} setExpanded={setExpanded}>
      <div className="px-4 pb-6 space-y-5">
        {/* ETA header */}
        <div className="text-center">
          <div className="font-display text-3xl font-bold text-primary leading-none">
            {etaMinutes(km || 1)} min
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{stageLabel(t, activeJob.status)}</p>
        </div>

        {/* Fundi profile card */}
        <div className="relative overflow-hidden rounded-2xl border bg-muted/40 p-4 flex items-center gap-4">
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-primary/5 pointer-events-none" />
          <div className="relative shrink-0">
            <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground grid place-items-center text-xl font-semibold border-2 border-background shadow-sm">
              {(activeFundi?.full_name ?? "F").charAt(0)}
            </div>
            <div className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-success border-2 border-background" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-lg leading-tight truncate">
              {activeFundi?.full_name ?? "Fundi"}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <span className="flex items-center gap-0.5 text-accent">
                <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                {(activeFundi?.rating ?? 5).toFixed(1)}
              </span>
              <span className="h-1 w-1 rounded-full bg-border" />
              {activeFundi?.total_jobs ?? 0} jobs
            </div>
          </div>
        </div>

        {/* Skill chip */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <jobMeta.Icon className="h-3.5 w-3.5" />
            {jobMeta.label}
          </span>
        </div>

        {/* Job summary panel */}
        <div className="rounded-2xl border p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("booking.currentJob")}
              </div>
              <div className="font-medium truncate">{activeJob.problem_title ?? jobMeta.label}</div>
            </div>
            <span className="shrink-0 rounded bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground">
              #{activeJob.id.slice(0, 6).toUpperCase()}
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t("booking.kmAway", { km: km.toFixed(1) })}</span>
            <span className="ml-auto font-semibold text-foreground">
              {formatTsh(activeJob.agreed_price ?? activeJob.price)}
            </span>
          </div>
        </div>

        {(activeJob.before_photos?.length ||
          activeJob.after_photos?.length ||
          activeJob.started_at) && (
          <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
            {activeJob.started_at && <WorkTimer startedAt={activeJob.started_at} />}
            {activeJob.before_photos && activeJob.before_photos.length > 0 && (
              <ProofRow label={t("booking.before")} urls={activeJob.before_photos} />
            )}
            {activeJob.after_photos && activeJob.after_photos.length > 0 && (
              <ProofRow label={t("booking.after")} urls={activeJob.after_photos} />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="relative flex-1 h-13 text-base"
            onClick={() => onOpenChat(activeJob.id, activeFundi?.full_name ?? "Fundi")}
          >
            <MessageCircle className="h-4 w-4" /> {t("booking.chat")}
            {chatUnreadCount > 0 && (
              <span
                aria-label={t("booking.unreadMessages", { count: chatUnreadCount })}
                className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground"
              >
                {chatUnreadCount > 9 ? "9+" : chatUnreadCount}
              </span>
            )}
          </Button>
          <Button asChild className="flex-1 h-13 text-base" disabled={!activeFundi?.phone}>
            <a href={activeFundi?.phone ? `tel:${activeFundi.phone}` : "#"}>
              <Phone className="h-4 w-4" /> {t("booking.call")}
            </a>
          </Button>
        </div>
        <button
          onClick={() => setCancelOpen(true)}
          className="w-full text-center text-sm font-medium text-destructive py-1 active:opacity-70 transition-opacity"
        >
          {t("booking.cancelRequest")}
        </button>
      </div>
      <CancelJobDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onSubmit={cancel}
        busy={cancelling}
        who="the fundi"
      />
    </Shell>
  );
}

function QuoteDetailsDialog({
  quote,
  fundi,
  job,
  open,
  onOpenChange,
  onApprove,
  onChat,
}: {
  quote: Quote | null;
  fundi: FundiProfile | undefined;
  job: ActiveJob;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApprove: (q: Quote) => void;
  onChat: (q: Quote) => void;
}) {
  // Must precede the early return — hooks can't sit behind a conditional.
  const t = useT();
  if (!quote) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("booking.quoteDetails")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-2xl border overflow-hidden">
            <div className="p-4 border-b bg-muted/40 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold">
                {(fundi?.full_name ?? "F").charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{fundi?.full_name ?? "Fundi"}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 fill-accent text-accent" />
                  {(fundi?.rating ?? 5).toFixed(1)} · {fundi?.total_jobs ?? 0} jobs
                </div>
              </div>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{t("common.total")}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t("booking.forJob", { title: job.problem_title ?? "" })}
                </div>
              </div>
              <div className="font-display text-2xl font-bold text-primary">
                {formatTsh(quote.price)}
              </div>
            </div>
            {quote.note && (
              <div className="px-4 pb-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                  {t("booking.fundiNote")}
                </div>
                <div className="bg-muted rounded-lg p-3 flex gap-2 items-start">
                  <p className="text-sm italic">"{quote.note}"</p>
                </div>
              </div>
            )}
            {job.job_photos?.length > 0 && (
              <div className="px-4 pb-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                  {t("booking.yourPhotos")}
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-none">
                  {job.job_photos.map((u, i) => (
                    <SignedImage
                      key={i}
                      src={u}
                      alt=""
                      className="h-16 w-16 object-cover rounded-lg border shrink-0"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button className="w-full h-12" onClick={() => onApprove(quote)}>
              {t("booking.approveQuote")}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => onChat(quote)}>
              <MessageCircle className="h-4 w-4" /> {t("booking.messageFundi")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return (
    <div className="text-xs text-muted-foreground">
      Work in progress · {h > 0 ? `${h}h ` : ""}
      {m}m elapsed
    </div>
  );
}

function ProofRow({ label, urls }: { label: string; urls: string[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground mb-1">{label}</div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {urls.map((u, i) => (
          <SignedImage
            key={i}
            src={u}
            alt=""
            className="h-16 w-16 object-cover rounded-lg border"
          />
        ))}
      </div>
    </div>
  );
}

function Shell({
  children,
  expanded,
  setExpanded,
}: {
  children: React.ReactNode;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  const t = useT();
  return (
    // Phone: a draggable sheet overlaying the map, collapsed by default so the
    // map stays visible. Desktop: a static left-hand panel beside the map, where
    // there's room to show the whole form at once — so the handle is hidden and
    // the collapse state stops applying (see the `lg:block` escapes below).
    <div className="absolute bottom-0 left-0 right-0 z-[1000] bolt-sheet pointer-events-auto lg:static lg:z-auto lg:flex lg:h-full lg:w-[420px] lg:shrink-0 lg:flex-col lg:rounded-none lg:border-r lg:shadow-none">
      <button
        className="w-full lg:hidden"
        aria-label={expanded ? t("booking.collapse") : t("booking.expand")}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="bolt-handle" />
      </button>
      <div className="max-h-[78vh] overflow-y-auto pb-3 lg:max-h-none lg:flex-1 lg:pt-6">
        {children}
      </div>
    </div>
  );
}
