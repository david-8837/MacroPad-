import React from 'react';
import { Layer } from '../types';
import * as LucideIcons from 'lucide-react';

interface OSDFlyoutProps {
  layer: Layer;
  profileName: string;
  isVisible: boolean;
  onClose: () => void;
}

export const OSDFlyout: React.FC<OSDFlyoutProps> = ({
  layer,
  profileName,
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
      <div className="w-[300px] p-3 rounded-2xl bg-[#0F1218]/90 backdrop-blur-xl border border-white/15 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px]"
              style={{ backgroundColor: layer.accentColor, boxShadow: `0 0 8px ${layer.accentColor}` }}
            />
            <div>
              <div className="text-[9px] font-mono text-white/50 uppercase tracking-wider">
                {profileName}
              </div>
              <div className="text-xs font-bold leading-tight">
                {layer.name}
              </div>
            </div>
          </div>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/80">
            {layer.badge}
          </span>
        </div>

        {/* 3x3 Mini Preview Grid */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {layer.keys.map(k => (
            <div
              key={k.keyIndex}
              className="p-1.5 rounded-lg bg-black/40 border border-white/5 flex flex-col items-center justify-center text-center h-[52px]"
            >
              <div style={{ color: k.accentColor || '#FF5E00' }}>
                {renderIcon(k.iconName)}
              </div>
              <div className="text-[9px] font-medium truncate w-full mt-1 text-white/90">
                {k.label}
              </div>
            </div>
          ))}
        </div>

        {/* Dial Preview */}
        <div className="px-2 py-1 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between text-[10px] font-mono">
          <span className="text-white/40">KNOB:</span>
          <span className="text-[#FF5E00] font-semibold">{layer.dial.activeModeName}</span>
        </div>
      </div>
    </div>
  );
};
