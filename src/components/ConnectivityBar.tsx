import { useState } from "react";
import { store } from "../store";
import { fmtTime } from "./ui";

export function ConnectivityBar({ online, outboxVersion }: { online: boolean; outboxVersion: number }) {
  const outbox = store.getOutbox();
  const [flash, setFlash] = useState("");
  void outboxVersion;

  const show = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), 2200);
  };

  const goOffline = () => {
    store.setOnline(false);
    show("车间已断网：操作进入本地发件箱");
  };
  const goOnline = () => {
    store.setOnline(true);
    void store.flush().then(() => show("已上线：发件箱重放完成（幂等键去重）"));
  };
  const nextDay = () => {
    // 模拟第二天开机上线：服务端持久化恢复，发件箱继续重放未确认步骤
    store.resyncAfterOutage();
    show("第二天上线：复调单恢复，正在重试未确认步骤");
  };

  const pending = outbox.filter((m) => m.status !== "服务端驳回").length;
  const rejected = outbox.filter((m) => m.status === "服务端驳回").length;

  return (
    <div className="conn-bar">
      <div className={`net ${online ? "on" : "off"}`}>
        <span className="dot" />
        {online ? "车间在线" : "车间断网"}
      </div>
      <div className="conn-info">
        发件箱 <b>{pending}</b> 待重放
        {rejected > 0 && <span className="tag red">{rejected} 被驳回</span>}
      </div>
      {outbox.length > 0 && (
        <details className="outbox-pop">
          <summary>查看发件箱</summary>
          <ul>
            {outbox.map((m) => (
              <li key={m.idemKey} className={m.status === "服务端驳回" ? "rej" : ""}>
                <b>{m.label}</b>
                <span>{m.status} · 第 {m.attempts} 次 · {fmtTime(m.createdAt)}</span>
                {m.lastError && <em>驳回原因：{m.lastError}</em>}
              </li>
            ))}
          </ul>
          <div className="outbox-actions">
            <button className="small primary" onClick={() => store.retryRejected()}>重试驳回项</button>
            <button className="small" onClick={() => store.dropRejected()}>丢弃驳回项</button>
          </div>
        </details>
      )}
      <div className="conn-btns">
        {online ? (
          <button onClick={goOffline}>模拟断网</button>
        ) : (
          <button className="primary" onClick={goOnline}>恢复联网并重放</button>
        )}
        <button onClick={nextDay}>⏭ 第二天开机上线</button>
        <button className="ghost" onClick={() => { if (confirm("重置为演示初始数据？")) store.resetDemo(); }}>
          重置演示
        </button>
      </div>
      {flash && <span className="flash">{flash}</span>}
    </div>
  );
}
