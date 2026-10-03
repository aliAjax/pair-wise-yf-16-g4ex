import { useState } from "react";
import { useStore } from "../store";
import { boardTitle, fmtDateTime } from "../utils";
import { Badge } from "./Badge";

export function Conflicts() {
  const { db, online, resolveConflict, concurrentSave } = useStore();
  const [boardId, setBoardId] = useState(db.boards[1]?.id ?? db.boards[0]?.id ?? "");

  const conflicts = [...db.conflicts].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>并发保存冲突</p>
            <h2>先落盘为新工单依据，后保存另列待选</h2>
          </div>
          <div className="board-tabs">
            {db.boards.map((b) => (
              <button key={b.id} className={b.id === boardId ? "chip--active" : ""} onClick={() => setBoardId(b.id)}>
                {b.brand} {b.length}
              </button>
            ))}
            <button
              className="primary"
              disabled={!online}
              onClick={() => concurrentSave(boardId)}
              title={online ? "模拟两名前台同一时刻保存同一客户的新配方" : "断网中，无法并发落盘"}
            >
              模拟两名前台同时保存
            </button>
          </div>
        </div>

        {conflicts.length === 0 && <p className="empty">暂无并发保存冲突。</p>}

        <div className="stack">
          {conflicts.map((c) => {
            const board = db.boards.find((b) => b.id === c.boardId);
            const basisOrder = db.workOrders.find((w) => w.id === c.basisWorkOrderId);
            const adoptedOrder = db.workOrders.find((w) => w.id === c.adoptedWorkOrderId);
            return (
              <article key={c.id} className="conflict-card">
                <div className="conflict-head">
                  <h3>
                    {c.id} · {boardTitle(board)}
                  </h3>
                  <Badge tone={c.status === "待选择" ? "amber" : c.status === "已采用" ? "green" : "slate"}>
                    {c.status}
                  </Badge>
                </div>
                <p className="muted">检测时间 {fmtDateTime(c.detectedAt)} · 两名前台同一时刻保存同一客户的新配方</p>

                <div className="conflict-cols">
                  <div className="conflict-col conflict-col--winner">
                    <div className="conflict-col-head">
                      <Badge tone="green">先落盘 · 已作为新工单依据</Badge>
                    </div>
                    <strong>
                      侧刃{c.firstRecipe.sideEdge}° / 底刃{c.firstRecipe.baseEdge}° · {c.firstRecipe.wax}
                    </strong>
                    <p className="muted">
                      {c.firstRecipe.savedBy} · {fmtDateTime(c.firstRecipe.savedAt)} 落盘
                    </p>
                    <p className="muted">
                      依据工单：{c.basisWorkOrderId}
                      {basisOrder ? `（${basisOrder.status}）` : ""}
                    </p>
                  </div>

                  <div className="conflict-col conflict-col--loser">
                    <div className="conflict-col-head">
                      <Badge tone="amber">后保存 · 未覆盖原单 · 待选择</Badge>
                    </div>
                    <strong>
                      侧刃{c.loserRecipe.sideEdge}° / 底刃{c.loserRecipe.baseEdge}° · {c.loserRecipe.wax}
                    </strong>
                    <p className="muted">
                      {c.loserRecipe.savedBy} · {fmtDateTime(c.loserRecipe.savedAt)} 保存（版本 v{c.loserRecipe.version}）
                    </p>
                    <p className="muted">该版本落盘时版本号已过期，系统未用它覆盖任何已有工单或配方。</p>
                  </div>
                </div>

                {c.status === "待选择" ? (
                  <div className="form-actions">
                    <button className="primary" disabled={!online} onClick={() => resolveConflict(c.id, true)}>
                      采用后保存版本（另起草稿工单，不覆盖原单）
                    </button>
                    <button disabled={!online} onClick={() => resolveConflict(c.id, false)}>
                      丢弃后保存版本
                    </button>
                    {!online && <span className="muted">断网中：处理将进入待重试队列</span>}
                  </div>
                ) : (
                  <p className="muted">
                    {c.status === "已采用"
                      ? `已采用后保存版本并另起草稿工单 ${adoptedOrder?.id ?? ""}；先落盘原单 ${c.basisWorkOrderId} 保持不变。`
                      : `后保存版本已丢弃；原单 ${c.basisWorkOrderId} 保持不变。`}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
