import { useSyncExternalStore, useState } from "react";
import { ConnectivityBar } from "./components/ConnectivityBar";
import { OrderDetail } from "./components/OrderDetail";
import { OrderList } from "./components/OrderList";
import { baseChangedSinceDelivery, orderStage } from "./domain";
import { store } from "./store";
import "./styles.css";

function App() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const version = useSyncExternalStore(store.subscribe, store.getVersion);
  const [selectedId, setSelectedId] = useState(state.orders[0]?.id ?? "");

  const order = state.orders.find((o) => o.id === selectedId) ?? state.orders[0];
  const customer = state.customers.find((c) => c.id === order.customerId)!;
  const board = state.boards.find((b) => b.id === order.boardId)!;

  const stats = {
    total: state.orders.length,
    stale: state.orders.filter((o) => baseChangedSinceDelivery(state, o)).length,
    waiting: state.orders.filter((o) => orderStage(state, o) === "待重算").length,
    done: state.orders.filter((o) => orderStage(state, o) === "完工").length,
    versions: state.orders.reduce((n, o) => n + o.recipes.length, 0),
  };

  return (
    <main className="app">
      <section className="hero compact">
        <p>hxyfront-62004 · 季前复调工作台</p>
        <h1>滑雪板调校 · 换季复调单</h1>
        <span>
          客户档案 × 维修工单 × 底板损伤 × 刃角配方四单合一：读取上次交付参数并比对底板指纹；
          底刃更换、新增划痕或修补材料变化则旧配方失效，技师重算实测差值后方可开工。
          两名前台并发保存时先落盘为原单依据，后到改动另列裁决、不覆盖原单；
          车间断网操作进发件箱，第二天上线带幂等键重放，未确认步骤不重复执行。
        </span>
      </section>

      <ConnectivityBar online={store.isOnline()} outboxVersion={version} />

      <section className="metrics">
        <article><small>复调单</small><strong>{stats.total}</strong></article>
        <article><small>底板已变 · 旧配方失效</small><strong className="warn-num">{stats.stale}</strong></article>
        <article><small>待重算 / 完工</small><strong>{stats.waiting} / {stats.done}</strong></article>
        <article><small>配方版本（全部留档）</small><strong>{stats.versions}</strong></article>
      </section>

      <section className="workspace wide">
        <OrderList state={state} selectedId={order.id} onSelect={setSelectedId} />
        <OrderDetail key={order.id + ":" + version} order={order} customer={customer} board={board} />
      </section>
    </main>
  );
}

export default App;
