import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Board,
  ConflictRecord,
  DamageRecord,
  DB,
  PendingStep,
  Recipe,
  RetuneOrder,
  WorkOrder,
} from "./types";
import { seedDB } from "./seed";
import { calcDiffs, evaluateBaseChange, nowISO } from "./utils";

const STORAGE_KEY = "ski-tune-db-v1";

function loadDB(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* ignore */
  }
  return seedDB();
}

function persist(db: DB) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

export interface Toast {
  id: string;
  type: "success" | "warn" | "error" | "info";
  message: string;
}

interface RecipeFields {
  sideEdge: number;
  baseEdge: number;
  wax: string;
  note?: string;
}

interface StoreCtx {
  db: DB;
  online: boolean;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  setOnline: (v: boolean) => void;
  simulateNextDay: () => void;
  addDamage: (input: Omit<DamageRecord, "id" | "recordedAt">) => Promise<void>;
  saveRecipe: (boardId: string, fields: RecipeFields, savedBy: string) => Promise<void>;
  concurrentSave: (boardId: string) => Promise<void>;
  generateRetune: (boardId: string) => Promise<void>;
  confirmMeasured: (
    retuneId: string,
    measured: { sideEdge: number; baseEdge: number; wax: string; technician: string }
  ) => Promise<void>;
  startRetune: (retuneId: string) => Promise<void>;
  completeRetune: (retuneId: string) => Promise<void>;
  resolveConflict: (conflictId: string, adopt: boolean) => Promise<void>;
  retryStep: (stepId: string) => Promise<void>;
  retryAll: () => Promise<void>;
}

