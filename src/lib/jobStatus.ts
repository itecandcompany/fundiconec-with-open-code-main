export const JOB_STATUSES = [
  "searching",
  "quoting",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

// All pipeline stages are built only from the app's own tokens (primary,
// warning, success, destructive) rather than arbitrary Tailwind hues, so
// status badges always stay in sync with the rest of the UI: primary for
// "in motion" stages, warning for stages that need the client's attention,
// success/destructive for the two terminal states.
export const STATUS_COLORS: Record<JobStatus, string> = {
  searching: "bg-primary/10 text-primary",
  quoting: "bg-warning/15 text-warning-foreground",
  accepted: "bg-primary/10 text-primary",
  on_the_way: "bg-primary/15 text-primary",
  arrived: "bg-warning/15 text-warning-foreground",
  in_progress: "bg-primary/15 text-primary",
  completed: "bg-success/15 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

export const STATUS_TONE: Record<JobStatus, string> = {
  searching: "text-primary",
  quoting: "text-warning",
  accepted: "text-primary",
  on_the_way: "text-primary",
  arrived: "text-warning",
  in_progress: "text-primary",
  completed: "text-success",
  cancelled: "text-destructive",
};
