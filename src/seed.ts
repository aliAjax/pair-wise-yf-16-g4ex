import { boardFingerprint, freshSteps } from "./domain";
import { Board, RetuneOrder, ServerState } from "./types";

const DAY = 24 * 60 * 60 * 1000;

// C01：去年手写配方；今年板子已换底刃 + 新材料 + 新增划痕 -> 沿用必失效
const board01: Board = {
  id: "BRD-01",
  customerId: "C01",
  brand: "Burton",
  model: "Custom 156",
  lengthCm: 156,
  shape: "全地域",
  baseDamages: [
    // 这两处是本季新增（交付档案里没有）
    { id: "seed-dmg-1", position: "板腰偏右 32cm", lengthCm: 12, depthMm: 2.5, severity: "深", status: "待补" },
    { id: "seed-dmg-2", position: "板头内侧", lengthCm: 4, depthMm: 0.6, severity: "浅", status: "待补" },
  ],
  repairMaterials: [
    // 底刃已换、补过 P-Tex —— 去年配方对齐的底板已经不存在
    { id: "seed-mat-1", kind: "更换底刃", brand: "Kunto 钢刃" },
    { id: "seed-mat-2", kind: "P-Tex", brand: "黑色 P-Tex 条" },
  ],
  baseFingerprintAtDelivery: "a1b2c3d4", // 去年交付时锁的旧指纹
  lastDeliveredAt: "2026-04-12",
  lastHandwrittenRecipe: {
    baseAngle: 1,
    sideAngle: 88,
    detuneMm: 40,
    waxType: "低温蜡",
    note: "去年手写：侧88 / 底1，头尾各去刃两指",
  },
};

// C02：底板无变化，去年配方可沿用
const board02Base: Board = {
  id: "BRD-02",
  customerId: "C02",
  brand: "Head",
  model: "Race WC 165",
  lengthCm: 165,
  shape: "竞速板",
  baseDamages: [
    { id: "seed-dmg-3", position: "板尾中央", lengthCm: 2, depthMm: 0.3, severity: "浅", status: "已补" },
  ],
  repairMaterials: [{ id: "seed-mat-3", kind: "烧结条", brand: "同色烧结条" }],
  baseFingerprintAtDelivery: "",
  lastDeliveredAt: "2026-04-20",
  lastHandwrittenRecipe: {
    baseAngle: 0.5,
    sideAngle: 87,
    detuneMm: 0,
    waxType: "竞速蜡",
    note: "去年手写：全接触刃，不去刃",
  },
};
board02Base.baseFingerprintAtDelivery = boardFingerprint(board02Base);

// C03：用于演示两名前台同时保存（初始无配方）
const board03: Board = {
  id: "BRD-03",
  customerId: "C03",
  brand: "Ride",
  model: "Deep Fake 158",
  lengthCm: 158,
  shape: "粉雪板",
  baseDamages: [],
  repairMaterials: [{ id: "seed-mat-4", kind: "原厂底板", brand: "sintered 4000" }],
  baseFingerprintAtDelivery: "",
  lastDeliveredAt: "2026-03-30",
  lastHandwrittenRecipe: {
    baseAngle: 1,
    sideAngle: 89,
    detuneMm: 60,
    waxType: "温区蜡",
    note: "去年手写：弱咬雪，大去刃",
  },
};
board03.baseFingerprintAtDelivery = boardFingerprint(board03);

export function createSeedState(): ServerState {
  const base: ServerState = {
    customers: [
      { id: "C01", name: "陈凯", phone: "138****2201", preference: "滑行稳，弱抓雪" },
      { id: "C02", name: "周琳", phone: "139****8866", preference: "卡宾刻滑，咬雪要足" },
      { id: "C03", name: "李然", phone: "136****0512", preference: "公园粉雪兼顾" },
    ],
    boards: [board01, board02Base, board03],
    orders: [
      {
        id: "RT-2601",
        customerId: "C01",
        boardId: "BRD-01",
        season: "2026-27 雪季",
        createdAt: Date.now() - 2 * DAY,
        recipes: [],
        steps: freshSteps(),
        log: [
          {
            at: Date.now() - 2 * DAY,
            level: "warn",
            text: "季前复调：检测到底板已更换底刃并新增划痕，去年手写配方指纹不匹配",
          },
        ],
      },
      {
        id: "RT-2602",
        customerId: "C02",
        boardId: "BRD-02",
        season: "2026-27 雪季",
        createdAt: Date.now() - DAY,
        recipes: [],
        steps: freshSteps(),
        log: [
          {
            at: Date.now() - DAY,
            level: "info",
            text: "季前复调：底板指纹与去年交付一致，手写配方可沿用，待前台确认建档",
          },
        ],
      },
      {
        id: "RT-2603",
        customerId: "C03",
        boardId: "BRD-03",
        season: "2026-27 雪季",
        createdAt: Date.now() - 3 * 60 * 60 * 1000,
        recipes: [],
        steps: freshSteps(),
        log: [
          {
            at: Date.now() - 3 * 60 * 60 * 1000,
            level: "info",
            text: "季前复调：等待前台录入刃角配方",
          },
        ],
      },
    ],
  };
  return structuredClone(base);
}