const Ctx = createContext<StoreCtx | null>(null);

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36).slice(-4)}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(loadDB);
  const [online, setOnlineState] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dbRef = useRef(db);
  dbRef.current = db;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  // 落盘互斥锁：保证同一时刻只有一个配方提交能命中版本号
  const lockRef = useRef<Promise<unknown>>(Promise.resolve());

  const commit = useCallback((next: DB) => {
    dbRef.current = next;
    setDb(next);
    persist(next);
  }, []);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = rid("T");
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 6000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const setOnline = useCallback(
    (v: boolean) => {
      setOnlineState(v);
      if (v) {
        const pending = dbRef.current.pendingSteps.filter((s) => s.status === "待重试");
        pushToast(
          "info",
          pending.length > 0
            ? `网络已恢复：本地复调单数据完好，${pending.length} 个断网期间未确认步骤待技师重试`
            : "网络已恢复，车间系统在线"
        );
      } else {
        pushToast("warn", "车间断网：所有确认操作将进入待重试队列，复调单本地保留不丢失");
      }
    },
    [pushToast]
  );

  const simulateNextDay = useCallback(() => {
    setOnlineState(true);
    const pending = dbRef.current.pendingSteps.filter((s) => s.status === "待重试");
    pushToast(
      "success",
      `第二天上线：复调单已从本地恢复（${pending.length} 个步骤待重试），技师可继续未完成的确认`
    );
  }, [pushToast]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [setOnline]);

  /** 断网时把操作记入待重试队列，本地落盘 */
  function queueStep(
    kind: PendingStep["kind"],
    payload: Record<string, unknown>,
    reason: string,
    refs: { boardId?: string; retuneId?: string; conflictId?: string } = {}
  ): { queued: true } {
    const next: DB = { ...dbRef.current };
    const step: PendingStep = {
      id: `PS-${String(next.meta.stepSeq + 1).padStart(3, "0")}`,
      kind,
      payload,
      boardId: refs.boardId,
      retuneId: refs.retuneId,
      conflictId: refs.conflictId,
      createdAt: nowISO(),
      reason,
      status: "待重试",
      attempts: 0,
    };
    next.meta = { ...next.meta, stepSeq: next.meta.stepSeq + 1 };
    next.pendingSteps = [...next.pendingSteps, step];
    commit(next);
    pushToast("warn", `已断网：操作未送达，已作为待重试步骤本地保存（${reason}）`);
    return { queued: true };
  }

  // ---------- 底板损伤 ----------
  const addDamage = useCallback(
    async (input: Omit<DamageRecord, "id" | "recordedAt">) => {
      if (!onlineRef.current) {
        queueStep("addDamage", input as unknown as Record<string, unknown>, "车间断网，损伤记录未送达", {
          boardId: input.boardId,
        });
        return;
      }
      await delay(200);
      const next: DB = { ...dbRef.current };
      const damage: DamageRecord = { ...input, id: rid("D"), recordedAt: nowISO() };
      next.damages = [...next.damages, damage];
      commit(next);
      pushToast("success", `已记录底板${damage.type} ${damage.lengthCm}cm`);
    },
    [commit, pushToast]
  );

  // ---------- 配方落盘（乐观并发控制：版本号命中先落盘） ----------
  const commitRecipe = useCallback(
    async (
      boardId: string,
      fields: RecipeFields,
      savedBy: string,
      baseVersion: number
    ): Promise<{ conflict?: ConflictRecord }> => {
      const run = (async () => {
        await delay(220 + Math.random() * 260); // 模拟落盘延迟
        const next: DB = { ...dbRef.current };
        const board = next.boards.find((b) => b.id === boardId);
        if (!board) throw new Error("雪板不存在");
        const current = next.recipes.find(
          (r) => r.boardId === boardId && r.status === "生效中"
        );
        if (current && current.version !== baseVersion) {
          // 版本号未命中 → 后保存的改动不得覆盖原单，另列冲突待选
          const loser: Recipe = {
            id: rid("RCP"),
            boardId,
            sideEdge: fields.sideEdge,
            baseEdge: fields.baseEdge,
            wax: fields.wax,
            version: current.version + 1,
            savedBy,
            savedAt: nowISO(),
            status: "历史",
            note: fields.note,
          };
          const conflict: ConflictRecord = {
            id: `CF-${String(next.meta.conflictSeq + 1).padStart(3, "0")}`,
            boardId,
            detectedAt: nowISO(),
            firstRecipe: {
              id: current.id,
              version: current.version,
              sideEdge: current.sideEdge,
              baseEdge: current.baseEdge,
              wax: current.wax,
              savedBy: current.savedBy,
              savedAt: current.savedAt,
            },
            loserRecipe: {
              id: loser.id,
              version: loser.version,
              sideEdge: loser.sideEdge,
              baseEdge: loser.baseEdge,
              wax: loser.wax,
              savedBy: loser.savedBy,
              savedAt: loser.savedAt,
            },
            basisWorkOrderId:
              next.workOrders.find((w) => w.basisRecipeId === current.id)?.id ?? "",
            status: "待选择",
          };
          next.meta = { ...next.meta, conflictSeq: next.meta.conflictSeq + 1 };
          next.conflicts = [...next.conflicts, conflict];
          commit(next);
          return { conflict };
        }
        // 先落盘：旧配方转历史，生成新版本，并作为新工单依据
        if (current) {
          next.recipes = next.recipes.map((r) =>
            r.id === current.id ? { ...r, status: "历史" as const } : r
          );
        }
        const recipe: Recipe = {
          id: `RCP-${String(next.meta.recipeSeq + 1).padStart(3, "0")}`,
          boardId,
          sideEdge: fields.sideEdge,
          baseEdge: fields.baseEdge,
          wax: fields.wax,
          version: (current?.version ?? 0) + 1,
          savedBy,
          savedAt: nowISO(),
          status: "生效中",
          note: fields.note,
        };
        next.meta = { ...next.meta, recipeSeq: next.meta.recipeSeq + 1 };
        next.recipes = [...next.recipes, recipe];
        const wo: WorkOrder = {
          id: `ORD-${String(next.meta.orderSeq + 1).padStart(3, "0")}`,
          boardId,
          customerId: board.customerId,
          kind: "新配方草稿",
          status: "草稿",
          items: `新配方 侧刃${fields.sideEdge}°/底刃${fields.baseEdge}° ${fields.wax}（${savedBy} 落盘，先落盘版本作为本单依据）`,
          createdAt: nowISO(),
          basisRecipeId: recipe.id,
        };
        next.meta = { ...next.meta, orderSeq: next.meta.orderSeq + 1 };
        next.workOrders = [...next.workOrders, wo];
        commit(next);
        return {};
      })();
      // 串行化落盘，模拟「同一时刻」的先后顺序
      const prev = lockRef.current;
      lockRef.current = prev.then(() => run, () => run).catch(() => undefined);
      return prev.then(() => run, () => run);
    },
    [commit]
  );

  const saveRecipe = useCallback(
    async (boardId: string, fields: RecipeFields, savedBy: string) => {
      if (!onlineRef.current) {
        queueStep(
          "saveRecipe",
          { boardId, fields, savedBy, baseVersion: dbRef.current.recipes.find(
            (r) => r.boardId === boardId && r.status === "生效中"
          )?.version ?? 0 },
          "车间断网，配方落盘未送达",
          { boardId }
        );
        return;
      }
      const baseVersion =
        dbRef.current.recipes.find((r) => r.boardId === boardId && r.status === "生效中")
          ?.version ?? 0;
      const result = await commitRecipe(boardId, fields, savedBy, baseVersion);
      if (result.conflict) {
        pushToast(
          "warn",
          `检测到并发保存：${result.conflict.loserRecipe.savedBy} 的后保存版本未覆盖原单，已列入冲突待选择`
        );
      } else {
        pushToast("success", `配方已落盘，新版本已作为新工单依据`);
      }
    },
    [commitRecipe, pushToast]
  );

  /** 模拟两名前台同一时刻保存同一客户的新配方 */
  const concurrentSave = useCallback(
    async (boardId: string) => {
      if (!onlineRef.current) {
        queueStep(
          "saveRecipe",
          {
            boardId,
            fields: { sideEdge: 87, baseEdge: 1.5, wax: "高温蜡", note: "前台小孙 季前重调" },
            savedBy: "前台小孙",
            baseVersion: 0,
          },
          "车间断网，并发保存未送达",
          { boardId }
        );
        return;
      }
      const baseVersion =
        dbRef.current.recipes.find((r) => r.boardId === boardId && r.status === "生效中")
          ?.version ?? 0;
      const [ra, rb] = await Promise.all([
        commitRecipe(
          boardId,
          { sideEdge: 87, baseEdge: 1.5, wax: "高温蜡", note: "前台小孙 季前重调" },
          "前台小孙",
          baseVersion
        ),
        commitRecipe(
          boardId,
          { sideEdge: 88, baseEdge: 1, wax: "低温蜡", note: "前台小周 客户口述偏好" },
          "前台小周",
          baseVersion
        ),
      ]);
      const loser = ra.conflict ?? rb.conflict;
      if (loser) {
        pushToast(
          "info",
          `前台小孙 先落盘，已作为新工单依据；前台小周 的改动后保存，未覆盖原单，已另列待前台选择`
        );
      } else {
        pushToast("success", `两名前台的保存均已落盘，配方版本已更新`);
      }
    },
    [commitRecipe, pushToast]
  );

  // ---------- 换季复调单 ----------
  const generateRetune = useCallback(
    async (boardId: string) => {
      if (!onlineRef.current) {
        queueStep("generateRetune", { boardId }, "车间断网，复调单生成未送达", {
          boardId,
        });
        return;
      }
      await delay(300);
      const next: DB = { ...dbRef.current };
      const board = next.boards.find((b) => b.id === boardId);
      if (!board) return;
      if (next.retuneOrders.some((r) => r.boardId === boardId && r.status !== "完工")) {
        pushToast("warn", "该雪板已有未完工的复调单");
        return;
      }
      const { invalid, changes } = evaluateBaseChange(board, next.damages);
      const seq = next.meta.retuneSeq + 1;
      const id = `R-${String(seq).padStart(3, "0")}`;
      const orderId = `ORD-${String(next.meta.orderSeq + 1).padStart(3, "0")}`;
      const retune: RetuneOrder = {
        id,
        boardId,
        customerId: board.customerId,
        createdAt: nowISO(),
        status: "待重算",
        oldRecipe: { ...board.lastDelivery.recipe, deliveredAt: board.lastDelivery.deliveredAt },
        damageChanged: invalid,
        changeSummary: changes,
        basisWorkOrderId: orderId,
      };
      const wo: WorkOrder = {
        id: orderId,
        boardId,
        customerId: board.customerId,
        kind: "复调",
        status: "待维护",
        items: `换季复调单：读取上次交付参数（${board.lastDelivery.recipe.sideEdge}°/${board.lastDelivery.recipe.baseEdge}° ${board.lastDelivery.recipe.wax}）`,
        createdAt: nowISO(),
        retuneId: id,
      };
      next.meta = { ...next.meta, retuneSeq: seq, orderSeq: next.meta.orderSeq + 1 };
      next.retuneOrders = [...next.retuneOrders, retune];
      next.workOrders = [...next.workOrders, wo];
      commit(next);
      pushToast(
        invalid ? "warn" : "success",
        invalid
          ? `复调单 ${id} 已生成：检测到底板变化，沿用旧配方将失效，请技师重算实测差值`
          : `复调单 ${id} 已生成：底板无变化，配方可沿用，仍需技师实测确认差值`
      );
    },
    [commit, pushToast]
  );

  const confirmMeasured = useCallback(
    async (
      retuneId: string,
      measured: { sideEdge: number; baseEdge: number; wax: string; technician: string }
    ) => {
      if (!onlineRef.current) {
        queueStep(
          "confirmMeasured",
          { retuneId, measured },
          "车间断网，实测差值确认未送达",
          { retuneId }
        );
        return;
      }
      await delay(250);
      const next: DB = { ...dbRef.current };
      const retune = next.retuneOrders.find((r) => r.id === retuneId);
      if (!retune) return;
      const diffs = calcDiffs(retune.oldRecipe, measured);
      next.retuneOrders = next.retuneOrders.map((r) =>
        r.id === retuneId
          ? {
              ...r,
              status: "已确认",
              measured: { ...measured, confirmedAt: nowISO(), confirmedBy: measured.technician },
              diffs,
            }
          : r
      );
      next.workOrders = next.workOrders.map((w) =>
        w.id === retune.basisWorkOrderId
          ? {
              ...w,
              items: w.items.replace(/（.*?）$/, "") + `；实测差值已确认（差值 ${diffs.sideEdge}/${diffs.baseEdge}）`,
            }
          : w
      );
      commit(next);
      pushToast(
        "success",
        `实测差值已确认：侧刃差 ${diffs.sideEdge}°，底刃差 ${diffs.baseEdge}°，可以开工`
      );
    },
    [commit, pushToast]
  );

  const startRetune = useCallback(
    async (retuneId: string) => {
      if (!onlineRef.current) {
        queueStep("startRetune", { retuneId }, "车间断网，开工确认未送达", { retuneId });
        return;
      }
      await delay(200);
      const next: DB = { ...dbRef.current };
      const retune = next.retuneOrders.find((r) => r.id === retuneId);
      if (!retune || retune.status !== "已确认") {
        pushToast("warn", "请先确认实测差值后再开工");
        return;
      }
      next.retuneOrders = next.retuneOrders.map((r) =>
        r.id === retuneId ? { ...r, status: "施工中" } : r
      );
      next.workOrders = next.workOrders.map((w) =>
        w.id === retune.basisWorkOrderId ? { ...w, status: "进行中" } : w
      );
      commit(next);
      pushToast("success", `复调单 ${retuneId} 已开工，工单状态更新为进行中`);
    },
    [commit, pushToast]
  );

  const completeRetune = useCallback(
    async (retuneId: string) => {
      if (!onlineRef.current) {
        queueStep("completeRetune", { retuneId }, "车间断网，完工确认未送达", { retuneId });
        return;
      }
      await delay(250);
      const next: DB = { ...dbRef.current };
      const retune = next.retuneOrders.find((r) => r.id === retuneId);
      if (!retune || !retune.measured) return;
      // 完工交付：回写上次交付参数与底板快照，作为明年复调的读取基准
      next.boards = next.boards.map((b) =>
        b.id === retune.boardId
          ? {
              ...b,
              lastDelivery: {
                deliveredAt: nowISO(),
                recipe: {
                  sideEdge: retune.measured!.sideEdge,
                  baseEdge: retune.measured!.baseEdge,
                  wax: retune.measured!.wax,
                },
                damageSnapshot: next.damages
                  .filter((d) => d.boardId === retune.boardId)
                  .map((d) => ({
                    damageId: d.id,
                    type: d.type,
                    material: d.material,
                    lengthCm: d.lengthCm,
                    x: d.x,
                    y: d.y,
                    note: d.note,
                  })),
              },
            }
          : b
      );
      next.retuneOrders = next.retuneOrders.map((r) =>
        r.id === retuneId ? { ...r, status: "完工" } : r
      );
      next.workOrders = next.workOrders.map((w) =>
        w.id === retune.basisWorkOrderId
          ? { ...w, status: "完工", items: w.items + "；换季复调完工交付" }
          : w
      );
      commit(next);
      pushToast("success", `复调单 ${retuneId} 已完工交付，交付参数已回写为下季基准`);
    },
    [commit, pushToast]
  );

  // ---------- 冲突处理：后保存版本另列选择，不覆盖原单 ----------
  const resolveConflict = useCallback(
    async (conflictId: string, adopt: boolean) => {
      if (!onlineRef.current) {
        queueStep(
          adopt ? "adoptConflict" : "discardConflict",
          { conflictId, adopt },
          "车间断网，冲突处理未送达",
          { conflictId }
        );
        return;
      }
      await delay(200);
      const next: DB = { ...dbRef.current };
      const conflict = next.conflicts.find((c) => c.id === conflictId);
      if (!conflict || conflict.status !== "待选择") return;
      if (adopt) {
        // 另起草稿工单，原单（先落盘依据）不受影响
        const orderId = `ORD-${String(next.meta.orderSeq + 1).padStart(3, "0")}`;
        const wo: WorkOrder = {
          id: orderId,
          boardId: conflict.boardId,
          customerId: next.boards.find((b) => b.id === conflict.boardId)?.customerId ?? "",
          kind: "新配方草稿",
          status: "草稿",
          items: `采用后保存版本：侧刃${conflict.loserRecipe.sideEdge}°/底刃${conflict.loserRecipe.baseEdge}° ${conflict.loserRecipe.wax}（${conflict.loserRecipe.savedBy}）；先落盘原单 ${conflict.basisWorkOrderId} 未被覆盖`,
          createdAt: nowISO(),
        };
        next.meta = { ...next.meta, orderSeq: next.meta.orderSeq + 1 };
        next.workOrders = [...next.workOrders, wo];
        next.conflicts = next.conflicts.map((c) =>
          c.id === conflictId ? { ...c, status: "已采用", adoptedWorkOrderId: orderId } : c
        );
        commit(next);
        pushToast("success", `已采用后保存版本：另起草稿工单 ${orderId}，原单 ${conflict.basisWorkOrderId} 未受影响`);
      } else {
        next.conflicts = next.conflicts.map((c) =>
          c.id === conflictId ? { ...c, status: "已丢弃" } : c
        );
        commit(next);
        pushToast("info", "后保存版本已丢弃，原单保持不变");
      }
    },
    [commit, pushToast]
  );

  // ---------- 断网重试 ----------
  const runStep = useCallback(
    async (step: PendingStep) => {
      const p = step.payload;
      switch (step.kind) {
        case "addDamage": {
          const input = p as unknown as Omit<DamageRecord, "id" | "recordedAt">;
          await addDamage(input);
          break;
        }
        case "generateRetune": {
          await generateRetune(p.boardId as string);
          break;
        }
        case "saveRecipe": {
          const boardId = p.boardId as string;
          const fields = p.fields as RecipeFields;
          const savedBy = p.savedBy as string;
          const baseVersion = p.baseVersion as number;
          const result = await commitRecipe(boardId, fields, savedBy, baseVersion);
          if (result.conflict) {
            pushToast("warn", "重试时检测到新版本已落盘，后保存改动仍未覆盖原单，已列入冲突待选择");
          }
          break;
        }
        case "confirmMeasured": {
          const measured = p.measured as {
            sideEdge: number;
            baseEdge: number;
            wax: string;
            technician: string;
          };
          await confirmMeasured(p.retuneId as string, measured);
          break;
        }
        case "startRetune":
          await startRetune(p.retuneId as string);
          break;
        case "completeRetune":
          await completeRetune(p.retuneId as string);
          break;
        case "adoptConflict":
          await resolveConflict(p.conflictId as string, true);
          break;
        case "discardConflict":
          await resolveConflict(p.conflictId as string, false);
          break;
      }
    },
    [addDamage, commitRecipe, confirmMeasured, startRetune, completeRetune, resolveConflict, generateRetune, pushToast]
  );

  const retryStep = useCallback(
    async (stepId: string) => {
      const step = dbRef.current.pendingSteps.find((s) => s.id === stepId);
      if (!step || step.status !== "待重试") return;
      if (!onlineRef.current) {
        pushToast("error", "仍处于断网状态，无法重试");
        return;
      }
      let next: DB = { ...dbRef.current };
      next.pendingSteps = next.pendingSteps.map((s) =>
        s.id === stepId ? { ...s, attempts: s.attempts + 1 } : s
      );
      commit(next);
      try {
        await runStep(step);
        next = { ...dbRef.current };
        next.pendingSteps = next.pendingSteps.map((s) =>
          s.id === stepId ? { ...s, status: "重试成功", lastError: undefined } : s
        );
        commit(next);
        pushToast("success", `步骤 ${stepId} 重试成功，复调单已恢复`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        next = { ...dbRef.current };
        next.pendingSteps = next.pendingSteps.map((s) =>
          s.id === stepId ? { ...s, status: "重试失败", lastError: msg } : s
        );
        commit(next);
        pushToast("error", `步骤 ${stepId} 重试失败：${msg}`);
      }
    },
    [commit, pushToast, runStep]
  );

  const retryAll = useCallback(async () => {
    const pending = dbRef.current.pendingSteps.filter((s) => s.status === "待重试");
    for (const s of pending) {
      await retryStep(s.id);
    }
  }, [retryStep]);

  return (
    <Ctx.Provider
      value={{
        db,
        online,
        toasts,
        dismissToast,
        setOnline,
        simulateNextDay,
        addDamage,
        saveRecipe,
        concurrentSave,
        generateRetune,
        confirmMeasured,
        startRetune,
        completeRetune,
        resolveConflict,
        retryStep,
        retryAll,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
