import type { DamageRecord, DamageSnapshotItem, DamageType } from "../types";

const TYPE_COLOR: Record<DamageType, string> = {
  划痕: "#f97316",
  修补: "#14b8a6",
  "P-Tex": "#0369a1",
  金属: "#64748b",
};

interface Props {
  damages: DamageRecord[];
  /** 交付时的快照（空心虚线圆，用于比对） */
  snapshot?: DamageSnapshotItem[];
  onAdd?: (x: number, y: number) => void;
}

/** 雪板俯视损伤标记图 */
export function BoardDiagram({ damages, snapshot = [], onAdd }: Props) {
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onAdd) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(98, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(98, Math.max(2, ((e.clientY - rect.top) / rect.height) * 100));
    onAdd(Math.round(x), Math.round(y));
  };

  return (
    <div className="diagram-wrap">
      <svg
        viewBox="0 0 200 360"
        className={`board-diagram ${onAdd ? "board-diagram--editable" : ""}`}
        onClick={handleClick}
      >
        {/* 板体 */}
        <rect x="40" y="14" width="120" height="332" rx="60" fill="#eaf3fb" stroke="#94a3b8" strokeWidth="2" />
        {/* 板刃 */}
        <line x1="52" y1="46" x2="52" y2="314" stroke="#0369a1" strokeWidth="2.5" />
        <line x1="148" y1="46" x2="148" y2="314" stroke="#0369a1" strokeWidth="2.5" />
        {/* 固定器 */}
        <circle cx="100" cy="120" r="20" fill="none" stroke="#cbd5e1" strokeWidth="2" />
        <circle cx="100" cy="240" r="20" fill="none" stroke="#cbd5e1" strokeWidth="2" />
        <text x="100" y="124" textAnchor="middle" fontSize="9" fill="#94a3b8">
          前
        </text>
        <text x="100" y="244" textAnchor="middle" fontSize="9" fill="#94a3b8">
          后
        </text>

        {/* 交付快照：空心虚线圆 */}
        {snapshot.map((s) => (
          <g key={`snap-${s.damageId}`}>
            <circle
              cx={(s.x / 100) * 200}
              cy={(s.y / 100) * 360}
              r="8"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.6"
              strokeDasharray="3 2"
            />
            <text
              cx={(s.x / 100) * 200}
              cy={(s.y / 100) * 360 + 3}
              textAnchor="middle"
              fontSize="7"
              fill="#94a3b8"
            >
              旧
            </text>
          </g>
        ))}

        {/* 当前损伤：实心圆 */}
        {damages.map((d) => (
          <g key={d.id}>
            <circle
              cx={(d.x / 100) * 200}
              cy={(d.y / 100) * 360}
              r="9"
              fill={TYPE_COLOR[d.type]}
              stroke="#ffffff"
              strokeWidth="2"
            />
            <text
              x={(d.x / 100) * 200}
              y={(d.y / 100) * 360 + 3}
              textAnchor="middle"
              fontSize="7.5"
              fill="#ffffff"
            >
              {d.type === "P-Tex" ? "P" : d.type.slice(0, 1)}
            </text>
            <title>{`${d.type} ${d.lengthCm}cm · ${d.material} · ${d.note}`}</title>
          </g>
        ))}
      </svg>
      <div className="legend">
        <span><i style={{ background: "#f97316" }} />划痕</span>
        <span><i style={{ background: "#14b8a6" }} />修补</span>
        <span><i style={{ background: "#0369a1" }} />P-Tex</span>
        <span><i style={{ background: "#64748b" }} />金属</span>
        <span><i className="legend-hollow" />交付快照</span>
      </div>
    </div>
  );
}
