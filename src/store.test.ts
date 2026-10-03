import { beforeEach, describe, expect, it, vi } from "vitest";
import { Action } from "./types";

// Node 环境下的内存 localStorage 桩（模拟第二天刷新后存储仍在）
function installLocalStorage(): Storage {
  let map = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return map.size;
    },
    clear: () => {
      map = new Map();
    },
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
  globalThis.localStorage = stub;
  return stub;
}

async function freshStore() {
  vi.resetModules();
  installLocalStorage();
  const mod = await import("./store");
  // 不订阅 window 事件，node 下无需 window
  return { TuneStore: mod.TuneStore };
}

describe("端到端：断网 -> 次日上线 -> 重放", () => {
  beforeEach(() => installLocalStorage());

  it("在线直接落盘；断网操作暂存；同一进程恢复后 FIFO 重放成功", async () => {
    const { TuneStore } = await freshStore();
    const client = new TuneStore();

    // 给 RT-2602（指纹一致的客户）在线存配方、确认 s1
    await client.submit(
      { type: "SAVE_RECIPE", orderId: "RT-2602", savedBy: "小何", station: "前台A", at: Date.now(),
        spec: { baseAngle: 0.5, sideAngle: 87, detuneMm: 0, waxType: "竞速蜡", note: "沿用" } },
      "存配方"
    );
    await client.submit({ type: "CONFIRM_STEP", orderId: "RT-2602", stepId: "s1", technician: "老赵" }, "s1");
    let order = client.state.orders.find((o) => o.id === "RT-2602")!;
    expect(order.steps[0].status).toBe("confirmed");

    // 断网：s2 与实测进了发件箱，本地乐观显示已推进，但服务端还不知道
    client.setOnline(false);
    await client.submit(
      { type: "CONFIRM_MEASUREMENT", orderId: "RT-2602", technician: "老赵", baseActual: 0.4, sideActual: 87.2 },
      "实测"
    );
    await client.submit({ type: "CONFIRM_STEP", orderId: "RT-2602", stepId: "s2", technician: "老赵" }, "s2");
    expect(client.getOutbox()).toHaveLength(2);
    // 服务端权威状态仍是断网前
    expect(client.server.state.orders.find((o) => o.id === "RT-2602")!.measurement).toBeUndefined();

    // 恢复：FIFO 重放
    client.setOnline(true);
    await client.flush();
    expect(client.getOutbox()).toHaveLength(0);
    order = client.state.orders.find((o) => o.id === "RT-2602")!;
    expect(order.measurement).toBeDefined();
    expect(order.deltas).toEqual({ baseDelta: 0.1, sideDelta: -0.2 });
    expect(order.steps[1].status).toBe("confirmed");
  });

  it("第二天重新开机上线：持久化恢复，发件箱继续重放，已确认步骤不重复执行", async () => {
    const { TuneStore } = await freshStore();
    const day1 = new TuneStore();
    await day1.submit(
      { type: "SAVE_RECIPE", orderId: "RT-2602", savedBy: "小何", station: "前台A", at: 1,
        spec: { baseAngle: 0.5, sideAngle: 87, detuneMm: 0, waxType: "竞速蜡", note: "沿用" } },
      "存配方"
    );
    // 断网期间确认 s1（未确认步骤的典型：技师点了但没送达）
    day1.setOnline(false);
    await day1.submit({ type: "CONFIRM_STEP", orderId: "RT-2602", stepId: "s1", technician: "老赵" }, "s1");
    expect(day1.getOutbox()).toHaveLength(1);

    // 第二天：页面重新加载 -> 新客户端实例，localStorage 中的复调单与发件箱恢复
    const day2 = new TuneStore();
    expect(day2.state.orders.find((o) => o.id === "RT-2602")!.recipes).toHaveLength(1);
    expect(day2.getOutbox()).toHaveLength(1);
    // 本地乐观状态里 s1 已显示
    expect(day2.state.orders.find((o) => o.id === "RT-2602")!.steps[0].status).toBe("confirmed");

    day2.resyncAfterOutage();
    await day2.flush();
    expect(day2.getOutbox()).toHaveLength(0);
    const srvOrder = day2.server.state.orders.find((o) => o.id === "RT-2602")!;
    expect(srvOrder.steps[0].status).toBe("confirmed");

    // 技师手滑/客户端再次重放同一动作：幂等，不产生第二条完成记录
    const confirmedAt = srvOrder.steps[0].confirmedAt;
    await day2.server.dispatch(
      { type: "CONFIRM_STEP", orderId: "RT-2602", stepId: "s1", technician: "老赵" } as Action,
      "manual-retry-s1"
    );
    const again = day2.server.state.orders.find((o) => o.id === "RT-2602")!;
    expect(again.steps[0].confirmedAt).toBe(confirmedAt);
  });

  it("同一时刻两名前台保存：先落盘 v1 为原单依据，后到 v2 待裁决且不覆盖", async () => {
    const { TuneStore } = await freshStore();
    const client = new TuneStore();
    await Promise.all([
      client.submit(
        { type: "SAVE_RECIPE", orderId: "RT-2603", savedBy: "小何", station: "前台A", at: Date.now(),
          spec: { baseAngle: 1, sideAngle: 89, detuneMm: 60, waxType: "温区蜡", note: "弱咬雪" } },
        "A"
      ),
      client.submit(
        { type: "SAVE_RECIPE", orderId: "RT-2603", savedBy: "阿珊", station: "前台B", at: Date.now(),
          spec: { baseAngle: 0.75, sideAngle: 88, detuneMm: 45, waxType: "温区蜡", note: "均衡" } },
        "B"
      ),
    ]);
    const order = client.state.orders.find((o) => o.id === "RT-2603")!;
    expect(order.recipes).toHaveLength(2);
    expect(order.recipes[0].status).toBe("原单依据");
    expect(order.recipes[1].status).toBe("待前台裁决");

    // 裁决采纳 v2 后再刷新页面：服务端持久化里 v1 仍留档
    await client.submit(
      { type: "RESOLVE_ALTERNATIVE", orderId: "RT-2603", version: 2, decision: "采纳", by: "店长" },
      "采纳v2"
    );
    const reloaded = new TuneStore();
    const o2 = reloaded.state.orders.find((o) => o.id === "RT-2603")!;
    expect(o2.recipes[0]).toMatchObject({ version: 1, status: "原单留档" });
    expect(o2.recipes[1]).toMatchObject({ version: 2, status: "采纳" });
  });

  it("门禁失败的离线重放会被服务端驳回，不会被悄悄吞掉", async () => {
    const { TuneStore } = await freshStore();
    const client = new TuneStore();
    client.setOnline(false);
    // RT-2601 底板已变、无新版配方，离线提交实测重算必然被服务端驳回
    await client.submit(
      { type: "CONFIRM_MEASUREMENT", orderId: "RT-2601", technician: "老赵", baseActual: 0.6, sideActual: 88 },
      "强行实测"
    );
    client.setOnline(true);
    await client.flush();
    const msg = client.getOutbox()[0];
    expect(msg.status).toBe("服务端驳回");
    expect(msg.lastError).toMatch(/依据|配方/);
  });
});
