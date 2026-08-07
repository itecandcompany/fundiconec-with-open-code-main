import { cn } from "@/lib/utils";

export default function StepProgress({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="flex gap-1.5 w-full">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors duration-300",
            i < step ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}
