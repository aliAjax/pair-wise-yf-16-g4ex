import { useMemo } from "react";
import { useStore } from "../store";
import { boardTitle, fmtDate } from "../utils";
import { Badge } from "./Badge";

export function Dashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { db, online } = useStore();

  const stats = useMemo(() => {
    const pending = db.workOrders.filter((w) => w.status === "待维护" || w.status === "进行中").length;
    const done = db.workOrders.filter((w) => w.status === "完工").length;
    const activeRecipes = db.recipes.filter((r) => r.status === "生效中");
    const avgEdge =
      activeRecipes.length > 0
        ? Math.round(activeRecipes.reduce((s, r) => s + r.sideEdge, 0) / activeRecipes.length)
        : 0;
    const repairs = db.damages.filter((d) => d.type === "修补" || d.type === "P-Tex").length;
    const invalidRetunes = db.retuneOrders.filter((r) => r.status !== "完工" && r.damageChanged).length;
    const openConflicts = db.conflicts.filter((c) => c.status === "待选择").length;
    const pendingSteps = db.pendingSteps.filter((s) => s.status === "待重试").length;
    return { pending, done, avgEdge, repairs, invalidRetunes, openConflicts, pendingSteps };
  }, [db]);

  const cards = [
    { label: "待维护工单", value: stats.pending, tone: "blue" as const },
    { label: "完工工单", value: stats.done, tone: "green" as const },
    { label: "平均侧刃角", value: `${stats.avgEdge}°`, tone: "teal" as const },
    { label: "底板修补", value: stats.repairs, tone: "amber" as const },
  ];

  return (
    <div className="stack">
      {!online && (
        <div className="banner banner--red">
          <strong>车间断网中</strong>
          <span>所有确认操作将进入待重试队列，复调单本地保留，上线后可在「恢复中心」重试未确认步骤。</span>
        </div>
      )}

      <section className="metrics">
        {cards.map((c) => (
          <article key={c.label}>
            <small>{c.label}</small>
            <strong>{c.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>季前复调</p>
            <h2>待办提醒</h2>
          </div>
        </div>
        <div className="alert-list">
          {stats.invalidRetunes > 0 && (
            <button className="alert alert--red" onClick={() => onNavigate("retune")}>
              <strong>{stats.invalidRetunes} 张复调单配方失效</strong>
              <span>底板新增划痕或修补材料变化，沿用去年配方将失效，需技师重算实测差值后开工</span>
            </button>
          )}
          {stats.openConflicts > 0 && (
            <button className="alert alert--amber" onClick={() => onNavigate("conflicts")}>
              <strong>{stats.openConflicts} 条并发保存待前台选择</strong>
              <span>两名前台同一时刻保存同一客户配方：先落盘版本已作为新工单依据，后保存版本另列待选</span>
            </button>
          )}
          {stats.pendingSteps > 0 && (
            <button className="alert alert--blue" onClick={() => onNavigate("recovery")}>
              <strong>{stats.pendingSteps} 个断网步骤待重试</strong>
              <span>车间断网期间未确认的步骤已本地落盘，上线后技师可在恢复中心重试</span>
            </button>
          )}
          {stats.invalidRetunes === 0 && stats.openConflicts === 0 && stats.pendingSteps === 0 && (
            <p className="empty">暂无待办，所有复调单进度正常。</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>快速入口</p>
            <h2>季前复调流程</h2>
          </div>
        </div>
        <div className="flow-grid">
          <button className="flow-card" onClick={() => onNavigate("retune")}>
            <b>1</b>
            <strong>生成复调单</strong>
            <span>读取上次交付参数，比对底板损伤与修补材料变化</span>
          </button>
          <button className="flow-card" onClick={() => onNavigate("retune")}>
            <b>2</b>
            <strong>技师重算实测差值</strong>
            <span>配方失效时必须重算，确认实测差值后才能开工</span>
          </button>
          <button className="flow-card" onClick={() => onNavigate("recipes")}>
            <b>3</b>
            <strong>前台保存配方</strong>
            <span>并发落盘时先到版本作为新工单依据，后到版本不覆盖原单</span>
          </button>
          <button className="flow-card" onClick={() => onNavigate("recovery")}>
            <b>4</b>
            <strong>断网恢复</strong>
            <span>未确认步骤本地保留，次日上线复调单恢复、技师重试</span>
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>近期动态</p>
            <h2>最新工单与复调单</h2>
          </div>
        </div>
        <div className="records">
          {[...db.workOrders]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 6)
            .map((w) => {
              const board = db.boards.find((b) => b.id === w.boardId);
              return (
                <article key={w.id}>
                  <b>{w.kind === "复调" ? "复" : w.kind === "新配方草稿" ? "方" : "修"}</b>
                  <div>
                    <h3>
                      {w.id} · {boardTitle(board)}
                      <Badge tone={w.status === "完工" ? "green" : w.status === "进行中" ? "blue" : w.status === "草稿" ? "slate" : "amber"}>
                        {w.status}
                      </Badge>
                    </h3>
                    <p>{w.items}</p>
                    <p className="muted">{fmtDate(w.createdAt)}</p>
                  </div>
                </article>
              );
            })}
        </div>
      </section>
    </div>
  );
}
