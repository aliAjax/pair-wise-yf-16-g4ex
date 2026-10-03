import {
  Action,
  Board,
  DomainError,
  EdgeDeltas,
  EdgeMeasurement,
  OrderStage,
  Recipe,
  RecipeVersion,
  RetuneOrder,
  ServerState,
  WorkStep,
} from "./types";

// ---------- 底板指纹：损伤 + 修补材料 ----------
// 交付时与本次复调时各算一次；划痕新增、底刃更换、修补材料变化都会改变指纹。

export function boardFingerprint(board: Board): string {
  const d = [...board.baseDamages]
    .map((x) => `${x.position}/${x.lengthCm}/${x.depthMm}/${x.severity}/${x.status}`)
    .sort();
  const m = [...board.repairMaterials]
    .map((x) => `${x.kind}/${x.brand}`)
    .sort();
  const raw = JSON.stringify({ d, m });
  // 短 FNV-1a 哈希，界面上可读
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

export function recipeFingerprint(recipe: Recipe): string {
  return JSON.stringify([
    recipe.baseAngle,
    recipe.sideAngle,
    recipe.detuneMm,
    recipe.waxType,
  ]);
}

// ---------- 工序 ----------

export const WORK_STEPS: { id: string; name: string }[] = [
  { id: "s1", name: "底板复检与清污" },
  { id: "s2", name: "刃角实测 · 差值重算" },
  { id: "s3", name: "刃部打磨" },
  { id: "s4", name: "底板修补" },
  { id: "s5", name: "打蜡修边" },
  { id: "s6", name: "终检交付" },
];

export function freshSteps(): WorkStep[] {
  return WORK_STEPS.map((s) => ({ id: s.id, name: s.name, status: "pending" }));
}

// ---------- 派生查询 ----------

export function getBoard(state: ServerState, order: RetuneOrder): Board {
  const board = state.boards.find((b) => b.id === order.boardId);
  if (!board) throw new DomainError(`找不到雪板 ${order.boardId}`);
  return board;
}

export function getOrder(state: ServerState, orderId: string): RetuneOrder {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) throw new DomainError(`找不到复调单 ${orderId}`);
  return order;
}

/** 配方是否因底板变化失效：当前指纹 != 上次交付锁定的指纹 */
export function baseChangedSinceDelivery(state: ServerState, order: RetuneOrder): boolean {
  const board = getBoard(state, order);
  return boardFingerprint(board) !== board.baseFingerprintAtDelivery;
}

/** 当前作为工单依据的版本 */
export function activeRecipe(order: RetuneOrder): RecipeVersion | undefined {
  return (
    order.recipes.find((r) => r.status === "原单依据" || r.status === "采纳") ??
    undefined
  );
}

/** 待前台裁决的后保存版本 */
export function pendingAlternatives(order: RetuneOrder): RecipeVersion[] {
  return order.recipes.filter((r) => r.status === "待前台裁决");
}

/**
 * 沿用配方是否有效：
 * 1) 存在可作为依据的版本；2) 该版本所依据的底板指纹与当前一致。
 * 底刃更换 / 新增划痕 / 修补材料变化 -> 指纹变 -> 沿用失效，必须重算。
 */
export function recipeValid(state: ServerState, order: RetuneOrder): boolean {
  const recipe = activeRecipe(order);
  if (!recipe) return false;
  return recipe.basedOnFingerprint === boardFingerprint(getBoard(state, order));
}

/** 实测差值 = 配方目标 - 当前实测（正值=还要磨去多少） */
export function calcDeltas(
  recipe: Recipe,
  measurement: EdgeMeasurement
): EdgeDeltas {
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    baseDelta: round(recipe.baseAngle - measurement.baseActual),
    sideDelta: round(recipe.sideAngle - measurement.sideActual),
  };
}

export function orderStage(state: ServerState, order: RetuneOrder): OrderStage {
  if (order.steps.every((s) => s.status === "confirmed")) return "完工";
  if (order.steps.some((s) => s.status === "confirmed")) return "施工中";
  if (measurementReady(state, order)) return "待开工";
  return "待重算";
}

