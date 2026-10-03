import { useState } from "react";
import { useStore } from "../store";
import { boardTitle, fmtDate } from "../utils";
import { BoardDiagram } from "./BoardDiagram";
import { Badge } from "./Badge";
import type { DamageType } from "../types";

const TYPES: DamageType[] = ["划痕", "修补", "P-Tex", "金属"];

export function BaseDamagePanel() {
  const { db, online, addDamage } = useStore();
  const [boardId, setBoardId] = useState(db.boards[0]?.id ?? "");
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [type, setType] = useState<DamageType>("划痕");
  const [material, setMaterial] = useState("底材");
  const [lengthCm, setLengthCm] = useState(5);
  const [note, setNote] = useState("");

  const board = db.boards.find((b) => b.id === boardId);
  const damages = db.damages.filter((d) => d.boardId === boardId);
  const snapshotIds = new Set(board?.lastDelivery.damageSnapshot.map((s) => s.damageId) ?? []);

  const submit = async () => {
    if (!draft || !boardId) return;
    await addDamage({ boardId, x: draft.x, y: draft.y, type, material, lengthCm: Number(lengthCm), note });
    setDraft(null);
    setNote("");
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>底板损伤</p>
            <h2>损伤标记与修补材料</h2>
          </div>
          <div className="board-tabs">
            {db.boards.map((b) => (
              <button key={b.id} className={b.id === boardId ? "chip--active" : ""} onClick={() => setBoardId(b.id)}>
                {b.brand} {b.length}
              </button>
            ))}
          </div>
        </div>

        <div className="damage-layout">
          <div>
            <BoardDiagram
              damages={damages}
              snapshot={board?.lastDelivery.damageSnapshot}
              onAdd={(x, y) => setDraft({ x, y })}
            />
            <p className="muted center">
              点击板图标记新损伤位置；虚线圆为上次交付时的快照，实心圆为当前损伤
            </p>
          </div>

          <div className="damage-form">
            <h3>新增损伤记录</h3>
            {draft ? (
              <p className="muted">
                标记位置：x {draft.x}% / y {draft.y}%
                <button className="link" onClick={() => setDraft(null)}>
                  清除
                </button>
              </p>
            ) : (
              <p className="muted">请在左侧板图上点击损伤位置</p>
            )}
            <div className="form-grid">
              <label>
                <span>损伤类型</span>
                <select value={type} onChange={(e) => setType(e.target.value as DamageType)}>
                  {TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>修补材料</span>
                <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="底材 / P-Tex 修补条 / 金属" />
              </label>
              <label>
                <span>长度（cm）</span>
                <input type="number" step="0.5" value={lengthCm} onChange={(e) => setLengthCm(Number(e.target.value))} />
              </label>
              <label>
                <span>备注</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="石板磕伤、见白底等" />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary" disabled={!draft || !online} onClick={submit}>
                {online ? "记录损伤" : "断网中：记录将进入待重试队列"}
              </button>
            </div>
            {board && (
              <div className="snapshot-note">
                <strong>交付快照</strong>
                <p className="muted">
                  {fmtDate(board.lastDelivery.deliveredAt)} 交付时底板有 {board.lastDelivery.damageSnapshot.length} 条记录。
                  换季复调时若出现快照外的新损伤或修补材料变化，沿用配方即失效。
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>损伤清单</p>
            <h2>{boardTitle(board)}</h2>
          </div>
        </div>
        <div className="records">
          {damages.map((d) => {
            const isNew = !snapshotIds.has(d.id);
            return (
              <article key={d.id}>
                <b>{d.type === "P-Tex" ? "P" : d.type.slice(0, 1)}</b>
                <div>
                  <h3>
                    {d.type} {d.lengthCm}cm
                    <Badge tone={isNew ? "red" : "slate"}>{isNew ? "交付后新增" : "交付时已有"}</Badge>
                    {d.material !== "底材" && <Badge tone="amber">修补材料：{d.material}</Badge>}
                  </h3>
                  <p>
                    {d.note} · 位置 x{d.x}/y{d.y}
                  </p>
                  <p className="muted">{fmtDate(d.recordedAt)} 记录</p>
                </div>
              </article>
            );
          })}
          {damages.length === 0 && <p className="empty">暂无损伤记录。</p>}
        </div>
      </section>
    </div>
  );
}
