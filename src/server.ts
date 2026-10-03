import { reducer } from "./domain";
import { createSeedState } from "./seed";
import { Action, ServerState } from "./types";

const STATE_KEY = "tune.server.state.v1";
const IDEMPOTENCY_KEY = "tune.server.idem.v1";

type CachedResult =
  | { ok: true; state: ServerState }
  | { ok: false; error: string };

/**
 * 模拟车间服务器：localStorage 持久化 + 幂等键缓存。
 * 断网第二天上线，存储仍在；同一幂等键重放返回首次结果，绝不重复执行。
 */
export class TuneServer {
  state: ServerState;
  online = true;
  latencyMs = 250;
  private idem: Record<string, CachedResult>;

  constructor() {
    const raw = localStorage.getItem(STATE_KEY);
    this.state = raw ? (JSON.parse(raw) as ServerState) : createSeedState();
    const idemRaw = localStorage.getItem(IDEMPOTENCY_KEY);
    this.idem = idemRaw ? JSON.parse(idemRaw) : {};
  }

  reset() {
    this.state = createSeedState();
    this.idem = {};
    this.persist();
  }

  setOnline(v: boolean) {
    this.online = v;
  }

  private persist() {
    localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
    localStorage.setItem(IDEMPOTENCY_KEY, JSON.stringify(this.idem));
  }

  /** 按动作顺序串行落盘：并发保存时先到先成为「原单依据」 */
  async dispatch(action: Action, idemKey: string): Promise<ServerState> {
    await new Promise((r) => setTimeout(r, this.latencyMs));
    if (!this.online) throw new Error("车间网络中断，请求未送达");

    const cached = this.idem[idemKey];
    if (cached) {
      if (cached.ok) this.state = cached.state;
      // 重放首次的成败结果，不再次执行业务
      if (cached.ok) return this.state;
      throw new Error(cached.error + "（幂等重放：沿用首次失败结果）");
    }

    try {
      this.state = reducer(this.state, action);
      this.idem[idemKey] = { ok: true, state: this.state };
      this.persist();
      return this.state;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.idem[idemKey] = { ok: false, error: msg };
      this.persist();
      throw new Error(msg);
    }
  }
}
