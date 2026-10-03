import { useStore } from "../store";
import { fmtDateTime } from "../utils";
import { Badge } from "./Badge";
import type { PendingStep } from "../types";

const KIND_LABEL: Record<PendingStep["kind"], string> = {
  confirmMeasured: "确认实测差值",
  startRetune: "开工确认",
  completeRetune: "完工确认",
  saveRecipe: "配方落盘",
  adoptConflict: "采用冲突版本",
  discardConflict: "丢弃冲突版本",
  addDamage: "损伤记录",
  generateRetune: "生成复调单",
};

export function Recovery() {
  const { db, online, setOnline, simulateNextDay, retryStep, retryAll } = useStore();
  const steps = [...db.pendingSteps].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = steps.filter((s) => s.status === "待重试");

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>断网恢复</p>
            <h2>车间断网 · 复调单恢复与步骤重试</h2>
          </div>
        </div>

        <div className={`network-card ${online ? "network-card--online" : "network-card--offline"}`}>
          <div>
            <strong>{online ? "● 车间网络在线" : "● 车间断网中"}</strong>
            <p className="muted">
              {online
                ? "所有确认操作可正常送达；断网期间未确认的步骤已本地落盘，复调单状态完整保留。"
                : "确认操作无法送达，将自动进入待重试队列；复调单、工单、配方数据本地保留不丢失。"}
            </p>
          </div>
          <div className="form-actions">
            {online ? (
              <button onClick={() => setOnline(false)}>模拟车间断网</button>
            ) : (
              <button className="primary" onClick={simulateNextDay}>
                第二天上线（恢复网络）
              </button>
            )}
          </div>
        </div>

        <div className="recovery-summary">
          <div>
            <small>待重试步骤</small>
            <strong>{pending.length}</strong>
          </div>
          <div>
            <small>累计重试成功</small>
            <strong>{steps.filter((s) => s.status === "重试成功").length}</strong>
          </div>
          <div>
            <small>重试失败</small>
            <strong>{steps.filter((s) => s.status === "重试失败").length}</strong>
          </div>
          <div>
            <small>本地保留复调单</small>
            <strong>{db.retuneOrders.length}</strong>
          </div>
        </div>

        {pending.length > 0 && online && (
          <div className="form-actions">
            <button className="primary" onClick={retryAll}>
              一键重试全部待确认步骤
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>未确认步骤</p>
            <h2>断网期间的操作队列</h2>
          </div>
        </div>
        <div className="records">
          {steps.map((s) => {
            const retune = db.retuneOrders.find((r) => r.id === s.retuneId);
            const board = db.boards.find((b) => b.id === (retune?.boardId ?? s.boardId));
            return (
              <article key={s.id}>
                <b>{s.status === "重试成功" ? "✓" : s.status === "重试失败" ? "!" : "…"}</b>
                <div>
                  <h3>
                    {s.id} · {KIND_LABEL[s.kind]}
                    <Badge tone={s.status === "重试成功" ? "green" : s.status === "重试失败" ? "red" : "amber"}>
                      {s.status}
                    </Badge>
                    {retune && <Badge tone="blue">复调单 {retune.id}</Badge>}
                  </h3>
                  <p>
                    {board ? `${board.brand} ${board.length} · ` : ""}
                    {s.reason}
                  </p>
                  <p className="muted">
                    入队时间 {fmtDateTime(s.createdAt)} · 已重试 {s.attempts} 次
                    {s.lastError ? ` · 最近错误：${s.lastError}` : ""}
                  </p>
                  {s.status === "待重试" && (
                    <div className="form-actions">
                      <button className="primary" disabled={!online} onClick={() => retryStep(s.id)}>
                        {online ? "重试该步骤" : "断网中，无法重试"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {steps.length === 0 && <p className="empty">暂无断网期间的未确认步骤。</p>}
        </div>
      </section>
    </div>
  );
}
