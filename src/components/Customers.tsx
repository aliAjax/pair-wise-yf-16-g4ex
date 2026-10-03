import { useState } from "react";
import { useStore } from "../store";
import { boardTitle, fmtDate, fmtDateTime } from "../utils";
import { Badge } from "./Badge";
import { Modal } from "./Modal";

export function Customers() {
  const { db } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = db.customers.find((c) => c.id === openId) ?? null;

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>客户档案</p>
            <h2>老客户与历史雪板</h2>
          </div>
          <span className="muted">换季复调时读取的是「上次交付参数」，不是去年的手写配方</span>
        </div>
        <div className="customer-grid">
          {db.customers.map((c) => {
            const boards = db.boards.filter((b) => b.customerId === c.id);
            return (
              <article key={c.id} className="customer-card">
                <div className="customer-avatar">{c.name.slice(0, 1)}</div>
                <div className="customer-info">
                  <h3>
                    {c.name} <span className="muted">{c.id}</span>
                  </h3>
                  <p className="muted">{c.phone}</p>
                  <p className="pref">偏好：{c.preference}</p>
                  <div className="chips">
                    {boards.map((b) => (
                      <button key={b.id} onClick={() => setOpenId(c.id)}>
                        {b.brand} {b.length}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="primary" onClick={() => setOpenId(c.id)}>
                  历史维护记录
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {open && (
        <Modal title={`${open.name} · 客户历史维护记录`} onClose={() => setOpenId(null)}>
          <div className="stack">
            <div className="panel-sub">
              <h4>客户偏好</h4>
              <p>{open.preference}</p>
            </div>
            {db.boards
              .filter((b) => b.customerId === open.id)
              .map((b) => {
                const wos = db.workOrders.filter((w) => w.boardId === b.id);
                const rts = db.retuneOrders.filter((r) => r.boardId === b.id);
                const recipes = db.recipes.filter((r) => r.boardId === b.id);
                const damages = db.damages.filter((d) => d.boardId === b.id);
                return (
                  <div key={b.id} className="panel-sub">
                    <h4>{boardTitle(b)}</h4>
                    <p className="muted">
                      上次交付：{fmtDateTime(b.lastDelivery.deliveredAt)} · 配方 侧刃{b.lastDelivery.recipe.sideEdge}°/底刃
                      {b.lastDelivery.recipe.baseEdge}° {b.lastDelivery.recipe.wax}
                    </p>
                    <p className="muted">
                      底板现状：{damages.length} 条损伤记录（交付快照 {b.lastDelivery.damageSnapshot.length} 条）
                    </p>
                    <div className="records">
                      {wos.map((w) => (
                        <article key={w.id}>
                          <b>{w.kind === "复调" ? "复" : w.kind === "新配方草稿" ? "方" : "修"}</b>
                          <div>
                            <h5>
                              {w.id}
                              <Badge tone={w.status === "完工" ? "green" : w.status === "进行中" ? "blue" : w.status === "草稿" ? "slate" : "amber"}>
                                {w.status}
                              </Badge>
                            </h5>
                            <p>{w.items}</p>
                            <p className="muted">{fmtDate(w.createdAt)}</p>
                          </div>
                        </article>
                      ))}
                      {rts.map((r) => (
                        <article key={r.id}>
                          <b>复</b>
                          <div>
                            <h5>
                              {r.id} 换季复调单
                              <Badge tone={r.status === "完工" ? "green" : r.status === "待重算" ? "red" : "blue"}>
                                {r.status}
                              </Badge>
                              {r.damageChanged && <Badge tone="red">配方已失效</Badge>}
                            </h5>
                            <p>
                              旧配方 {r.oldRecipe.sideEdge}°/{r.oldRecipe.baseEdge}° {r.oldRecipe.wax}
                              {r.measured &&
                                ` → 实测 ${r.measured.sideEdge}°/${r.measured.baseEdge}°，差值 ${r.diffs?.sideEdge}/${r.diffs?.baseEdge}`}
                            </p>
                          </div>
                        </article>
                      ))}
                      {recipes.map((r) => (
                        <article key={r.id}>
                          <b>方</b>
                          <div>
                            <h5>
                              {r.id} · v{r.version}
                              <Badge tone={r.status === "生效中" ? "teal" : "slate"}>{r.status}</Badge>
                            </h5>
                            <p>
                              侧刃{r.sideEdge}°/底刃{r.baseEdge}° {r.wax} · {r.savedBy} 保存于 {fmtDateTime(r.savedAt)}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </Modal>
      )}
    </div>
  );
}
