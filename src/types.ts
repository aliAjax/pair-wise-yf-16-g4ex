// 季前复调单领域模型

export type BoardShape = "全地域" | "公园板" | "竞速板" | "粉雪板";
export type DamageSeverity = "浅" | "中" | "深";
export type DamageStatus = "待补" | "修补中" | "已补";
export type MaterialKind = "P-Tex" | "烧结条" | "金属片" | "环氧" | "更换底刃" | "原厂底板";

/** 刃角配方（去年那张手写配方 / 前台新存版本） */
export interface EdgeSpec {
  /** 底刃角（度） */
  baseAngle: number;
  /** 侧刃角（度） */
  sideAngle: number;
  /** 头尾去刃长度（mm） */
  detuneMm: number;
}

export interface Recipe extends EdgeSpec {
  waxType: string;
  note: string;
}

export interface BaseDamage {
  id: string;
  position: string;
  lengthCm: number;
  depthMm: number;
  severity: DamageSeverity;
  status: DamageStatus;
}

export interface RepairMaterial {
  id: string;
  kind: MaterialKind;
  brand: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  preference: string;
}

export interface Board {
  id: string;
  customerId: string;
  brand: string;
  model: string;
  lengthCm: number;
  shape: BoardShape;
  baseDamages: BaseDamage[];
  repairMaterials: RepairMaterial[];
  /** 上次交付时锁定的底板指纹（损伤+修补材料） */
  baseFingerprintAtDelivery: string;
  lastDeliveredAt: string;
  /** 上次交付时的手写配方 */
  lastHandwrittenRecipe: Recipe;
}

export type RecipeVersionStatus =
  | "原单依据" // 最先落盘，作为新工单依据
  | "待前台裁决" // 后保存的冲突版本，不能盖掉原单
  | "采纳"
  | "放弃"
  | "原单留档"; // 被新版本替代但原单保留可溯

export interface RecipeVersion extends Recipe {
  version: number;
  savedBy: string;
  station: string;
  savedAt: number;
  status: RecipeVersionStatus;
  /** 保存时所依据的底板指纹 */
  basedOnFingerprint: string;
}

export interface EdgeMeasurement {
  baseActual: number;
  sideActual: number;
  technician: string;
  measuredAt: number;
  /** 实测时对齐的配方版本 */
  recipeVersion: number;
  /** 实测时的底板指纹 */
  fingerprint: string;
}

export interface EdgeDeltas {
  /** 底刃需修磨量（目标 - 实测，度） */
  baseDelta: number;
  /** 侧刃需修磨量（目标 - 实测，度） */
  sideDelta: number;
}

export type StepStatus = "pending" | "confirmed";

export interface WorkStep {
  id: string;
  name: string;
  status: StepStatus;
  confirmedAt?: number;
  technician?: string;
}

export type LogLevel = "info" | "warn" | "error";

export interface OrderLogEntry {
  at: number;
  level: LogLevel;
  text: string;
}

export type OrderStage = "待重算" | "待开工" | "施工中" | "完工";

export interface RetuneOrder {
  id: string;
  customerId: string;
  boardId: string;
  season: string;
  createdAt: number;
  /** 配方版本链：永不覆盖，只追加 + 改状态 */
  recipes: RecipeVersion[];
  measurement?: EdgeMeasurement;
  deltas?: EdgeDeltas;
  steps: WorkStep[];
  log: OrderLogEntry[];
}

export interface ServerState {
  customers: Customer[];
  boards: Board[];
  orders: RetuneOrder[];
}

// ---- 动作（客户端 -> 服务端的唯一变更通道，全部可序列化、带幂等键重放） ----

export type Action =
  | {
      type: "SAVE_RECIPE";
      orderId: string;
      savedBy: string;
      station: string;
      spec: Recipe;
      at: number;
    }
  | {
      type: "RESOLVE_ALTERNATIVE";
      orderId: string;
      version: number;
      decision: "采纳" | "放弃";
      by: string;
    }
  | {
      type: "ADD_BASE_DAMAGE";
      orderId: string;
      damage: Omit<BaseDamage, "id">;
    }
  | {
      type: "ADD_REPAIR_MATERIAL";
      orderId: string;
      material: Omit<RepairMaterial, "id">;
    }
  | {
      type: "CONFIRM_STEP";
      orderId: string;
      stepId: string;
      technician: string;
    }
  | {
      type: "CONFIRM_MEASUREMENT";
      orderId: string;
      technician: string;
      baseActual: number;
      sideActual: number;
    };

export class DomainError extends Error {}
