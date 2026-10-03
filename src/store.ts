import { reducer } from "./domain";
import { createSeedState } from "./seed";
import { TuneServer } from "./server";
import { Action, ServerState } from "./types";

const OUTBOX_KEY = "tune.client.outbox.v1";

export type OutboxStatus = "待发送" | "发送中" | "服务端驳回";

export interface OutboxMessage {
  idemKey: string;
  action: Action;
  label: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: OutboxStatus;
}

type Listener = () => void;

/**
 * 前台 / 技师共用的客户端：
 * - 在线：动作直发服务端；
 * - 断网：动作进本地发件箱（持久化，刷新/第二天仍在），界面先按本地推断展示；
 * - 上线：FIFO 重放，带幂等键；成功同步权威状态，驳回动作退回「服务端驳回」给人工处理。
 */
export class TuneStore {
  server: TuneServer;
  state: ServerState;
  outbox: OutboxMessage[] = [];
  online = true;
  version = 0;
  private listeners = new Set<Listener>();

  constructor() {
    this.server = new TuneServer();
    this.state = this.server.state;
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (raw) this.outbox = JSON.parse(raw) as OutboxMessage[];
    // 重放未确认步骤的本地乐观状态
    this.state = this.applyOutboxLocally(this.state);
    this.online = this.server.online;
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    window.addEventListener("storage", this.onStorage);
    return () => {
      this.listeners.delete(fn);
      window.removeEventListener("storage", this.onStorage);
    };
  };

  getSnapshot = (): ServerState => this.state;
  getVersion = (): number => this.version;
  getOutbox = (): OutboxMessage[] => this.outbox;
  isOnline = (): boolean => this.online;

  private onStorage = (e: StorageEvent) => {
    if (e.key === OUTBOX_KEY || e.key?.startsWith("tune.server")) this.emit();
  };

  private emit() {
    this.version += 1;
    this.listeners.forEach((l) => l());
  }

  private persistOutbox() {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.outbox));
  }

  setOnline(v: boolean) {
    this.online = v;
    this.server.setOnline(v);
    if (v) void this.flush();
    else this.emit();
  }

  resetDemo() {
    localStorage.removeItem(OUTBOX_KEY);
    this.server.reset();
    this.state = createSeedState();
    this.outbox = [];
    this.persistOutbox();
    this.emit();
  }

  /** 排队或直发；返回操作说明（失败不抛到 UI 之外） */
  async submit(action: Action, label: string): Promise<string> {
    const idemKey = `${action.type}:${action.orderId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    if (this.online && this.outbox.length === 0) {
      try {
        this.state = await this.server.dispatch(action, idemKey);
        this.emit();
        return "已落盘";
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    }

    // 离线（或队列里还有没发出去的动作）：进发件箱
    const msg: OutboxMessage = {
      idemKey,
      action,
      label,
      createdAt: Date.now(),
      attempts: 0,
      status: "待发送",
    };
    this.outbox.push(msg);
    this.persistOutbox();
    // 本地乐观推断：让技师离线也能看到流程推进
    this.state = this.applyOutboxLocally(this.server.state);
    this.emit();
    if (this.online) void this.flush();
    return "断网暂存，上线后自动重放";
  }

  /** 用纯归约器在本地推断发件箱效果（与服务端同一份逻辑，保证重放一致） */
  private applyOutboxLocally(base: ServerState): ServerState {
    let s = base;
    for (const m of this.outbox) {
      if (m.status === "服务端驳回") continue;
      try {
        s = reducer(s, m.action);
      } catch {
        // 本地推断忽略门禁失败，以服务端重放结果为准
      }
    }
    return s;
  }

  /** 上线后重放未确认步骤：按发件箱顺序逐个发送（单飞，避免并发重入） */
  private flushing: Promise<void> | null = null;

  flush(): Promise<void> {
    if (!this.online) return Promise.resolve();
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<void> {
    for (const msg of this.outbox) {
      if (msg.status === "发送中" || msg.status === "服务端驳回") continue;
      msg.status = "发送中";
      msg.attempts += 1;
      this.emit();
      try {
        await this.server.dispatch(msg.action, msg.idemKey);
        // 成功：从队列移除
        this.outbox = this.outbox.filter((m) => m.idemKey !== msg.idemKey);
        this.persistOutbox();
      } catch (e) {
        msg.status = "服务端驳回";
        msg.lastError = e instanceof Error ? e.message : String(e);
        this.persistOutbox();
        this.emit();
        // 后续动作保持排队（顺序一致，等前台/技师处理驳回项后再重试）
        // 以服务端权威状态为准刷新一次界面
        this.state = this.server.state;
        return;
      }
    }
    // 全部重放完成：以服务端权威状态为准
    this.state = this.server.state;
    this.emit();
  }

  /** 驳回项处理后，人工重试 */
  retryRejected() {
    for (const m of this.outbox) {
      if (m.status === "服务端驳回") {
        m.status = "待发送";
        m.lastError = undefined;
      }
    }
    this.persistOutbox();
    this.state = this.applyOutboxLocally(this.server.state);
    this.emit();
    void this.flush();
  }

  dropRejected() {
    this.outbox = this.outbox.filter((m) => m.status !== "服务端驳回");
    this.persistOutbox();
    this.state = this.applyOutboxLocally(this.server.state);
    this.emit();
  }

  /** 「第二天上线」：刷新后服务端数据恢复，发件箱继续重放 */
  resyncAfterOutage() {
    this.state = this.server.state;
    this.online = true;
    this.server.setOnline(true);
    void this.flush();
  }
}

export const store = new TuneStore();
