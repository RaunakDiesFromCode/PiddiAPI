import React, { useState, useRef, useCallback, useEffect } from 'react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultSplitRatio?: number; // 0.1 to 0.9 (default 0.5)
}

export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  right,
  defaultSplitRatio = 0.5,
}) => {
  const [splitRatio, setSplitRatio] = useState(defaultSplitRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newRatio = (e.clientX - containerRect.left) / containerRect.width;

    // Constrain ratio between 25% and 75%
    const constrainedRatio = Math.min(0.75, Math.max(0.25, newRatio));
    setSplitRatio(constrainedRatio);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className="flex-1 flex min-h-0 w-full overflow-hidden">
      {/* Left pane (Request composer) */}
      <div
        className="h-full overflow-hidden flex flex-col min-w-[260px]"
        style={{ width: `${splitRatio * 100}%` }}
      >
        {left}
      </div>

      {/* Resize gutter */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 hover:w-1.5 bg-border-default hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-all relative z-20 flex items-center justify-center group"
        title="Drag to resize panes"
      >
        <div className="w-0.5 h-6 bg-text-muted group-hover:bg-white rounded-full transition-colors" />
      </div>

      {/* Right pane (Response viewer) */}
      <div
        className="h-full overflow-hidden flex flex-col min-w-[260px] flex-1"
        style={{ width: `${(1 - splitRatio) * 100}%` }}
      >
        {right}
      </div>
    </div>
  );
};
