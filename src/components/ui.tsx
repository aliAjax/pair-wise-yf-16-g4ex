import { ReactNode } from "react";
import { OrderStage } from "../types";

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const stageStyle: Record<OrderStage, string> = {
  待重算: "badge warn",
  待开工: "badge ok",
  施工中: "badge info",
  完工: "badge done",
};

export function StageBadge({ stage }: { stage: OrderStage }) {
  return <span className={stageStyle[stage]}>{stage}</span>;
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "green" | "orange" | "blue" | "red" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>;
}