export function measurementReady(state: ServerState, order: RetuneOrder): boolean {
  return (
    !!order.measurement &&
    !!order.deltas &&
    recipeValid(state, order) &&
    order.measurement.fingerprint === boardFingerprint(getBoard(state, order))
  );
}

/** 步骤开工门禁：未过门禁的步骤技师不能确认 */
export function stepGate(
  state: ServerState,
  order: RetuneOrder,
  stepId: string
): { ok: boolean; reason?: string } {
  const idx = WORK_STEPS.findIndex((s) => s.id === stepId);
  const prev = WORK_STEPS.slice(0, idx);
  for (const p of prev) {
    const st = order.steps.find((s) => s.id === p.id);
    if (st?.status !== "confirmed") return { ok: false, reason: `需先完成「${p.name}」` };
  }
  if (stepId === "s2" || stepId === "s3") {
    if (!activeRecipe(order))
      return { ok: false, reason: "尚无作为工单依据的刃角配方" };
  }
  if (stepId === "s3" && !measurementReady(state, order)) {
    if (!recipeValid(state, order))
      return { ok: false, reason: "底板已变化，旧配方失效：须重算实测差值后才能打磨" };
    return { ok: false, reason: "刃角实测差值未确认，不能开工打磨" };
  }
  return { ok: true };
}

