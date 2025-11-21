import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * StatsByGroup
 *
 * Props:
 * - groups: {
 *     [groupName: string]: Array<{
 *       name: string,
 *       description: string,
 *       dtype: "i" | "f",
 *       fieldName: string
 *     }>
 *   }
 * - stats: {
 *     stats_fields: {
 *       [fieldName: string]: {
 *         min?: number,
 *         max?: number,
 *         count?: number,
 *         mean?: number,
 *         stddev?: number,
 *         percentiles?: (string | number)[] // ["10.0", v10, "20.0", v20, ...] (order preserved)
 *       }
 *     }
 *   }
 *
 * Columns: attr, desc, mean, stddev, min, max, count, dist
 */
export default function StatsByGroup({ groups, stats }) {
  const fields = stats?.stats_fields || {};

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.35 }}>
      {Object.entries(groups).map(([groupName, attrs]) => (
        <GroupTable
          key={groupName}
          groupName={groupName}
          attributes={attrs}
          fields={fields}
        />
      ))}
    </div>
  );
}

function GroupTable({ groupName, attributes, fields }) {
  const hasAny = attributes?.some((a) => fields[a.fieldName]);

  const columns = useMemo(
    () => [
      { key: "attr",   label: "Attribute",   min: 120 },
      { key: "desc",   label: "Description", min: 380, flex: true },
      { key: "mean",   label: "Mean",        min: 100 },
      { key: "stddev", label: "Std Dev",     min: 110 },
      { key: "min",    label: "Min",         min: 90  },
      { key: "max",    label: "Max",         min: 90  },
      { key: "count",  label: "Count",       min: 90  },
      { key: "dist",   label: "Distribution",min: 220 },
    ],
    []
  );

  const initial = useMemo(
    () => columns.map((c) => (c.flex ? Math.max(380, c.min) : c.min)),
    [columns]
  );

  const { colWidths, startResize, resizing } = useResizableColumns({
    initialWidths: initial,
    minWidths: columns.map((c) => c.min || 60),
  });

  const nfInt = useMemo(() => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }), []);
  const nfFloat = useMemo(
    () => new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
    []
  );

  return (
    <section style={{ marginBottom: 24 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{groupName}</h2>
        {!hasAny && <span style={{ fontSize: 12, color: "#666" }}>No stats available for this group.</span>}
      </header>

      <div
        style={{
          overflowX: "auto",
          border: "1px solid #eee",
          borderRadius: 8,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <table style={tableStyle}>
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>

          <thead>
          <tr>
            {columns.map((col, i) => (
              <ResizableTh
                key={col.key}
                label={col.label}
                index={i}
                onResizeStart={startResize}
              />
            ))}
          </tr>
          </thead>

          <tbody>
          {attributes.map((a) => {
            const s = fields[a.fieldName] || {};
            return (
              <tr key={a.fieldName}>
                <Td mono title={a.fieldName}>{a.name}</Td>
                <Td title={a.description}>{a.description}</Td>
                <Td align="right">{fmtValue(s.mean,   a.dtype, true,  nfInt, nfFloat)}</Td>
                <Td align="right">{fmtValue(s.stddev, a.dtype, true,  nfInt, nfFloat)}</Td>
                <Td align="right">{fmtValue(s.min,    a.dtype, false, nfInt, nfFloat)}</Td>
                <Td align="right">{fmtValue(s.max,    a.dtype, false, nfInt, nfFloat)}</Td>
                <Td align="right">{fmtCount(s.count, nfInt)}</Td>
                <Td>
                  <PercentileHeatmapNormalized
                    percentilesArr={s.percentiles}
                    min={s.min}
                    max={s.max}
                  />
                </Td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
        <em>Tip:</em> Drag the divider at the right edge of any header to resize.
        {resizing && <span style={{ marginLeft: 8, color: "#999" }}>(resizing…)</span>}
      </div>
    </section>
  );
}

/* ===================== Percentiles / Heatmap ===================== */

/**
 * Convert alternating array into ordered pairs: [["10.0", v10], ["20.0", v20], ...]
 * - Preserves the exact order provided by Solr
 */
function percentilesArrayToPairs(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (let i = 0; i < arr.length - 1; i += 2) {
    out.push([String(arr[i]), arr[i + 1]]);
  }
  return out;
}

function normalizeBetween(value, min, max) {
  if (!isFinite(min) || !isFinite(max) || max <= min || !isFinite(value)) return null;
  return (value - min) / (max - min);
}

// White -> Blue (0 -> 1)
function rgbWhiteToBlue(vNorm) {
  const t = clamp01(vNorm);
  const rg = Math.round(255 * (1 - t));
  return `rgb(${rg}, ${rg}, 255)`;
}
function clamp01(x) {
  if (typeof x !== "number" || !isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function fmtFloat(v) {
  if (v == null || !isFinite(v)) return "n/a";
  return v.toFixed(3);
}

/**
 * PercentileHeatmapNormalized
 * - Infers bins from percentilesArr (order preserved)
 * - Colors normalized by row min/max
 */
function PercentileHeatmapNormalized({ percentilesArr, min, max }) {
  const pairs = useMemo(() => percentilesArrayToPairs(percentilesArr), [percentilesArr]);
  const n = pairs.length || 1; // avoid zero columns
  const validScale = isFinite(min) && isFinite(max) && max > min;

  return (
    <div style={{ ...heatRowDynamic, gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {pairs.map(([pStr, raw], idx) => {
        const rawNum = typeof raw === "number" && isFinite(raw) ? raw : null;
        const norm = rawNum == null ? null : (validScale ? normalizeBetween(rawNum, min, max) : null);
        const bg = norm == null ? "#f2f2f2" : rgbWhiteToBlue(norm);
        const label = `${pStr} → raw ${fmtFloat(rawNum)} (norm ${fmtFloat(norm)})`;
        return <HeatCell key={`${pStr}-${idx}`} background={bg} label={label} />;
      })}
    </div>
  );
}

function HeatCell({ background, label }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ ...heatCell, background }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={label}
    >
      {hover && <span style={popover}>{label}</span>}
    </div>
  );
}

/* ===================== Resizable columns ===================== */

function useResizableColumns({ initialWidths, minWidths }) {
  const [colWidths, setColWidths] = useState(initialWidths);
  const [resizing, setResizing] = useState(false);
  const activeRef = useRef(null); // { index, startX, startW }

  useEffect(() => {
    if (initialWidths?.length) setColWidths(initialWidths);
  }, [initialWidths?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMouseMove = (e) => {
    if (!activeRef.current) return;
    const { index, startX, startW } = activeRef.current;
    const dx = e.clientX - startX;
    const next = [...colWidths];
    const minW = minWidths?.[index] ?? 60;
    next[index] = Math.max(minW, startW + dx);
    setColWidths(next);
  };

  const endResize = () => {
    activeRef.current = null;
    setResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", endResize);
  };

  const startResize = (index, ev) => {
    const startX = ev.clientX;
    const startW = colWidths[index];
    activeRef.current = { index, startX, startW };
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endResize);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endResize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { colWidths, setColWidths, startResize, resizing };
}

function ResizableTh({ label, index, onResizeStart }) {
  return (
    <th style={thStyle}>
      <div style={{ position: "relative", width: "100%" }}>
        <span>{label}</span>
        <span
          onMouseDown={(e) => onResizeStart(index, e)}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize column"
          style={resizerStyle}
        />
      </div>
    </th>
  );
}

/* ===================== Formatting helpers ===================== */

function fmtCount(v, nfInt) {
  if (v === null || v === undefined) return "—";
  return nfInt.format(v);
}

function fmtValue(v, dtype = "f", isStat = false, nfInt, nfFloat) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const isIntType = dtype === "i";
  return isIntType && !isStat ? nfInt.format(v) : nfFloat.format(v);
}

/* ===================== Cells & Styles ===================== */

function Td({ children, align = "left", mono = false, title }) {
  return (
    <td
      title={title}
      style={{
        ...cellBase,
        textAlign: align,
        borderBottom: "1px solid #eee",
        padding: "8px 10px",
        fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  minWidth: 980,
};

const cellBase = {
  fontSize: 13,
  lineHeight: 1.35,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const thStyle = {
  ...cellBase,
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  background: "#fafafa",
  fontWeight: 600,
  padding: "10px 10px",
  position: "relative",
};

const resizerStyle = {
  position: "absolute",
  right: -5,
  top: 0,
  height: "100%",
  width: 10,
  cursor: "col-resize",
  boxShadow: "inset -1px 0 0 rgba(0,0,0,0.08)",
};

const heatRowDynamic = {
  display: "grid",
  gap: 2,
  alignItems: "center",
  width: "100%",
  minWidth: 200,
};

const heatCell = {
  height: 16,
  borderRadius: 3,
  position: "relative",
  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
};

const popover = {
  position: "absolute",
  left: "50%",
  top: -26,
  transform: "translateX(-50%)",
  padding: "2px 6px",
  fontSize: 11,
  background: "rgba(0,0,0,0.8)",
  color: "#fff",
  borderRadius: 4,
  whiteSpace: "nowrap",
  pointerEvents: "none",
};
