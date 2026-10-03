import type { Board, DamageRecord, DamageSnapshotItem } from "./types";

/** 格式化日期时间 */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(iso: string): string {
  return fmtDateTime(iso).slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** 底板比对：相对上次交付快照，是否有新增损伤或修补材料变化 */
export function evaluateBaseChange(
  board: Board,
  damages: DamageRecord[]
): { invalid: boolean; changes: string[] } {
  const snapshot = board.lastDelivery.damageSnapshot;
  const current = damages.filter((d) => d.boardId === board.id);
  const changes: string[] = [];
  const snapMap = new Map<string, DamageSnapshotItem>(snapshot.map((s) => [s.damageId, s]));

  for (const d of current) {
    const snap = snapMap.get(d.id);
    if (!snap) {
      changes.push(
        `底板新增${d.type} ${d.lengthCm}cm（${d.note || d.material}，${fmtDate(d.recordedAt)} 记录，交付快照中无此损伤）`
      );
    } else if (snap.material !== d.material || snap.lengthCm !== d.lengthCm || snap.type !== d.type) {
      changes.push(
        `修补材料变化：${d.type}由「${snap.material}」变为「${d.material} ${d.lengthCm}cm」（${fmtDate(d.recordedAt)} 记录）`
      );
    }
  }
  return { invalid: changes.length > 0, changes };
}

/** 实测差值 = 实测值 - 配方值 */
export function calcDiffs(
  recipe: { sideEdge: number; baseEdge: number },
  measured: { sideEdge: number; baseEdge: number }
): { sideEdge: number; baseEdge: number } {
  return {
    sideEdge: round2(measured.sideEdge - recipe.sideEdge),
    baseEdge: round2(measured.baseEdge - recipe.baseEdge),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function boardTitle(board: Board | undefined): string {
  if (!board) return "未知雪板";
  return `${board.brand} ${board.length} · ${board.model}`;
}
