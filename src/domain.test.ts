import { describe, expect, it } from "vitest";
import {
  activeRecipe,
  baseChangedSinceDelivery,
  boardFingerprint,
  calcDeltas,
  freshSteps,
  measurementReady,
  reducer,
  recipeValid,
  stepGate,
} from "./domain";
import { createSeedState } from "./seed";
import { Action, ServerState } from "./types";

function orderId(s: ServerState) {
  return s.orders[0].id;
}

describe("底板指纹与配方失效", () => {
  it("底刃更换+新划痕使去年手写配方指纹不匹配，无有效配方时禁止实测/打磨", () => {
    let s = createSeedState();
    const o = s.orders[0];
    expect(o.id).toBe("RT-2601");
    expect(baseChangedSinceDelivery(s, o)).toBe(true);
    expect(recipeValid(s, o)).toBe(false);

    // 没有依据配方，s2/s3 门禁不通过
    expect(stepGate(s, o, "s2").ok).toBe(false);
    expect(stepGate(s, o, "s3").ok).toBe(false);

    // 强行提交实测会被领域规则驳回：先卡「没有依据配方」
    const noBasis: Action = {
      type: "CONFIRM_MEASUREMENT",
      orderId: o.id,
      technician: "老赵",
      baseActual: 0.62,
      sideActual: 88.1,
    };
    expect(() => reducer(s, noBasis)).toThrow(/依据/);

    // 即使前台误存了一版配方，之后底板再变化，实测也会以「失效」被拦
    s = reducer(s, {
      type: "SAVE_RECIPE",
      orderId: o.id,
      savedBy: "前台",
      station: "前台A",
      at: Date.now(),
      spec: { baseAngle: 0.75, sideAngle: 88, detuneMm: 40, waxType: "低温蜡", note: "" },
    });
    s = reducer(s, {
      type: "ADD_BASE_DAMAGE",
      orderId: o.id,
      damage: { position: "板尾新加", lengthCm: 9, depthMm: 1.5, severity: "中", status: "待补" },
    });
    const stale: Action = {
      type: "CONFIRM_MEASUREMENT",
      orderId: o.id,
      technician: "老赵",
      baseActual: 0.62,
      sideActual: 88.1,
    };
    expect(() => reducer(s, stale)).toThrow(/失效/);
  });

  it("新存配方按当前指纹落盘后，技师重算差值，门禁才放行", () => {
    let s = createSeedState();
    const oid = orderId(s);
    const save: Action = {
      type: "SAVE_RECIPE",
      orderId: oid,
      savedBy: "前台小何",
      station: "前台A",
      at: Date.now(),
      spec: {
        baseAngle: 0.75,
        sideAngle: 88,
        detuneMm: 35,
        waxType: "低温蜡",
        note: "换底刃后重开",
      },
    };
    s = reducer(s, save);
    const o = s.orders.find((x) => x.id === oid)!;
    expect(recipeValid(s, o)).toBe(true);
    expect(activeRecipe(o)?.status).toBe("原单依据");

    s = reducer(s, {
      type: "CONFIRM_MEASUREMENT",
      orderId: oid,
      technician: "老赵",
      baseActual: 0.62,
      sideActual: 88.1,
    });
    const o2 = s.orders.find((x) => x.id === oid)!;
    expect(o2.deltas).toEqual({ baseDelta: 0.13, sideDelta: -0.1 });
    expect(measurementReady(s, o2)).toBe(true);

    // 工序顺序：先 s1
    expect(stepGate(s, o2, "s1").ok).toBe(true);
    s = reducer(s, { type: "CONFIRM_STEP", orderId: oid, stepId: "s1", technician: "老赵" });
    s = reducer(s, { type: "CONFIRM_STEP", orderId: oid, stepId: "s2", technician: "老赵" });
    const o3 = s.orders.find((x) => x.id === oid)!;
    expect(stepGate(s, o3, "s3").ok).toBe(true);
  });

  it("指纹在保存后再次变化，已确认的实测作废、打磨重新被拦", () => {
    let s = createSeedState();
    const oid = orderId(s);
    s = reducer(s, {
      type: "SAVE_RECIPE",
      orderId: oid,
      savedBy: "前台小何",
      station: "前台A",
      at: Date.now(),
      spec: { baseAngle: 0.75, sideAngle: 88, detuneMm: 35, waxType: "低温蜡", note: "" },
    });
    s = reducer(s, {
      type: "CONFIRM_MEASUREMENT",
      orderId: oid,
      technician: "老赵",
      baseActual: 0.6,
      sideActual: 88.2,
    });
    // 车间又发现一道新划痕
    s = reducer(s, {
      type: "ADD_BASE_DAMAGE",
      orderId: oid,
      damage: { position: "板尾新加", lengthCm: 8, depthMm: 1.2, severity: "中", status: "待补" },
    });
    const o = s.orders.find((x) => x.id === oid)!;
    expect(recipeValid(s, o)).toBe(false);
    expect(measurementReady(s, o)).toBe(false);
  });
});

