import type { ReactNode } from "react";

const TONES: Record<string, string> = {
  green: "badge--green",
  amber: "badge--amber",
  red: "badge--red",
  blue: "badge--blue",
  slate: "badge--slate",
  teal: "badge--teal",
};

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES | string; children: ReactNode }) {
  return <span className={`badge ${TONES[tone] ?? "badge--slate"}`}>{children}</span>;
}
