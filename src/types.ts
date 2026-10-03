// 滑雪板调校店 · 季前复调系统 —— 领域模型

export type ID = string;

export type BoardModel = "全地域" | "公园板" | "竞速板" | "粉雪板";
export type DamageType = "划痕" | "修补" | "P-Tex" | "金属";
export type WorkOrderKind = "维修" | "复调" | "新配方草稿";
export type WorkOrderStatus = "草稿" | "待维护" | "进行中" | "待交付" | "完工";
export type RetuneStatus = "待重算" | "已确认" | "施工中" | "完工";
export type RecipeStatus = "生效中" | "历史";
export type ConflictStatus = "待选择" | "已采用" | "已丢弃";
export type PendingStatus = "待重试" | "重试成功" | "重试失败";

/** 客户档案 */
export interface Customer {
  id: ID;
  name: string;
  phone: string;
  /** 客户偏好，例如「偏好弱咬雪」 */
  preference: string;
  boardIds: ID[];
}

/** 交付时的底板快照（上次交付参数的一部分） */
export interface DamageSnapshotItem {
  damageId: ID;
  type: DamageType;
  material: string;
  lengthCm: number;
  /** 板图坐标 0-100 */
  x: number;
  y: number;
  note?: string;
}

/** 雪板 */
export interface Board {
  id: ID;
  customerId: ID;
  brand: string;
  length: number;
  model: BoardModel;
  /** 上次交付时的参数：换季复调读取的基准 */
  lastDelivery: {
    deliveredAt: string;
    recipe: {
      sideEdge: number; // 侧刃角
      baseEdge: number; // 底刃角
      wax: string; // 打蜡类型
    };
    damageSnapshot: DamageSnapshotItem[];
  };
}

/** 底板损伤记录 */
export interface DamageRecord {
  id: ID;
  boardId: ID;
  x: number;
  y: number;
  type: DamageType;
  material: string;
  lengthCm: number;
  note: string;
  recordedAt: string;
}

/** 刃角配方（带版本号，用于并发落盘冲突检测） */
export interface Recipe {
  id: ID;
  boardId: ID;
  sideEdge: number;
  baseEdge: number;
  wax: string;
  version: number;
  savedBy: string;
  savedAt: string;
  status: RecipeStatus;
  note?: string;
}

/** 维修/复调工单 */
export interface WorkOrder {
  id: ID;
  boardId: ID;
  customerId: ID;
  kind: WorkOrderKind;
  status: WorkOrderStatus;
  items: string;
  createdAt: string;
  basisRecipeId?: ID;
  retuneId?: ID;
}

/** 换季复调单 */
export interface RetuneOrder {
  id: ID;
  boardId: ID;
  customerId: ID;
  createdAt: string;
  status: RetuneStatus;
  /** 上次交付时读取的旧配方 */
  oldRecipe: {
    sideEdge: number;
    baseEdge: number;
    wax: string;
    deliveredAt: string;
  };
  /** 相对交付快照是否发生变化（新增划痕 / 修补材料变化） */
  damageChanged: boolean;
  changeSummary: string[];
  /** 技师重算后的实测差值 */
  measured?: {
    sideEdge: number;
    baseEdge: number;
    wax: string;
    confirmedAt: string;
    confirmedBy: string;
  };
  diffs?: {
    sideEdge: number;
    baseEdge: number;
  };
  /** 新工单依据 —— 先落盘的版本，任何后保存操作都不得覆盖本单 */
  basisWorkOrderId: ID;
}

/** 并发保存冲突：先落盘为新工单依据，后落盘另列待选 */
export interface ConflictRecord {
  id: ID;
  boardId: ID;
  detectedAt: string;
  firstRecipe: {
    id: ID;
    version: number;
    sideEdge: number;
    baseEdge: number;
    wax: string;
    savedBy: string;
    savedAt: string;
  };
  loserRecipe: {
    id: ID;
    version: number;
    sideEdge: number;
    baseEdge: number;
    wax: string;
    savedBy: string;
    savedAt: string;
  };
  /** 先落盘版本已作为该新工单的依据 */
  basisWorkOrderId: ID;
  status: ConflictStatus;
  /** 采用后保存版本时，另起的草稿工单（不覆盖原单） */
  adoptedWorkOrderId?: ID;
}

/** 断网期间未确认、待重试的步骤 */
export interface PendingStep {
  id: ID;
  kind:
    | "confirmMeasured"
    | "startRetune"
    | "completeRetune"
    | "saveRecipe"
    | "adoptConflict"
    | "discardConflict"
    | "addDamage"
    | "generateRetune";
  boardId?: ID;
  retuneId?: ID;
  conflictId?: ID;
  payload: Record<string, unknown>;
  createdAt: string;
  reason: string;
  status: PendingStatus;
  attempts: number;
  lastError?: string;
}

export interface DB {
  customers: Customer[];
  boards: Board[];
  damages: DamageRecord[];
  recipes: Recipe[];
  workOrders: WorkOrder[];
  retuneOrders: RetuneOrder[];
  conflicts: ConflictRecord[];
  pendingSteps: PendingStep[];
  meta: {
    orderSeq: number;
    retuneSeq: number;
    conflictSeq: number;
    recipeSeq: number;
    stepSeq: number;
  };
}
