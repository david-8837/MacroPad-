import React from 'react';
import { Layer } from '../types';
import * as LucideIcons from 'lucide-react';

interface OSDFlyoutProps {
  layer: Layer;
  deckName: string;
  isVisible: boolean;
  onClose: () => void;
}

export const OSDFlyout: React.FC<OSDFlyoutProps> = ({
  layer,
  deckName,
  isVisible,
  onClose,
}) => {
  if (!isVisible) return null;

  const renderIcon = (iconName: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Icon = (LucideIcons as any)[iconName] || LucideIcons.Square;
    return <Icon className="w-3.5 h-3.5" />;
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="w-[300px] p-3 bg-[#FFFFFF] border border-[#C7C7C7] text-[#141414]">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#E3E2DE] mb-2">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5"
              style={{ backgroundColor: layer.accentColor, boxShadow: `0 0 8px ${layer.accentColor}` }}
            />
            <div>
              <div className="text-[9px] font-mono text-[#646464] uppercase tracking-wider">
                {deckName}
              </div>
              <div className="text-xs font-bold leading-tight">
                {layer.name}
              </div>
            </div>
          </div>
          <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#EDECE8] text-[#444343]">
            {layer.badge}
          </span>
        </div>

        <p className="font-mono text-[9px] text-[#646464] mb-2">Editor preview · pad channel unchanged</p>
        {/* 3x3 Mini Preview Grid */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {layer.keys.map(k => (
            <div
              key={k.keyIndex}
              className="p-1.5 bg-[#EDECE8] border border-[#E3E2DE] flex flex-col items-center justify-center text-center h-[52px]"
            >
              <div style={{ color: k.accentColor || '#1351AA' }}>
                {renderIcon(k.iconName)}
              </div>
              <div className="text-[9px] font-medium truncate w-full mt-1 text-[#444343]">
                {k.label}
              </div>
            </div>
          ))}
        </div>

        {/* Dial Preview */}
        <div className="px-2 py-1 bg-[#EDECE8] border border-[#E3E2DE] flex items-center justify-between text-[10px] font-mono">
          <span className="text-[#646464]">KNOB:</span>
          <span className="text-[#1351AA] font-semibold">{layer.dial.activeModeName}</span>
        </div>
      </div>
    </div>
  );
};
