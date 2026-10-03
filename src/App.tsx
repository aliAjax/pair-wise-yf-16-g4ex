import { useState } from "react";
import { StoreProvider, useStore } from "./store";
import { Dashboard } from "./components/Dashboard";
import { Customers } from "./components/Customers";
import { WorkOrders } from "./components/WorkOrders";
import { Recipes } from "./components/Recipes";
import { BaseDamagePanel } from "./components/BaseDamagePanel";
import { Retune } from "./components/Retune";
import { Conflicts } from "./components/Conflicts";
import { Recovery } from "./components/Recovery";

const TABS = [
  { key: "dashboard", label: "工作台" },
  { key: "retune", label: "换季复调" },
  { key: "customers", label: "客户档案" },
  { key: "workorders", label: "维修工单" },
  { key: "recipes", label: "刃角配方" },
  { key: "damage", label: "底板损伤" },
  { key: "conflicts", label: "冲突中心" },
  { key: "recovery", label: "恢复中心" },
];

function Shell() {
  const [tab, setTab] = useState("dashboard");
  const { db, online, toasts, dismissToast } = useStore();

  const openConflicts = db.conflicts.filter((c) => c.status === "待选择").length;
  const pendingSteps = db.pendingSteps.filter((s) => s.status === "待重试").length;
  const invalidRetunes = db.retuneOrders.filter((r) => r.status !== "完工" && r.damageChanged).length;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <h1>滑雪板调校店 · 季前复调系统</h1>
          <p>客户档案 · 维修工单 · 底板损伤 · 刃角配方 串联复调</p>
        </div>
        <div className={`network-pill ${online ? "network-pill--on" : "network-pill--off"}`}>
          {online ? "● 车间网络在线" : "● 车间断网"}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "tab--active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "conflicts" && openConflicts > 0 && <em className="tab-badge">{openConflicts}</em>}
            {t.key === "recovery" && pendingSteps > 0 && <em className="tab-badge">{pendingSteps}</em>}
            {t.key === "retune" && invalidRetunes > 0 && <em className="tab-badge tab-badge--red">{invalidRetunes}</em>}
          </button>
        ))}
      </nav>

      {!online && (
        <div className="banner banner--red">
          <strong>车间断网中</strong>
          <span>
            确认类操作无法送达，将进入待重试队列并本地落盘；复调单、工单、配方数据不丢失。恢复网络后到「恢复中心」重试未确认步骤。
          </span>
        </div>
      )}

      <div className="tab-body">
        {tab === "dashboard" && <Dashboard onNavigate={setTab} />}
        {tab === "retune" && <Retune />}
        {tab === "customers" && <Customers />}
        {tab === "workorders" && <WorkOrders />}
        {tab === "recipes" && <Recipes />}
        {tab === "damage" && <BaseDamagePanel />}
        {tab === "conflicts" && <Conflicts />}
        {tab === "recovery" && <Recovery />}
      </div>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} onClick={() => dismissToast(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
