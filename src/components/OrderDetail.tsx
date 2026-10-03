import { useState } from "react";
import {
  activeRecipe,
  baseChangedSinceDelivery,
  boardFingerprint,
  measurementReady,
  orderStage,
  pendingAlternatives,
  recipeValid,
  stepGate,
  WORK_STEPS,
} from "../domain";
import { store } from "../store";
import {
  Board,
  Customer,
  DamageSeverity,
  MaterialKind,
  Recipe,
  RetuneOrder,
} from "../types";
import { Badge, Field, fmtTime, Row, StageBadge } from "./ui";

const MATERIALS: MaterialKind[] = ["P-Tex", "烧结条", "金属片", "环氧", "更换底刃", "原厂底板"];

function useRefresh() {
  const [, setN] = useState(0);
  return () => setN((x) => x + 1);
}

export function OrderDetail({
  order,
  customer,
  board,
}: {
  order: RetuneOrder;
  customer: Customer;
  board: Board;
}) {
  const refresh = useRefresh();
  const changed = baseChangedSinceDelivery(store.state, order);
  const valid = recipeValid(store.state, order);
  const basis = activeRecipe(order);
  const alts = pendingAlternatives(order);
  const ready = measurementReady(store.state, order);
  const stage = orderStage(store.state, order);

  const act = async (action: Parameters<typeof store.submit>[0], label: string) => {
    await store.submit(action, label);
    refresh();
  };

  return (
    <section className="panel detail">
      <header className="detail-head">
        <div>
          <p className="eyebrow">{order.season} · 客户档案 {customer.id}</p>
          <h2>
            {order.id} · {customer.name}
            <StageBadge stage={stage} />
          </h2>
          <p className="sub">
            {customer.phone} · 偏好：{customer.preference}
          </p>
        </div>
        <div className="board-card">
          <b>{board.brand} {board.model}</b>
          <span>{board.lengthCm}cm · {board.shape}</span>
          <span>上次交付：{board.lastDeliveredAt}</span>
        </div>
      </header>

      <div className={changed ? "notice warn" : "notice ok"}>
        {changed ? (
          <>
            <b>底板指纹变化：</b>当前 <code>{boardFingerprint(board)}</code> ≠ 交付时{" "}
            <code>{board.baseFingerprintAtDelivery}</code>。
            底刃更换 / 新增划痕 / 修补材料变化，去年手写配方（{board.lastHandwrittenRecipe.note}）
            <b> 不能直接沿用</b>，必须由前台重新存配方、技师重算实测差值后才能开工。
          </>
        ) : (
          <>
            <b>底板指纹一致：</b><code>{boardFingerprint(board)}</code>。
            去年手写配方（{board.lastHandwrittenRecipe.note}）可沿用。
          </>
        )}
      </div>

      <div className="detail-grid">
        <LastRecipe board={board} />
        <BaseSection order={order} board={board} onDone={refresh} act={act} />
      </div>

      <RecipeSection order={order} board={board} valid={valid} basis={basis} alts={alts} onDone={refresh} act={act} />
      <MeasureSection order={order} valid={valid} ready={ready} onDone={refresh} act={act} />
      <StepsSection order={order} ready={ready} valid={valid} onDone={refresh} act={act} />
      <LogSection order={order} />
    </section>
  );
}

type ActFn = (action: Parameters<typeof store.submit>[0], label: string) => Promise<void>;

// ---------- 去年手写配方 ----------

function LastRecipe({ board }: { board: Board }) {
  const r = board.lastHandwrittenRecipe;
  return (
    <div className="block">
      <h3>去年手写配方（交付档案）</h3>
      <div className="spec-grid">
        <span>底刃<b>{r.baseAngle}°</b></span>
        <span>侧刃<b>{r.sideAngle}°</b></span>
        <span>去刃<b>{r.detuneMm}mm</b></span>
        <span>打蜡<b>{r.waxType}</b></span>
      </div>
      <p className="muted">{r.note}</p>
    </div>
  );
}

// ---------- 底板损伤与修补材料 ----------

