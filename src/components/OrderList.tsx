import { useMemo, useState } from "react";
import {
  activeRecipe,
  boardFingerprint,
  baseChangedSinceDelivery,
  orderStage,
  recipeValid,
} from "../domain";
import { ServerState } from "../types";
import { StageBadge } from "./ui";

const SHAPES = ["全部", "全地域", "公园板", "竞速板", "粉雪板"] as const;

export function OrderList({
  state,
  selectedId,
  onSelect,
}: {
  state: ServerState;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [shape, setShape] = useState<(typeof SHAPES)[number]>("全部");
  const [doneOnly, setDoneOnly] = useState(false);

  const rows = useMemo(() => {
    return state.orders
      .map((o) => {
        const customer = state.customers.find((c) => c.id === o.customerId)!;
        const board = state.boards.find((b) => b.id === o.boardId)!;
        return { order: o, customer, board };
      })
      .filter(({ board }) => shape === "全部" || board.shape === shape)
      .filter(({ order }) => !doneOnly || orderStage(state, order) === "完工");
  }, [state, shape, doneOnly]);

  return (
    <aside className="panel order-list">
      <h2>季前复调单</h2>
      <div className="chips">
        {SHAPES.map((s) => (
          <button
            key={s}
            className={shape === s ? "chip active" : "chip"}
            onClick={() => setShape(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={doneOnly} onChange={(e) => setDoneOnly(e.target.checked)} />
        只看完工状态
      </label>

      <div className="order-cards">
        {rows.map(({ order, customer, board }) => {
          const changed = baseChangedSinceDelivery(state, order);
          const valid = recipeValid(state, order);
          const basis = activeRecipe(order);
          return (
            <button
              key={order.id}
              className={selectedId === order.id ? "order-card selected" : "order-card"}
              onClick={() => onSelect(order.id)}
            >
              <div className="order-card-top">
                <b>{order.id}</b>
                <StageBadge stage={orderStage(state, order)} />
              </div>
              <h3>{customer.name} · {board.brand} {board.model}</h3>
              <p>{board.lengthCm}cm · {board.shape}</p>
              <div className="order-card-flags">
                {changed && <span className="tag red">底板已变 · 旧配方失效</span>}
                {!changed && <span className="tag green">指纹一致 · 可沿用</span>}
                {basis ? (
                  valid ? (
                    <span className="tag blue">依据 v{basis.version}</span>
                  ) : (
                    <span className="tag orange">v{basis.version} 待重算</span>
                  )
                ) : (
                  <span className="tag gray">无配方版本</span>
                )}
              </div>
              <small className="fp">
                当前指纹 {boardFingerprint(board)} / 交付 {board.baseFingerprintAtDelivery}
              </small>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
