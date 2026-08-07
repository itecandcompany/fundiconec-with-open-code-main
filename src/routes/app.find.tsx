import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import StepProgress from "@/components/StepProgress";
import { SERVICE_META, formatTsh, DEFAULT_CENTER } from "@/lib/geo";
import { clearFlow, loadFlow } from "@/lib/bookingFlow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import LiveMap from "@/components/LiveMap";
import type { ActiveJob } from "@/components/ActiveJobLayer";
import { ArrowLeft, Loader2, Send, MapPin } from "lucide-react";
import { toast } from "sonner";
import type { ServiceKey } from "@/lib/geo";
import { toUserMessage } from "@/lib/errorMessages";

export const Route = createFileRoute("/app/find")({
  ssr: false,
  component: FindPage,
});

function FindPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [service, setService] = useState<ServiceKey | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasActive, setHasActive] = useState<boolean | null>(null);
  const [requestOpen, setRequestOpen] = useState(true);

  const handleActiveJobChange = useCallback((j: ActiveJob | null) => {
    setHasActive(!!j);
  }, []);

  // Load flow + check for existing active job
  useEffect(() => {
    const f = loadFlow();
    if (!f.service) {
      navigate({ to: "/app/service", replace: true });
      return;
    }
    setService(f.service);
    setTitle(f.problemTitle);
    setDescription(f.description);
    setPhotoUrls(f.photoUrls);
  }, [navigate]);

  // Track user position for the request payload. A browser permission
  // prompt left unanswered never fires either geolocation callback, so the
  // `timeout` option alone isn't reliable — fall back on our own clock too.
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
    const id = navigator.geolocation.watchPosition(
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
      navigator.geolocation.clearWatch(id);
    };
  }, []);

  const submitRequest = async () => {
    if (!service) return;
    if (!user) {
      toast.error("You need to sign in first");
      return;
    }
    if (!pos) {
      toast.error("Waiting for your GPS…");
      return;
    }
    if (!title.trim()) {
      navigate({ to: "/app/describe" });
      return;
    }
    setSubmitting(true);
    const startingPrice = SERVICE_META[service].price;
    const commission = Math.round(startingPrice * 0.1);
    const { error } = await supabase.from("jobs").insert({
      client_id: user.id,
      service,
      price: startingPrice,
      commission,
      status: "searching",
      client_lat: pos[0],
      client_lng: pos[1],
      problem_title: title.trim(),
      problem_description: description.trim() || null,
      job_photos: photoUrls,
    });
    setSubmitting(false);
    if (error) {
      toast.error(toUserMessage(error));
      return;
    }
    toast.success("Request sent — fundis are sending quotes");
    clearFlow();
  };

  if (!service) return null;
  const meta = SERVICE_META[service];

  return (
    <div className="h-[100svh] flex flex-col bg-background">
      <header className="bg-background/90 backdrop-blur border-b z-20">
        <div className="px-4 py-3 flex items-center gap-3">
          {!hasActive && (
            <Button asChild variant="ghost" size="icon">
              <Link to="/app/describe">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold leading-tight truncate">Fundis near you</div>
            <div className="text-xs text-muted-foreground truncate">
              {meta.icon} {meta.label}
              {title ? ` · ${title}` : ""}
            </div>
          </div>
        </div>
        <div className="px-4 pb-2.5">
          <StepProgress step={3} />
        </div>
      </header>

      <div className="flex-1 relative">
        <LiveMap
          service={service}
          setService={(s) => setService(s)}
          hideIdleSheet
          onActiveJobChange={handleActiveJobChange}
        />

        {!pos && (
          <div className="absolute top-4 inset-x-0 z-[1090] flex justify-center pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background/95 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground shadow">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Locating your position…
            </div>
          </div>
        )}

        {hasActive === false && (
          <>
            <Drawer
              open={requestOpen}
              onOpenChange={setRequestOpen}
              modal={false}
              snapPoints={[0.5, 1]}
            >
              <DrawerContent className="mx-auto w-full max-w-2xl">
                <DrawerHeader className="text-left">
                  <DrawerTitle className="truncate">
                    {title || `Request a ${meta.label.toLowerCase()}`}
                  </DrawerTitle>
                  {description && (
                    <DrawerDescription className="line-clamp-2">{description}</DrawerDescription>
                  )}
                </DrawerHeader>
                <div className="px-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div
                      className="h-8 w-8 rounded-lg grid place-items-center text-base shrink-0"
                      style={{ background: meta.color + "22", color: meta.color }}
                    >
                      {meta.icon}
                    </div>
                    <div>
                      Starting price {formatTsh(meta.price)} · fundis quote back
                      {!pos && (
                        <span className="ml-2 inline-flex items-center gap-1 text-primary">
                          <MapPin className="h-3 w-3" /> Locating…
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 pb-[max(env(safe-area-inset-bottom),16px)]">
                    <Button asChild variant="outline" className="flex-1">
                      <Link to="/app/describe">Edit</Link>
                    </Button>
                    <Button
                      className="flex-[2] h-11"
                      onClick={submitRequest}
                      disabled={submitting || !pos}
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-1" />
                          Request fundi
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
            {!requestOpen && (
              <button
                onClick={() => setRequestOpen(true)}
                className="absolute inset-x-0 bottom-4 z-[1090] mx-auto w-fit rounded-full border bg-background/95 backdrop-blur px-4 py-2 text-sm font-medium shadow-lg"
              >
                Resume request
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