function BaseSection({ order, board, act }: { order: RetuneOrder; board: Board; onDone: () => void; act: ActFn }) {
  const [pos, setPos] = useState("");
  const [len, setLen] = useState("");
  const [depth, setDepth] = useState("");
  const [sev, setSev] = useState<DamageSeverity>("中");
  const [kind, setKind] = useState<MaterialKind>("P-Tex");
  const [brand, setBrand] = useState("");

  return (
    <div className="block">
      <h3>底板损伤与修补材料（本季实勘）</h3>
      <div className="damage-list">
        {board.baseDamages.map((d) => (
          <div key={d.id} className="damage-item">
            <b>{d.position}</b>
            <span>{d.lengthCm}cm / 深{d.depthMm}mm / {d.severity}</span>
            <Badge tone={d.status === "待补" ? "orange" : "green"}>{d.status}</Badge>
          </div>
        ))}
        {board.baseDamages.length === 0 && <p className="muted">无损伤记录</p>}
      </div>
      <div className="mats">
        {board.repairMaterials.map((m) => (
          <span key={m.id} className={m.kind === "更换底刃" ? "tag red" : "tag gray"}>
            {m.kind} · {m.brand}
          </span>
        ))}
      </div>

      <div className="subform">
        <p className="sub-title">新增划痕（会改变指纹 → 配方失效）</p>
        <Row>
          <Field label="位置"><input value={pos} placeholder="如：板腰偏左 20cm" onChange={(e) => setPos(e.target.value)} /></Field>
          <Field label="长度 cm"><input type="number" value={len} onChange={(e) => setLen(e.target.value)} /></Field>
          <Field label="深度 mm"><input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} /></Field>
          <Field label="程度">
            <select value={sev} onChange={(e) => setSev(e.target.value as DamageSeverity)}>
              {(["浅", "中", "深"] as DamageSeverity[]).map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </Row>
        <button
          className="primary"
          disabled={!pos || !len || !depth}
          onClick={() =>
            act(
              {
                type: "ADD_BASE_DAMAGE",
                orderId: order.id,
                damage: {
                  position: pos,
                  lengthCm: Number(len),
                  depthMm: Number(depth),
                  severity: sev,
                  status: "待补",
                },
              },
              `新增划痕 ${pos}`
            )
          }
        >
          登记划痕
        </button>

        <p className="sub-title">新增修补材料（更换底刃直接判旧配方失效）</p>
        <Row>
          <Field label="材料">
            <select value={kind} onChange={(e) => setKind(e.target.value as MaterialKind)}>
              {MATERIALS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="品牌/型号"><input value={brand} placeholder="如：Kunto 钢刃" onChange={(e) => setBrand(e.target.value)} /></Field>
        </Row>
        <button
          disabled={!brand}
          onClick={() =>
            act(
              { type: "ADD_REPAIR_MATERIAL", orderId: order.id, material: { kind, brand } },
              `新增材料 ${kind}`
            )
          }
        >
          上料登记
        </button>
      </div>
    </div>
  );
}

// ---------- 刃角配方（双前台并发） ----------

function RecipeForm({
  order,
  station,
  clerk,
  initial,
  act,
}: {
  order: RetuneOrder;
  station: string;
  clerk: string;
  initial: Partial<Recipe>;
  act: ActFn;
}) {
  const [baseAngle, setBase] = useState(initial.baseAngle ?? 1);
  const [sideAngle, setSide] = useState(initial.sideAngle ?? 88);
  const [detuneMm, setDetune] = useState(initial.detuneMm ?? 40);
  const [waxType, setWax] = useState(initial.waxType ?? "低温蜡");
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await act(
      {
        type: "SAVE_RECIPE",
        orderId: order.id,
        savedBy: clerk,
        station,
        at: Date.now(),
        spec: { baseAngle: Number(baseAngle), sideAngle: Number(sideAngle), detuneMm: Number(detuneMm), waxType, note },
      },
      `${station} 保存配方`
    );
    setBusy(false);
  };

  return (
    <div className="recipe-form">
      <header>
        <b>{station}</b>
        <span className="muted">{clerk}</span>
      </header>
      <Row>
        <Field label="底刃角 °"><input type="number" step={0.05} value={baseAngle} onChange={(e) => setBase(Number(e.target.value))} /></Field>
        <Field label="侧刃角 °"><input type="number" step={0.1} value={sideAngle} onChange={(e) => setSide(Number(e.target.value))} /></Field>
        <Field label="去刃 mm"><input type="number" value={detuneMm} onChange={(e) => setDetune(Number(e.target.value))} /></Field>
        <Field label="打蜡"><input value={waxType} onChange={(e) => setWax(e.target.value)} /></Field>
      </Row>
      <Field label="备注"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="客户偏好 / 调整原因" /></Field>
      <button className="primary" disabled={busy} onClick={save}>{busy ? "保存中…" : "保存新配方"}</button>
    </div>
  );
}

