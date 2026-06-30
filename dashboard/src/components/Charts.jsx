// Tiny dependency-free SVG charts — keeps the bundle lean and the look native.
import React from 'react';

const ACCENT = '#5C6AC4'; // Polaris-ish indigo

export function LineChart({ data = [], height = 200, format = (v) => v }) {
  if (!data.length) return <Empty height={height} />;
  const w = 600;
  const pad = 28;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = (w - pad * 2) / Math.max(data.length - 1, 1);
  const y = (v) => height - pad - (v / max) * (height - pad * 2);
  const x = (i) => pad + i * stepX;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.value)}`).join(' ');
  const area = `${line} L${x(data.length - 1)},${height - pad} L${x(0)},${height - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img">
      <defs>
        <linearGradient id="bw-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.25" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (height - pad * 2)} y2={pad + g * (height - pad * 2)}
          stroke="#EDEEEF" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#bw-area)" />
      <path d={line} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill="#fff" stroke={ACCENT} strokeWidth="2" />
      ))}
      <text x={pad} y={height - 6} fontSize="10" fill="#8C9196">{data[0]?.date}</text>
      <text x={w - pad} y={height - 6} fontSize="10" fill="#8C9196" textAnchor="end">{data[data.length - 1]?.date}</text>
      <text x={pad} y={pad - 6} fontSize="10" fill="#8C9196">{format(max)}</text>
    </svg>
  );
}

export function BarChart({ data = [], height = 200, format = (v) => v }) {
  if (!data.length) return <Empty height={height} />;
  const w = 600;
  const pad = 28;
  const max = Math.max(...data.map((d) => d.value), 1);
  const gap = 8;
  const bw = (w - pad * 2) / data.length - gap;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img">
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (height - pad * 2)} y2={pad + g * (height - pad * 2)}
          stroke="#EDEEEF" strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const h = (d.value / max) * (height - pad * 2);
        const x = pad + i * ((w - pad * 2) / data.length) + gap / 2;
        return (
          <g key={i}>
            <rect x={x} y={height - pad - h} width={bw} height={Math.max(h, 1)} rx="4" fill={ACCENT} opacity="0.85" />
          </g>
        );
      })}
      <text x={pad} y={pad - 6} fontSize="10" fill="#8C9196">{format(max)}</text>
      <text x={pad} y={height - 6} fontSize="10" fill="#8C9196">{data[0]?.date}</text>
      <text x={w - pad} y={height - 6} fontSize="10" fill="#8C9196" textAnchor="end">{data[data.length - 1]?.date}</text>
    </svg>
  );
}

function Empty({ height }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8C9196', fontSize: 13 }}>
      No data for this period yet.
    </div>
  );
}
