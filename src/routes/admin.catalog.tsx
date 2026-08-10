import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { SERVICE_META, type ServiceKey, formatTsh } from "@/lib/geo";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { toUserMessage } from "@/lib/errorMessages";

export const Route = createFileRoute("/admin/catalog")({ component: CatalogAdmin });

type Template = {
  id: string;
  service: ServiceKey;
  title: string;
  description: string | null;
  suggested_price: number;
  is_active: boolean;
};

function CatalogAdmin() {
  const [rows, setRows] = useState<Template[]>([]);
  const [service, setService] = useState<ServiceKey>("plumber");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("problem_templates")
      .select("*")
      .order("service")
      .order("suggested_price");
    setRows((data as Template[]) ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!title.trim() || !Number(price)) {
      toast.error("Title and price are required");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("problem_templates").insert({
      service,
      title: title.trim(),
      description: description.trim() || null,
      suggested_price: Number(price),
    });
    setSubmitting(false);
    if (error) return toast.error(toUserMessage(error));
    toast.success("Problem template added");
    setTitle("");
    setDescription("");
    setPrice("");
    load();
  };

  const toggle = async (r: Template) => {
    const { error } = await supabase
      .from("problem_templates")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) return toast.error(toUserMessage(error));
    load();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("problem_templates").delete().eq("id", pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (error) return toast.error(toUserMessage(error));
    toast.success("Template deleted");
    load();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Problem Catalog</h1>
        <p className="text-sm text-muted-foreground">
          Define common problems and base prices clients can pick from when booking.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="font-display font-semibold">Add a problem template</div>
        <div className="flex gap-2 overflow-x-auto">
          {(Object.keys(SERVICE_META) as ServiceKey[]).map((k) => {
            const meta = SERVICE_META[k];
            return (
              <button
                key={k}
                onClick={() => setService(k)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors ${
                  service === k
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border"
                }`}
              >
                <meta.Icon className="h-3.5 w-3.5" />
                {meta.label}
              </button>
            );
          })}
        </div>
        <Input
          placeholder="Problem title (e.g. Leaking pipe)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          placeholder="Short description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <Input
          type="number"
          inputMode="numeric"
          placeholder="Suggested base price (TSh)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Button onClick={add} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add template"}
        </Button>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="font-display font-semibold">Existing templates</div>
        {rows.length === 0 && (
          <div className="text-sm text-muted-foreground">No templates yet.</div>
        )}
        {rows.map((r) => {
          const meta = SERVICE_META[r.service];
          return (
            <div key={r.id} className="flex items-center justify-between border rounded-xl p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium text-sm">
                  <meta.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
                  {r.title}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.description || "—"} · {formatTsh(r.suggested_price)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant={r.is_active ? "outline" : "secondary"}
                  onClick={() => toggle(r)}
                >
                  {r.is_active ? "Active" : "Hidden"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${r.title}`}
                  onClick={() => setPendingDelete(r)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !deleting && !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `"${pendingDelete.title}" will be removed from the catalog. This can't be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