function RecipeSection({
  order,
  board,
  valid,
  basis,
  alts,
  act,
}: {
  order: RetuneOrder;
  board: Board;
  valid: boolean;
  basis?: ReturnType<typeof activeRecipe>;
  alts: ReturnType<typeof pendingAlternatives>;
  onDone: () => void;
  act: ActFn;
}) {
  const sameTimeSave = async () => {
    // 模拟两名前台同一时刻点保存：服务端按接收顺序串行落盘
    const specA = { baseAngle: 1, sideAngle: 89, detuneMm: 60, waxType: "温区蜡", note: "小何：弱咬雪" };
    const specB = { baseAngle: 0.75, sideAngle: 88, detuneMm: 45, waxType: "温区蜡", note: "阿珊：均衡取向" };
    await Promise.all([
      act({ type: "SAVE_RECIPE", orderId: order.id, savedBy: "小何", station: "前台A", at: Date.now(), spec: specA }, "前台A 保存"),
      act({ type: "SAVE_RECIPE", orderId: order.id, savedBy: "阿珊", station: "前台B", at: Date.now(), spec: specB }, "前台B 保存"),
    ]);
  };

  return (
    <div className="block">
      <h3>
        刃角配方版本链
        {basis && (valid ? <Badge tone="green">v{basis.version} 为工单依据</Badge> : <Badge tone="red">v{basis.version} 与现底板不符，已失效</Badge>)}
        {!basis && <Badge tone="gray">尚无落盘版本</Badge>}
      </h3>

      <div className="recipe-versions">
        {order.recipes.map((r) => (
          <div key={r.version} className={`recipe-version ${r.status === "待前台裁决" ? "pending-alt" : ""}`}>
            <div className="rv-head">
              <b>v{r.version}</b>
              <Badge
                tone={
                  r.status === "原单依据" || r.status === "采纳"
                    ? "green"
                    : r.status === "待前台裁决"
                    ? "orange"
                    : r.status === "放弃"
                    ? "red"
                    : "gray"
                }
              >
                {r.status}
              </Badge>
              <span className="muted">{r.station} · {r.savedBy} · {fmtTime(r.savedAt)}</span>
            </div>
            <p>
              底刃 {r.baseAngle}° · 侧刃 {r.sideAngle}° · 去刃 {r.detuneMm}mm · {r.waxType}
              {r.note ? ` · ${r.note}` : ""}
            </p>
            <small className="muted">依据指纹 {r.basedOnFingerprint}{r.basedOnFingerprint !== boardFingerprint(board) ? "（与当前不符）" : ""}</small>
            {r.status === "待前台裁决" && (
              <div className="alt-actions">
                <span className="muted">后保存，不能盖掉原单 —— </span>
                <button
                  className="primary small"
                  onClick={() => act({ type: "RESOLVE_ALTERNATIVE", orderId: order.id, version: r.version, decision: "采纳", by: "店长" }, `采纳 v${r.version}`)}
                >
                  采纳为新依据（原单留档）
                </button>
                <button
                  className="small"
                  onClick={() => act({ type: "RESOLVE_ALTERNATIVE", orderId: order.id, version: r.version, decision: "放弃", by: "店长" }, `放弃 v${r.version}`)}
                >
                  放弃
                </button>
              </div>
            )}
          </div>
        ))}
        {order.recipes.length === 0 && <p className="muted">暂无配方版本。两名前台可同时保存，先落盘者成为原单依据。</p>}
      </div>

      {alts.length > 0 && (
        <div className="notice warn inline">
          有 {alts.length} 版后保存改动待前台裁决，原单未被覆盖。
        </div>
      )}

      <div className="two-col">
        <RecipeForm order={order} station="前台A" clerk="小何" initial={{ note: "" }} act={act} />
        <RecipeForm order={order} station="前台B" clerk="阿珊" initial={{ baseAngle: 0.75, sideAngle: 88, detuneMm: 45, note: "" }} act={act} />
      </div>
      <button className="ghost" onClick={sameTimeSave}>⚡ 演示：两名前台同一时刻保存</button>
    </div>
  );
}

// ---------- 技师实测重算 ----------

