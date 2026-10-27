import React, { useState } from 'react';
import { Sparkles, Sliders, Sun, Zap, Check } from 'lucide-react';

export const ViaLightingPanel: React.FC = () => {
  const [effectMode, setEffectMode] = useState<string>('rainbow');
  const [brightness, setBrightness] = useState<number>(85);
  const [speed, setSpeed] = useState<number>(60);
  const [hue, setHue] = useState<number>(24); // Orange default
  const [saturation, setSaturation] = useState<number>(100);

  const EFFECT_MODES = [
    { id: 'static', name: 'Solid Color', desc: 'Single static backlight glow' },
    { id: 'breathing', name: 'Breathing', desc: 'Smooth rhythmic pulsing' },
    { id: 'rainbow', name: 'Rainbow Swirl', desc: 'Continuous spectrum wave' },
    { id: 'reactive', name: 'Reactive Tap', desc: 'Lights up upon switch press' },
    { id: 'cycle', name: 'Color Cycle', desc: 'Cycles across all hue tones' },
    { id: 'strobe', name: 'Strobe Beat', desc: 'Fast dynamic party pulses' },
  ];

  const currentColor = `hsl(${hue}, ${saturation}%, ${brightness / 2}%)`;

  return (
    <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#FF5E00]/10 border border-[#FF5E00]/30 flex items-center justify-center text-[#FF5E00]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-base">
              VIA QMK Lighting & Underglow Studio
            </h3>
            <p className="text-xs text-white/50">
              Configure hardware addressable per-key RGB LEDs and underglow illumination
            </p>
          </div>
        </div>

        <button
          onClick={() => alert('RGB configuration pushed to microcontroller EEPROM.')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF5E00] text-black font-bold text-xs hover:bg-[#FF6A00] transition-transform active:scale-95 shadow-md"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Apply to Hardware</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Left: Effect Mode Selector */}
        <div className="space-y-3">
          <label className="text-xs font-mono uppercase text-white/50 block">
            Select Lighting Animation
          </label>
          <div className="space-y-2">
            {EFFECT_MODES.map(m => {
              const isActive = effectMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setEffectMode(m.id)}
                  className={`w-full p-3 rounded-xl text-left border transition-all flex items-center justify-between ${
                    isActive
                      ? 'bg-[#FF5E00]/15 border-[#FF5E00] text-white shadow-[0_0_15px_rgba(255,94,0,0.2)]'
                      : 'bg-[#0E1118] border-white/5 hover:border-white/15 text-white/70'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-xs text-white">{m.name}</div>
                    <div className="text-[10px] text-white/40">{m.desc}</div>
                  </div>
                  {isActive && (
                    <span className="w-2 h-2 rounded-full bg-[#FF5E00] shadow-[0_0_8px_#FF5E00]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Sliders (Hue, Brightness, Speed, Saturation) */}
        <div className="space-y-4 bg-[#0E1118] p-4 rounded-xl border border-white/5">
          {/* Live Color Swatch Banner */}
          <div
            className="h-16 rounded-xl flex items-center justify-center font-mono text-xs font-bold text-black border border-white/20 transition-all shadow-inner"
            style={{
              backgroundColor: effectMode === 'rainbow' ? undefined : currentColor,
              background: effectMode === 'rainbow' 
                ? 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)'
                : undefined,
              boxShadow: `0 0 25px ${currentColor}`
            }}
          >
            <span className="bg-black/60 text-white px-2 py-0.5 rounded-full text-[10px]">
              {effectMode === 'rainbow' ? 'SPECTRUM WAVE' : `HUE: ${hue}° • BRI: ${brightness}%`}
            </span>
          </div>

          {/* Brightness Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-white/70">
              <span className="flex items-center gap-1 font-mono"><Sun className="w-3 h-3" /> Brightness</span>
              <span className="font-mono text-[#FF5E00] font-bold">{brightness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={brightness}
              onChange={(e) => setBrightness(parseInt(e.target.value))}
              className="w-full accent-[#FF5E00] cursor-pointer"
            />
          </div>

          {/* Speed Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-white/70">
              <span className="flex items-center gap-1 font-mono"><Zap className="w-3 h-3" /> Effect Speed</span>
              <span className="font-mono text-[#FF5E00] font-bold">{speed}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={speed}
              onChange={(e) => setSpeed(parseInt(e.target.value))}
              className="w-full accent-[#FF5E00] cursor-pointer"
            />
          </div>

          {/* Hue Color Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-white/70">
              <span className="font-mono">Color Hue</span>
              <span className="font-mono text-[#FF5E00] font-bold">{hue}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={hue}
              onChange={(e) => setHue(parseInt(e.target.value))}
              className="w-full cursor-pointer h-2 rounded-lg"
              style={{
                background: 'linear-gradient(90deg, red, yellow, lime, cyan, blue, magenta, red)',
                appearance: 'none',
              }}
            />
          </div>

          {/* Saturation Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-white/70">
              <span className="font-mono">Color Saturation</span>
              <span className="font-mono text-[#FF5E00] font-bold">{saturation}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={saturation}
              onChange={(e) => setSaturation(parseInt(e.target.value))}
              className="w-full accent-[#FF5E00] cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
