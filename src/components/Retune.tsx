import { useState } from "react";
import { useStore } from "../store";
import { boardTitle, fmtDate, fmtDateTime } from "../utils";
import { BoardDiagram } from "./BoardDiagram";
import { Badge } from "./Badge";
import type { RetuneStatus } from "../types";

const STEPS: RetuneStatus[] = ["待重算", "已确认", "施工中", "完工"];

export function Retune() {
  const {
    db,
    online,
    generateRetune,
    confirmMeasured,
    startRetune,
    completeRetune,
  } = useStore();
  const [boardId, setBoardId] = useState(db.boards[0]?.id ?? "");
  const [sideEdge, setSideEdge] = useState(88);
  const [baseEdge, setBaseEdge] = useState(1);
  const [wax, setWax] = useState("低温蜡");
  const [technician, setTechnician] = useState("技师老陈");

  const board = db.boards.find((b) => b.id === boardId);
  const retune = db.retuneOrders.find((r) => r.boardId === boardId && r.status !== "完工");
  const damages = db.damages.filter((d) => d.boardId === boardId);
  const basisOrder = db.workOrders.find((w) => w.id === retune?.basisWorkOrderId);
  const boardPending = db.pendingSteps.filter(
    (s) => s.status === "待重试" && (s.retuneId === retune?.id || s.boardId === boardId)
  );

  const stepIndex = retune ? STEPS.indexOf(retune.status) : -1;

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>换季复调</p>
            <h2>季前复调单：读取上次交付参数</h2>
          </div>
          <div className="board-tabs">
            {db.boards.map((b) => {
              const rt = db.retuneOrders.find((r) => r.boardId === b.id && r.status !== "完工");
              return (
                <button key={b.id} className={b.id === boardId ? "chip--active" : ""} onClick={() => setBoardId(b.id)}>
                  {b.brand} {b.length}
                  {rt?.damageChanged ? " ⚠" : rt ? " ●" : ""}
                </button>
              );
            })}
          </div>
        </div>

        {board && (
          <div className="retune-overview">
            <div className="retune-board-col">
              <BoardDiagram
                damages={damages}
                snapshot={board.lastDelivery.damageSnapshot}
              />
            </div>
            <div className="retune-flow-col">
              {!retune ? (
                <div className="empty-state">
                  <h3>本雪板本季尚未生成复调单</h3>
                  <p className="muted">
                    生成时将读取 {fmtDate(board.lastDelivery.deliveredAt)} 上次交付参数（
                    {board.lastDelivery.recipe.sideEdge}°/{board.lastDelivery.recipe.baseEdge}°{" "}
                    {board.lastDelivery.recipe.wax}），并比对底板新增划痕与修补材料变化。
                  </p>
                  <button
                    className="primary"
                    disabled={!online}
                    onClick={() => generateRetune(board.id)}
                  >
                    {online ? "生成季前复调单" : "断网中：生成将进入待重试队列"}
                  </button>
                </div>
              ) : (
                <>
                  {/* 步骤条 */}
                  <div className="step-bar">
                    {STEPS.map((s, i) => (
                      <div key={s} className={`step ${i <= stepIndex ? "step--active" : ""} ${i === stepIndex ? "step--current" : ""}`}>
                        <span>{i + 1}</span>
                        <label>{s}</label>
                      </div>
                    ))}
                  </div>

                  {boardPending.length > 0 && (
                    <div className="banner banner--amber">
                      <strong>复调单本地保留</strong>
                      <span>
                        {boardPending.length} 个步骤在断网期间未确认（
                        {boardPending.map((s) => s.id).join("、")}），上线后请到「恢复中心」重试，复调单状态不会丢失。
                      </span>
                    </div>
                  )}

                  {/* 第一步：读取上次交付参数 */}
                  <div className="flow-step">
                    <h3>① 读取上次交付参数</h3>
                    <div className="recipe-readout">
                      <div>
                        <small>侧刃角</small>
                        <strong>{retune.oldRecipe.sideEdge}°</strong>
                      </div>
                      <div>
                        <small>底刃角</small>
                        <strong>{retune.oldRecipe.baseEdge}°</strong>
                      </div>
                      <div>
                        <small>打蜡</small>
                        <strong>{retune.oldRecipe.wax}</strong>
                      </div>
                      <div>
                        <small>交付时间</small>
                        <strong>{fmtDate(retune.oldRecipe.deliveredAt)}</strong>
                      </div>
                    </div>
                    <p className="muted">
                      交付时底板快照 {board.lastDelivery.damageSnapshot.length} 条记录；当前底板 {damages.length} 条损伤记录。
                      复调单 {retune.id} 依据工单 {retune.basisWorkOrderId}
                      {basisOrder ? `（${basisOrder.status}）` : ""}。
                    </p>
                  </div>

                  {/* 第二步：底板比对 */}
                  <div className="flow-step">
                    <h3>② 底板损伤 / 修补材料比对</h3>
                    {retune.damageChanged ? (
                      <div className="banner banner--red">
                        <strong>配方已失效：沿用去年手写配方将产生调校偏差</strong>
                        <ul className="change-list">
                          {retune.changeSummary.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                        <span>技师必须重算实测差值，确认后才能开工。</span>
                      </div>
                    ) : (
                      <div className="banner banner--green">
                        <strong>底板无变化，旧配方参数可沿用</strong>
                        <span>无新增划痕、修补材料未变化；按季前复调 SOP，仍需技师实测确认差值后开工。</span>
                      </div>
                    )}
                  </div>

                  {/* 第三步：技师重算实测差值 */}
                  <div className="flow-step">
                    <h3>③ 技师重算实测差值</h3>
                    {retune.measured ? (
                      <div className="recipe-readout">
                        <div>
                          <small>实测侧刃</small>
                          <strong>{retune.measured.sideEdge}°</strong>
                        </div>
                        <div>
                          <small>实测底刃</small>
                          <strong>{retune.measured.baseEdge}°</strong>
                        </div>
                        <div>
                          <small>实测蜡</small>
                          <strong>{retune.measured.wax}</strong>
                        </div>
                        <div>
                          <small>实测差值</small>
                          <strong className={retune.diffs && (retune.diffs.sideEdge !== 0 || retune.diffs.baseEdge !== 0) ? "diff-warn" : "diff-ok"}>
                            {retune.diffs?.sideEdge} / {retune.diffs?.baseEdge}
                          </strong>
                        </div>
                        <div>
                          <small>确认人</small>
                          <strong>{retune.measured.confirmedBy}</strong>
                        </div>
                        <div>
                          <small>确认时间</small>
                          <strong>{fmtDateTime(retune.measured.confirmedAt)}</strong>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="form-grid">
                          <label>
                            <span>实测侧刃角（°）</span>
                            <input type="number" step="0.5" value={sideEdge} onChange={(e) => setSideEdge(Number(e.target.value))} />
                          </label>
                          <label>
                            <span>实测底刃角（°）</span>
                            <input type="number" step="0.5" value={baseEdge} onChange={(e) => setBaseEdge(Number(e.target.value))} />
                          </label>
                          <label>
                            <span>实测打蜡类型</span>
                            <select value={wax} onChange={(e) => setWax(e.target.value)}>
                              {["低温蜡", "中性蜡", "高温蜡"].map((w) => (
                                <option key={w}>{w}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>技师</span>
                            <input value={technician} onChange={(e) => setTechnician(e.target.value)} />
                          </label>
                        </div>
                        <div className="diff-preview">
                          差值预览：侧刃 {round2(sideEdge - retune.oldRecipe.sideEdge)}° / 底刃{" "}
                          {round2(baseEdge - retune.oldRecipe.baseEdge)}°
                          <span className="muted">（实测 − 配方，0 表示沿用）</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 第四步：开工 */}
                  <div className="flow-step">
                    <h3>④ 开工与交付</h3>
                    <div className="form-actions">
                      {retune.status === "待重算" && (
                        <button
                          className="primary"
                          disabled={!online}
                          onClick={() =>
                            confirmMeasured(retune.id, {
                              sideEdge: Number(sideEdge),
                              baseEdge: Number(baseEdge),
                              wax,
                              technician,
                            })
                          }
                        >
                          {online ? "确认实测差值" : "断网中：确认将进入待重试队列"}
                        </button>
                      )}
                      {retune.status === "已确认" && (
                        <button className="primary" disabled={!online} onClick={() => startRetune(retune.id)}>
                          {online ? "确认无误，开工" : "断网中：开工将进入待重试队列"}
                        </button>
                      )}
                      {retune.status === "施工中" && (
                        <button className="primary" disabled={!online} onClick={() => completeRetune(retune.id)}>
                          {online ? "完工交付（回写下季基准）" : "断网中：完工将进入待重试队列"}
                        </button>
                      )}
                      {retune.status === "完工" && <Badge tone="green">本季复调已完工交付</Badge>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