describe("两名前台并发保存：先落盘为原单，后保存不覆盖", () => {
  it("两个版本并存，后版本待裁决；采纳后原单留档，放弃则维持原单", () => {
    let s = createSeedState();
    const oid = "RT-2603";

    s = reducer(s, {
      type: "SAVE_RECIPE",
      orderId: oid,
      savedBy: "小何",
      station: "前台A",
      at: 1,
      spec: { baseAngle: 1, sideAngle: 89, detuneMm: 60, waxType: "温区蜡", note: "弱咬雪" },
    });
    s = reducer(s, {
      type: "SAVE_RECIPE",
      orderId: oid,
      savedBy: "阿珊",
      station: "前台B",
      at: 2,
      spec: { baseAngle: 0.75, sideAngle: 88, detuneMm: 45, waxType: "温区蜡", note: "均衡" },
    });

    const o = s.orders.find((x) => x.id === oid)!;
    expect(o.recipes).toHaveLength(2);
    expect(o.recipes[0].status).toBe("原单依据");
    expect(o.recipes[1].status).toBe("待前台裁决");
    expect(activeRecipe(o)?.version).toBe(1);

    // 采纳 v2：原单不删除不覆盖
    s = reducer(s, {
      type: "RESOLVE_ALTERNATIVE",
      orderId: oid,
      version: 2,
      decision: "采纳",
      by: "店长",
    });
    const o2 = s.orders.find((x) => x.id === oid)!;
    expect(o2.recipes[0].status).toBe("原单留档");
    expect(o2.recipes[1].status).toBe("采纳");
    expect(activeRecipe(o2)?.version).toBe(2);

    // 再有第三个保存 -> 仍是待裁决，不能直接盖掉
    s = reducer(s, {
      type: "SAVE_RECIPE",
      orderId: oid,
      savedBy: "小何",
      station: "前台A",
      at: 3,
      spec: { baseAngle: 1.25, sideAngle: 89, detuneMm: 70, waxType: "低温蜡", note: "更弱" },
    });
    const o3 = s.orders.find((x) => x.id === oid)!;
    expect(activeRecipe(o3)?.version).toBe(2);
    expect(o3.recipes[2].status).toBe("待前台裁决");
  });

  it("放弃冲突版本时原单继续有效，指纹一致的旧客户可直接沿用", () => {
    let s = createSeedState();
    const oid = "RT-2602"; // C02 底板未变
    const before = boardFingerprint(s.boards.find((b) => b.id === "BRD-02")!);

    s = reducer(s, {
      type: "SAVE_RECIPE",
      orderId: oid,
      savedBy: "小何",
      station: "前台A",
      at: 1,
      spec: { baseAngle: 0.5, sideAngle: 87, detuneMm: 0, waxType: "竞速蜡", note: "沿用去年" },
    });
    s = reducer(s, {
      type: "SAVE_RECIPE",
      orderId: oid,
      savedBy: "阿珊",
      station: "前台B",
      at: 2,
      spec: { baseAngle: 0.5, sideAngle: 86.5, detuneMm: 0, waxType: "竞速蜡", note: "误存" },
    });
    s = reducer(s, {
      type: "RESOLVE_ALTERNATIVE",
      orderId: oid,
      version: 2,
      decision: "放弃",
      by: "店长",
    });
    const o = s.orders.find((x) => x.id === oid)!;
    expect(activeRecipe(o)?.version).toBe(1);
    expect(recipeValid(s, o)).toBe(true);
    expect(before).toBe(s.boards.find((b) => b.id === "BRD-02")!.baseFingerprintAtDelivery);
  });
});

describe("断网重放：未确认步骤重试不重复执行", () => {
  it("CONFIRM_STEP 对已确认步骤是幂等的", () => {
    let s = createSeedState();
    const oid = "RT-2602";
    s = reducer(s, {
      type: "SAVE_RECIPE",
      orderId: oid,
      savedBy: "小何",
      station: "前台A",
      at: 1,
      spec: { baseAngle: 0.5, sideAngle: 87, detuneMm: 0, waxType: "竞速蜡", note: "" },
    });
    s = reducer(s, { type: "CONFIRM_STEP", orderId: oid, stepId: "s1", technician: "老赵" });
    const once = JSON.stringify(s.orders.find((o) => o.id === oid)!.steps);

    // 第二天上线重试同一未确认/已确认动作
    const s2 = reducer(s, { type: "CONFIRM_STEP", orderId: oid, stepId: "s1", technician: "老赵" });
    const twice = JSON.stringify(s2.orders.find((o) => o.id === oid)!.steps);
    expect(twice).toBe(once);
    // 幂等重放会留一条日志，但步骤状态与时间不变
    const step = s2.orders.find((o) => o.id === oid)!.steps[0];
    expect(step.status).toBe("confirmed");
  });

  it("差值计算为目标-实测，正负值保留", () => {
    const d = calcDeltas(
      { baseAngle: 0.75, sideAngle: 88, detuneMm: 0, waxType: "", note: "" },
      { baseActual: 0.9, sideActual: 87.5, technician: "", measuredAt: 0, recipeVersion: 1, fingerprint: "" }
    );
    expect(d).toEqual({ baseDelta: -0.15, sideDelta: 0.5 });
  });

  it("门禁强制工序顺序", () => {
    const s = createSeedState();
    const o = s.orders.find((x) => x.id === "RT-2602")!;
    expect(stepGate(s, o, "s4")).toMatchObject({ ok: false });
    expect(freshSteps()).toHaveLength(6);
  });
});
