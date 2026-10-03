import { useMemo, useState } from "react";
import { useStore } from "../store";
import { boardTitle, fmtDate } from "../utils";
import { Badge } from "./Badge";
import type { WorkOrderStatus } from "../types";

const FILTERS: Array<"全部" | WorkOrderStatus> = ["全部", "待维护", "进行中", "待交付", "完工", "草稿"];

const STATUS_TONE: Record<WorkOrderStatus, string> = {
  完工: "green",
  进行中: "blue",
  待维护: "amber",
  待交付: "teal",
  草稿: "slate",
};

export function WorkOrders() {
  const { db } = useStore();
  const [filter, setFilter] = useState<"全部" | WorkOrderStatus>("全部");

  const list = useMemo(() => {
    const sorted = [...db.workOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter === "全部" ? sorted : sorted.filter((w) => w.status === filter);
  }, [db.workOrders, filter]);

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>维修工单</p>
            <h2>工单列表与完工筛选</h2>
          </div>
          <div className="chips">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={filter === f ? "chip--active" : ""}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="records">
          {list.map((w) => {
            const board = db.boards.find((b) => b.id === w.boardId);
            const customer = db.customers.find((c) => c.id === w.customerId);
            return (
              <article key={w.id}>
                <b>{w.kind === "复调" ? "复" : w.kind === "新配方草稿" ? "方" : "修"}</b>
                <div>
                  <h3>
                    {w.id} · {boardTitle(board)}
                    <Badge tone={STATUS_TONE[w.status]}>{w.status}</Badge>
                    <Badge tone="slate">{w.kind}</Badge>
                  </h3>
                  <p>{w.items}</p>
                  <p className="muted">
                    {customer?.name} · {fmtDate(w.createdAt)}
                    {w.retuneId ? ` · 复调单 ${w.retuneId}` : ""}
                  </p>
                </div>
              </article>
            );
          })}
          {list.length === 0 && <p className="empty">当前筛选下没有工单。</p>}
        </div>
      </section>
    </div>
  );
}
