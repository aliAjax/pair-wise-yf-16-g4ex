import { useState } from "react";
import { useStore } from "../store";
import { boardTitle, fmtDateTime } from "../utils";
import { Badge } from "./Badge";

const WAXES = ["低温蜡", "中性蜡", "高温蜡"];

export function Recipes() {
  const { db, online, saveRecipe, concurrentSave } = useStore();
  const [boardId, setBoardId] = useState(db.boards[0]?.id ?? "");
  const [sideEdge, setSideEdge] = useState(88);
  const [baseEdge, setBaseEdge] = useState(1);
  const [wax, setWax] = useState("低温蜡");
  const [savedBy, setSavedBy] = useState("前台小孙");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const board = db.boards.find((b) => b.id === boardId);
  const current = db.recipes.find((r) => r.boardId === boardId && r.status === "生效中");
  const history = db.recipes
    .filter((r) => r.boardId === boardId)
    .sort((a, b) => b.version - a.version);

  const submit = async () => {
    if (!boardId) return;
    setSaving(true);
    await saveRecipe(boardId, { sideEdge: Number(sideEdge), baseEdge: Number(baseEdge), wax, note }, savedBy);
    setNote("");
    setSaving(false);
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>刃角配方</p>
            <h2>配方版本库与落盘</h2>
          </div>
          <button
            className="primary"
            disabled={!online}
            onClick={() => concurrentSave(boardId)}
            title={online ? "模拟两名前台同一时刻保存同一客户的新配方" : "断网中，无法并发落盘"}
          >
            模拟两名前台同时保存
          </button>
        </div>

        <div className="board-tabs">
          {db.boards.map((b) => (
            <button key={b.id} className={b.id === boardId ? "chip--active" : ""} onClick={() => setBoardId(b.id)}>
              {b.brand} {b.length}
            </button>
          ))}
        </div>

        {board && current && (
          <div className="current-recipe">
            <div>
              <p className="muted">当前生效版本</p>
              <strong>
                v{current.version} · 侧刃{current.sideEdge}° / 底刃{current.baseEdge}° · {current.wax}
              </strong>
              <p className="muted">
                {current.savedBy} 于 {fmtDateTime(current.savedAt)} 落盘
              </p>
            </div>
            <Badge tone="teal">生效中</Badge>
          </div>
        )}

        <div className="form-grid">
          <label>
            <span>侧刃角（°）</span>
            <input type="number" step="0.5" value={sideEdge} onChange={(e) => setSideEdge(Number(e.target.value))} />
          </label>
          <label>
            <span>底刃角（°）</span>
            <input type="number" step="0.5" value={baseEdge} onChange={(e) => setBaseEdge(Number(e.target.value))} />
          </label>
          <label>
            <span>打蜡类型</span>
            <select value={wax} onChange={(e) => setWax(e.target.value)}>
              {WAXES.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </label>
          <label>
            <span>保存前台</span>
            <input value={savedBy} onChange={(e) => setSavedBy(e.target.value)} placeholder="前台姓名" />
          </label>
          <label className="span-2">
            <span>备注</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="客户口述偏好、季前重调说明等" />
          </label>
        </div>
        <div className="form-actions">
          <button className="primary" disabled={saving || !online} onClick={submit}>
            {online ? `保存为 v${(current?.version ?? 0) + 1}（落盘即作为新工单依据）` : "断网中：保存将进入待重试队列"}
          </button>
          <span className="muted">
            并发保存时，先落盘的版本作为新工单依据；后保存的改动不会覆盖原单，自动列入冲突待前台选择。
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>版本历史</p>
            <h2>{boardTitle(board)}</h2>
          </div>
        </div>
        <div className="records">
          {history.map((r) => (
            <article key={r.id}>
              <b>v{r.version}</b>
              <div>
                <h3>
                  侧刃{r.sideEdge}° / 底刃{r.baseEdge}° · {r.wax}
                  <Badge tone={r.status === "生效中" ? "teal" : "slate"}>{r.status}</Badge>
                </h3>
                <p className="muted">
                  {r.savedBy} · {fmtDateTime(r.savedAt)}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