// ---------- 纯归约器：服务端唯一的状态变更逻辑 ----------

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq}`;
}

function withOrder(
  state: ServerState,
  orderId: string,
  fn: (order: RetuneOrder) => void
): void {
  const order = getOrder(state, orderId);
  fn(order);
}

function log(order: RetuneOrder, level: "info" | "warn" | "error", text: string) {
  order.log.unshift({ at: Date.now(), level, text });
}

export function reducer(state: ServerState, action: Action): ServerState {
  // 结构化拷贝；数据量小，直接深拷贝保证纯函数语义
  const next: ServerState = structuredClone(state);

  switch (action.type) {
    case "ADD_BASE_DAMAGE": {
      withOrder(next, action.orderId, (order) => {
        const board = getBoard(next, order);
        board.baseDamages.push({ ...action.damage, id: nextId("DMG") });
        // 指纹因此变化：若配方是按旧底板存的，立即判失效
        const recipe = activeRecipe(order);
        log(
          order,
          "warn",
          `底板新增划痕「${action.damage.position} ${action.damage.lengthCm}cm/${action.damage.severity}」，指纹 ${board.baseFingerprintAtDelivery} → ${boardFingerprint(board)}` +
            (recipe ? "；原配方与新底板不符，标记失效" : "")
        );
      });
      return next;
    }

    case "ADD_REPAIR_MATERIAL": {
      withOrder(next, action.orderId, (order) => {
        const board = getBoard(next, order);
        board.repairMaterials.push({ ...action.material, id: nextId("MAT") });
        const replacedEdge = action.material.kind === "更换底刃";
        log(
          order,
          "warn",
          `修补材料新增「${action.material.kind} ${action.material.brand}」` +
            (replacedEdge ? "（底刃已更换）" : "") +
            `，指纹 ${board.baseFingerprintAtDelivery} → ${boardFingerprint(board)}；旧配方不可直接沿用`
        );
      });
      return next;
    }

    case "SAVE_RECIPE": {
      withOrder(next, action.orderId, (order) => {
        const board = getBoard(next, order);
        const fp = boardFingerprint(board);
        const sameSpec = (r: RecipeVersion) => recipeFingerprint(r) === recipeFingerprint(action.spec);

        // 幂等重放：同一前台对同一参数重复提交（断网重发）-> 不产生新版本
        const existing = order.recipes.find(
          (r) =>
            r.station === action.station &&
            r.savedBy === action.savedBy &&
            sameSpec(r)
        );
        if (existing) {
          log(order, "info", `幂等重放：${action.station}（${action.savedBy}）重复保存被忽略`);
          return;
        }

        const version = (order.recipes.length ? Math.max(...order.recipes.map((r) => r.version)) : 0) + 1;
        const hasBasis = order.recipes.some((r) =>
          ["原单依据", "采纳"].includes(r.status)
        );
        const status = hasBasis ? "待前台裁决" : "原单依据";
        const entry: RecipeVersion = {
          ...action.spec,
          version,
          savedBy: action.savedBy,
          station: action.station,
          savedAt: action.at,
          status,
          basedOnFingerprint: fp,
        };
        order.recipes.push(entry);

        if (status === "原单依据") {
          log(
            order,
            "info",
            `${action.station}（${action.savedBy}）率先落盘配方 v${version}，作为本工单依据`
          );
        } else {
          // 后保存：不盖掉原单，另列给前台选择
          const basis = activeRecipe(order);
          log(
            order,
            "warn",
            `${action.station}（${action.savedBy}）后保存 v${version}；原单 v${basis?.version} 保留，v${version} 列为待裁决改动`
          );
        }
      });
      return next;
    }

    case "RESOLVE_ALTERNATIVE": {
      withOrder(next, action.orderId, (order) => {
        const target = order.recipes.find((r) => r.version === action.version);
        if (!target || target.status !== "待前台裁决")
          throw new DomainError("只能裁决处于待裁决状态的配方版本");
        const basis = activeRecipe(order);
        if (!basis) throw new DomainError("缺少原单依据版本");

        if (action.decision === "放弃") {
          target.status = "放弃";
          log(order, "info", `前台（${action.by}）放弃 v${action.version}，仍以 v${basis.version} 为依据`);
        } else {
          // 采纳：原单降级为留档（不删除、不覆盖），新版本成为依据
          basis.status = "原单留档";
          target.status = "采纳";
          // 底板若又变过，旧实测作废
          const board = getBoard(next, order);
          if (order.measurement && order.measurement.fingerprint !== boardFingerprint(board)) {
            order.measurement = undefined;
            order.deltas = undefined;
          }
          log(
            order,
            "info",
            `前台（${action.by}）采纳 v${action.version} 为新依据；v${basis.version} 原单留档可溯`
          );
        }
      });
      return next;
    }

    case "CONFIRM_MEASUREMENT": {
      withOrder(next, action.orderId, (order) => {
        const board = getBoard(next, order);
        const recipe = activeRecipe(order);
        if (!recipe) throw new DomainError("没有作为依据的配方，无法对齐实测");
        const fp = boardFingerprint(board);
        if (recipe.basedOnFingerprint !== fp)
          throw new DomainError("底板已变化（底刃更换/新划痕/新材料），沿用配方已失效，须由前台重新存配方后再重算");
        if (action.baseActual < 0 || action.baseActual > 5 || action.sideActual < 80 || action.sideActual > 90)
          throw new DomainError("实测刃角超出合理范围（底刃 0–5° / 侧刃 80–90°）");

        order.measurement = {
          baseActual: action.baseActual,
          sideActual: action.sideActual,
          technician: action.technician,
          measuredAt: Date.now(),
          recipeVersion: recipe.version,
          fingerprint: fp,
        };
        order.deltas = calcDeltas(recipe, order.measurement);
        log(
          order,
          "info",
          `${action.technician} 重算实测差值（对齐 v${recipe.version}）：底刃还差 ${order.deltas.baseDelta}°，侧刃还差 ${order.deltas.sideDelta}°，可开工`
        );
      });
      return next;
    }

    case "CONFIRM_STEP": {
      withOrder(next, action.orderId, (order) => {
        const step = order.steps.find((s) => s.id === action.stepId);
        if (!step) throw new DomainError("未知工序");
        if (step.status === "confirmed") {
          // 断网后重试已确认步骤：幂等，直接返回不重复执行
          log(order, "info", `幂等重放：「${step.name}」已确认，重试被忽略`);
          return;
        }
        const gate = stepGate(next, order, action.stepId);
        if (!gate.ok) throw new DomainError(gate.reason ?? "工序门禁未通过");
        step.status = "confirmed";
        step.confirmedAt = Date.now();
        step.technician = action.technician;
        log(order, "info", `${action.technician} 完成「${step.name}」`);
      });
      return next;
    }

    default:
      return next;
  }
}
