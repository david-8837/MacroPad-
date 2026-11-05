import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import SpecularButton from './SpecularButton';

const mount = document.querySelector('.hero-download-mount');
if (mount) {
  // A normal static link remains usable if this optional enhancement fails to load.
  const root = createRoot(mount);
  flushSync(() => root.render(
    <SpecularButton
      href="https://github.com/david-8837/MacroPad-/releases/download/v1.0.1-test.23/ZERO-Deck-Studio-1.0.1-test.23-x64.exe"
      target="_top"
      rel="noreferrer"
      aria-describedby="hero-download-status"
      className="button hero-specular-link"
      size="sm"
      radius={5}
      tint="#262622"
      tintOpacity={1}
      textColor="#ffffff"
      lineColor="#f7b08d"
      baseColor="#716b62"
      intensity={1}
      idleIntensity={0.35}
      shineSize={10}
      shineFade={34}
      thickness={1.2}
      glow={1}
      followMouse
      proximity={250}
    >
      Download for Windows <span aria-hidden="true">↓</span>
    </SpecularButton>
  ));
}
