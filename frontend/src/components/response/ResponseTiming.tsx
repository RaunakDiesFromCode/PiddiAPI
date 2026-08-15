import React from 'react';
import { Clock, Zap } from 'lucide-react';
import { TimingMetrics } from '../../types';

interface ResponseTimingProps {
  timing: TimingMetrics | null | undefined;
  durationMs: number;
}

export const ResponseTiming: React.FC<ResponseTimingProps> = ({ timing, durationMs }) => {
  if (!timing) {
    return (
      <div className="p-6 text-center text-xs text-text-muted space-y-2 select-none">
        <Clock className="w-7 h-7 opacity-40 mx-auto" />
        <p>
          Total Request Duration:{' '}
          <span className="font-mono text-text-primary font-semibold">{durationMs} ms</span>
        </p>
        <p className="text-[11px] text-text-faint">Detailed network phase timings are not available for this connection.</p>
      </div>
    );
  }

  const phases = [
    { name: 'DNS Lookup', value: timing.dns_ms, color: 'bg-emerald-500', desc: 'Domain name resolution' },
    { name: 'TCP Handshake', value: timing.connect_ms, color: 'bg-blue-500', desc: 'Initial TCP socket connection' },
    { name: 'TLS Negotiation', value: timing.tls_ms, color: 'bg-purple-500', desc: 'SSL/TLS cryptographic handshake' },
    { name: 'Time to First Byte (TTFB)', value: timing.ttfb_ms, color: 'bg-amber-500', desc: 'Time until server sent first byte' },
    { name: 'Content Transfer', value: timing.transfer_ms, color: 'bg-rose-500', desc: 'Time spent streaming payload' },
  ];

  const maxVal = Math.max(durationMs, ...phases.map((p) => p.value), 1);

  return (
    <div className="p-4 sm:p-6 max-w-xl space-y-5 text-xs overflow-y-auto h-full font-sans">
      <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2 text-text-primary font-semibold">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Network Timing Waterfall</span>
        </div>
        <div className="font-mono text-xs sm:text-sm font-semibold text-text-primary">
          {durationMs} ms <span className="text-[11px] font-normal text-text-muted">total</span>
        </div>
      </div>

      <div className="space-y-4">
        {phases.map((phase) => {
          const widthPercent = Math.min(100, Math.max(3, (phase.value / maxVal) * 100));
          return (
            <div key={phase.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary font-medium">{phase.name}</span>
                <span className="font-mono text-text-primary font-semibold">{phase.value.toFixed(1)} ms</span>
              </div>
              <div className="h-2 w-full bg-bg-darkest rounded-full overflow-hidden border border-border-subtle">
                <div
                  className={`h-full ${phase.color} rounded-full transition-all duration-300`}
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-text-faint">{phase.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