function MeasureSection({
  order,
  valid,
  ready,
  act,
}: {
  order: RetuneOrder;
  valid: boolean;
  ready: boolean;
  onDone: () => void;
  act: ActFn;
}) {
  const [baseActual, setBaseActual] = useState("");
  const [tech, setTech] = useState("老赵");
  const [sideActual, setSideActual] = useState("");
  const [error, setError] = useState("");

  const confirm = async () => {
    setError("");
    const result = await store
      .submit(
        {
          type: "CONFIRM_MEASUREMENT",
          orderId: order.id,
          technician: tech,
          baseActual: Number(baseActual),
          sideActual: Number(sideActual),
        },
        "刃角实测重算"
      )
      .catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
    if (result && result !== "已落盘" && result !== "断网暂存，上线后自动重放") setError(result);
  };

  return (
    <div className="block">
      <h3>
        技师实测 · 差值重算
        {ready ? <Badge tone="green">已对齐 v{order.measurement!.recipeVersion}，可开工</Badge> : <Badge tone="gray">未确认</Badge>}
      </h3>
      {!valid && (
        <div className="notice warn inline">
          门禁拦截：底板变化导致配方失效，实测重算前须先让前台存一版与当前指纹一致的配方。
        </div>
      )}
      {order.measurement && order.deltas && (
        <div className="delta-box">
          <div>
            <small>底刃实测 / 目标</small>
            <b>{order.measurement.baseActual}° / {activeRecipe(order)?.baseAngle}°</b>
            <strong className={order.deltas.baseDelta >= 0 ? "pos" : "neg"}>
              差值 {order.deltas.baseDelta}°
            </strong>
          </div>
          <div>
            <small>侧刃实测 / 目标</small>
            <b>{order.measurement.sideActual}° / {activeRecipe(order)?.sideAngle}°</b>
            <strong className={order.deltas.sideDelta >= 0 ? "pos" : "neg"}>
              差值 {order.deltas.sideDelta}°
            </strong>
          </div>
          <div className="muted">
            {order.measurement.technician} · {fmtTime(order.measurement.measuredAt)} ·
            指纹 {order.measurement.fingerprint}
          </div>
        </div>
      )}
      <Row>
        <Field label="底刃实测 °"><input type="number" step={0.01} placeholder="如 0.62" value={baseActual} onChange={(e) => setBaseActual(e.target.value)} /></Field>
        <Field label="侧刃实测 °"><input type="number" step={0.01} placeholder="如 88.10" value={sideActual} onChange={(e) => setSideActual(e.target.value)} /></Field>
        <Field label="技师"><input value={tech} onChange={(e) => setTech(e.target.value)} /></Field>
      </Row>
      {error && <p className="error-text">{error}</p>}
      <button className="primary" disabled={!valid || !baseActual || !sideActual} onClick={confirm}>
        确认实测并重算差值
      </button>
    </div>
  );
}

// ---------- 工序 ----------

function StepsSection({
  order,
  ready,
  valid,
  act,
}: {
  order: RetuneOrder;
  ready: boolean;
  valid: boolean;
  onDone: () => void;
  act: ActFn;
}) {
  return (
    <div className="block">
      <h3>
        车间工序
        {!valid && <Badge tone="red">配方失效，打磨锁定</Badge>}
        {valid && !ready && <Badge tone="orange">待重算差值</Badge>}
      </h3>
      <ol className="steps">
        {WORK_STEPS.map((sdef) => {
          const step = order.steps.find((s) => s.id === sdef.id)!;
          const gate = stepGate(store.state, order, sdef.id);
          return (
            <li key={sdef.id} className={step.status === "confirmed" ? "step done" : gate.ok ? "step open" : "step locked"}>
              <div className="step-main">
                <b>{sdef.id.toUpperCase()} · {sdef.name}</b>
                {step.status === "confirmed" ? (
                  <span className="tag green">已确认 · {step.technician} {step.confirmedAt && fmtTime(step.confirmedAt)}</span>
                ) : gate.ok ? (
                  <span className="tag blue">可操作</span>
                ) : (
                  <span className="tag red">{gate.reason}</span>
                )}
              </div>
              {step.status !== "confirmed" && (
                <button
                  className="small"
                  disabled={!gate.ok}
                  onClick={() => act({ type: "CONFIRM_STEP", orderId: order.id, stepId: sdef.id, technician: "老赵" }, `完成 ${sdef.name}`)}
                >
                  确认完成
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------- 工单日志 ----------

function LogSection({ order }: { order: RetuneOrder }) {
  return (
    <div className="block">
      <h3>工单流水（原单留痕）</h3>
      <ul className="log">
        {order.log.map((l, i) => (
          <li key={i} className={`log-${l.level}`}>
            <time>{fmtTime(l.at)}</time>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
