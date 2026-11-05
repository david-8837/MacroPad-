import React, { useEffect, useRef, useState } from 'react';
import { Frame, FRAME_BYTES, PANEL_H, PANEL_W } from '../oled/frame';
import { CUSTOM_SCREEN_FPS, CUSTOM_SCREEN_MAX_FRAMES, decodePages, encodePages, rgbaToPages, screenCrop, type CustomScreen } from '../oled/customScreen';

type Props = { saved?: CustomScreen; connected: boolean; onApply: (screen: CustomScreen) => void };
type Source = { kind: 'image' | 'video'; name: string; url: string };

/** Pixel art and bounded, 1-bit media conversion. Original files never leave the PC. */
export function CustomScreenEditor({ saved, connected, onApply }: Props) {
  const [source, setSource] = useState<Source | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0, duration: 0 });
  const [pages, setPages] = useState(() => {
    try { return saved?.kind === 'drawing' ? decodePages(saved.frames[0]) : new Uint8Array(FRAME_BYTES); }
    catch { return new Uint8Array(FRAME_BYTES); }
  });
  const [tool, setTool] = useState<'draw' | 'erase'>('draw');
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0.5); const [y, setY] = useState(0.5);
  const [threshold, setThreshold] = useState(128); const [invert, setInvert] = useState(false);
  const [start, setStart] = useState(0); const [length, setLength] = useState(10);
  const [busy, setBusy] = useState(false); const [ready, setReady] = useState(false); const [message, setMessage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null); const preview = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null); const video = useRef<HTMLVideoElement>(null);
  const stroke = useRef(false); const lastPixel = useRef<{ x: number; y: number } | null>(null); const job = useRef(0);
  useEffect(() => () => { job.current++; }, []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);

  useEffect(() => {
    const el = canvas.current; const g = el?.getContext('2d');
    if (!el || !g) return;
    const fb = new Frame().blitPages(pages); const data = g.createImageData(PANEL_W, PANEL_H);
    fb.writeRGBA(data.data); g.putImageData(data, 0, 0);
  }, [pages, source]);

  const convert = (media: CanvasImageSource): Uint8Array => {
    const c = document.createElement('canvas'); c.width = PANEL_W; c.height = PANEL_H;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('Canvas is not available.');
    const rect = screenCrop(size.width, size.height, zoom, x, y);
    g.drawImage(media, rect.x, rect.y, rect.w, rect.h, 0, 0, PANEL_W, PANEL_H);
    return rgbaToPages(g.getImageData(0, 0, PANEL_W, PANEL_H).data, threshold, invert);
  };
  useEffect(() => {
    if (!source || !size.width || !size.height) return;
    let timer = 0;
    const draw = () => {
      const media = source.kind === 'image' ? image.current : video.current;
      const g = preview.current?.getContext('2d');
      if (media && g) {
        try { const fb = new Frame().blitPages(convert(media)); const data = g.createImageData(PANEL_W, PANEL_H); fb.writeRGBA(data.data); g.putImageData(data, 0, 0); } catch { /* loading frame */ }
      }
      if (source.kind === 'video') timer = window.setTimeout(draw, 200);
    };
    draw(); return () => window.clearTimeout(timer);
  }, [source, size, zoom, x, y, threshold, invert]);

  const selectFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { setMessage('Choose an image or video file.'); return; }
    if (file.size > 64 * 1024 * 1024) { setMessage('Choose a file smaller than 64 MB.'); return; }
    job.current++; setBusy(false); setReady(false); setSize({ width: 0, height: 0, duration: 0 });
    setZoom(1); setX(0.5); setY(0.5); setStart(0); setLength(10); setMessage('');
    setSource({ kind: file.type.startsWith('video/') ? 'video' : 'image', name: file.name.slice(0, 180), url: URL.createObjectURL(file) });
  };
  const paintPixel = (px: number, py: number, from?: { x: number; y: number } | null) => {
    px = Math.max(0, Math.min(PANEL_W - 1, px)); py = Math.max(0, Math.min(PANEL_H - 1, py));
    setCursor({ x: px, y: py });
    setPages(previous => {
      const next = previous.slice();
      let x = from?.x ?? px, y = from?.y ?? py;
      const dx = Math.abs(px - x), dy = Math.abs(py - y), sx = x < px ? 1 : -1, sy = y < py ? 1 : -1;
      let error = dx - dy;
      for (;;) {
        const i = (y >> 3) * PANEL_W + x, bit = 1 << (y & 7);
        if (tool === 'draw') next[i] |= bit; else next[i] &= ~bit;
        if (x === px && y === py) break;
        const twice = 2 * error;
        if (twice > -dy) { error -= dy; x += sx; }
        if (twice < dx) { error += dx; y += sy; }
      }
      return next;
    });
    return { x: px, y: py };
  };
  const paint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - r.left) * PANEL_W / r.width), y = Math.floor((event.clientY - r.top) * PANEL_H / r.height);
    lastPixel.current = paintPixel(x, y, lastPixel.current);
  };
  const seek = (el: HTMLVideoElement, at: number) => new Promise<void>((resolve, reject) => {
    if (Math.abs(el.currentTime - at) < 0.002 && el.readyState >= 2) { resolve(); return; }
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('Could not read that video frame.')); }, 5000);
    const cleanup = () => { clearTimeout(timer); el.removeEventListener('seeked', done); el.removeEventListener('error', fail); };
    const done = () => { cleanup(); resolve(); }; const fail = () => { cleanup(); reject(new Error('The video could not be decoded.')); };
    el.addEventListener('seeked', done); el.addEventListener('error', fail); el.currentTime = at;
  });
  const apply = async () => {
    const token = ++job.current; setBusy(true); setMessage('');
    let resumeVideo: HTMLVideoElement | null = null;
    try {
      let art: CustomScreen;
      if (!source) art = { kind: 'drawing', name: 'Drawing', frames: [encodePages(pages)], fps: CUSTOM_SCREEN_FPS };
      else if (source.kind === 'image') {
        if (!image.current || !size.width) throw new Error('The image is not ready.');
        art = { kind: 'image', name: source.name, frames: [encodePages(convert(image.current))], fps: CUSTOM_SCREEN_FPS };
      } else {
        const el = video.current;
        if (!el || !size.width || !Number.isFinite(size.duration) || size.duration <= 0) throw new Error('The video is not ready.');
        if (!el.paused) resumeVideo = el;
        el.pause();
        const duration = Math.min(length, size.duration - start, CUSTOM_SCREEN_MAX_FRAMES / CUSTOM_SCREEN_FPS);
        const count = Math.max(1, Math.min(CUSTOM_SCREEN_MAX_FRAMES, Math.ceil(duration * CUSTOM_SCREEN_FPS)));
        const frames: string[] = [];
        for (let i = 0; i < count; i++) {
          await seek(el, Math.min(start + i / CUSTOM_SCREEN_FPS, Math.max(0, size.duration - 0.001)));
          if (token !== job.current) return;
          frames.push(encodePages(convert(el)));
        }
        art = { kind: 'video', name: source.name, frames, fps: CUSTOM_SCREEN_FPS };
      }
      if (token !== job.current) return;
      onApply(art);
      setMessage(connected ? 'Saved on this PC. The design can stream when ZERO is connected and the System screen is confirmed on the pad.' : 'Saved on this PC. Connect a compatible OLED pad to stream it.');
    } catch (err) { if (token === job.current) setMessage(err instanceof Error ? err.message : 'Could not prepare this media.'); }
    finally { if (resumeVideo && resumeVideo === video.current) void resumeVideo.play().catch(() => {}); if (token === job.current) setBusy(false); }
  };
  const crop = size.width && size.height ? screenCrop(size.width, size.height, zoom, x, y) : null;
  const style = crop ? { position: 'absolute' as const, width: `${size.width / crop.w * 100}%`, height: `${size.height / crop.h * 100}%`, maxWidth: 'none', left: `${-crop.x / crop.w * 100}%`, top: `${-crop.y / crop.h * 100}%` } : undefined;
  return <section aria-label="Custom screen editor" className="space-y-4">
    <div><h3 className="text-sm font-bold">Create your screen</h3><p className="text-xs text-[#646464] mt-1">Draw pixels or choose a photo or video. The screen is 128 × 32, black and white.</p></div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => { job.current++; setBusy(false); setSource(null); setMessage(''); }} className="border border-[#C7C7C7] px-3 py-2 text-xs font-bold">Draw</button>
      <label className="border border-[#1351AA] px-3 py-2 text-xs font-bold text-[#1351AA] cursor-pointer">Choose photo or video<input type="file" accept="image/*,video/*" className="sr-only" onChange={e => { selectFile(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
    </div>
    {!source ? <>
      <div className="flex gap-2" role="group" aria-label="Drawing tool">
        <button type="button" aria-pressed={tool === 'draw'} onClick={() => setTool('draw')} className="border border-[#C7C7C7] px-3 py-1 text-xs">Draw</button>
        <button type="button" aria-pressed={tool === 'erase'} onClick={() => setTool('erase')} className="border border-[#C7C7C7] px-3 py-1 text-xs">Erase</button>
        <button type="button" onClick={() => setPages(new Uint8Array(FRAME_BYTES))} className="border border-[#C7C7C7] px-3 py-1 text-xs">Clear</button>
      </div>
      <canvas ref={canvas} width={PANEL_W} height={PANEL_H} tabIndex={0} aria-label="Drawing canvas, 128 by 32 pixels" aria-describedby="drawing-help" className="w-full border border-[#1351AA] touch-none" style={{ imageRendering: 'pixelated', aspectRatio: '4 / 1' }}
        onPointerDown={e => { lastPixel.current = null; stroke.current = true; e.currentTarget.setPointerCapture(e.pointerId); paint(e); }} onPointerMove={e => { if (stroke.current) paint(e); }} onPointerUp={() => { stroke.current = false; lastPixel.current = null; }} onPointerCancel={() => { stroke.current = false; lastPixel.current = null; }} onLostPointerCapture={() => { stroke.current = false; lastPixel.current = null; }}
        onKeyDown={e => {
          const delta: Record<string, [number, number]> = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
          if (delta[e.key]) { e.preventDefault(); const [dx,dy] = delta[e.key]; setCursor(p => ({ x: Math.max(0, Math.min(PANEL_W - 1, p.x + dx)), y: Math.max(0, Math.min(PANEL_H - 1, p.y + dy)) })); }
          else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); paintPixel(cursor.x, cursor.y); }
        }} />
      <p id="drawing-help" className="text-xs text-[#646464]">Draw on the outline. Keyboard: arrows move, Space paints. Pixel {cursor.x + 1}, {cursor.y + 1}.</p>
    </> : <>
      <p className="text-xs font-bold break-all">{source.name}</p>
      <div className="relative w-full overflow-hidden border-2 border-[#1351AA] bg-black" style={{ aspectRatio: '4 / 1' }} aria-label="Crop outline">
        {source.kind === 'image' ? <img ref={image} src={source.url} alt="Selected image within screen crop" style={style} onLoad={e => { setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight, duration: 0 }); setReady(true); }} onError={() => setMessage('Could not open this image.')} />
          : <video ref={video} src={source.url} muted loop autoPlay playsInline style={style} onLoadedMetadata={e => { const v = e.currentTarget; setSize({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }); setLength(Math.min(10, v.duration)); }} onLoadedData={() => setReady(true)} onError={() => { setReady(false); setMessage('This video format is not supported here. Try MP4 or WebM.'); }} />}
      </div>
      <fieldset disabled={busy} className="grid gap-2 text-xs">
        {([['Zoom', zoom, setZoom, 1, 4, 0.05], ['Horizontal crop', x, setX, 0, 1, 0.01], ['Vertical crop', y, setY, 0, 1, 0.01], ['Black and white threshold', threshold, setThreshold, 0, 255, 1]] as const).map(([label, value, change, min, max, step]) => <label key={label} className="grid grid-cols-[1fr_2fr] gap-2 items-center">{label}<input type="range" min={min} max={max} step={step} value={value} onChange={e => change(Number(e.target.value))} /></label>)}
        <label><input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} /> Invert black and white</label>
        {source.kind === 'video' && size.duration > 0 && <>
          <label className="grid grid-cols-[1fr_2fr] gap-2 items-center">Clip start ({start.toFixed(1)} s)<input type="range" min="0" max={Math.max(0, size.duration - length)} step="0.1" value={start} onChange={e => { const n = Number(e.target.value); setStart(n); if (video.current) video.current.currentTime = n; }} /></label>
          <label className="grid grid-cols-[1fr_2fr] gap-2 items-center">Length ({length.toFixed(1)} s)<input type="range" min={Math.min(1, size.duration)} max={Math.min(10, size.duration)} step="0.1" value={length} onChange={e => { const n = Number(e.target.value); setLength(n); setStart(old => Math.min(old, Math.max(0, size.duration - n))); }} /></label>
          <p className="text-[#646464]">Video: up to 10 seconds at 5 frames per second.</p>
        </>}
      </fieldset>
      <div><p className="text-xs font-bold mb-1">Screen preview</p><canvas ref={preview} width={PANEL_W} height={PANEL_H} aria-label="Black and white screen preview" className="w-full border border-[#C7C7C7]" style={{ imageRendering: 'pixelated', aspectRatio: '4 / 1' }} /></div>
    </>}
    {saved && <button type="button" disabled={busy} onClick={() => { try { onApply(saved); setMessage('Saved design selected.'); } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not select the saved design.'); } }} className="border border-[#C7C7C7] px-3 py-2 text-xs font-bold">Show saved design</button>}
    <button type="button" onClick={() => void apply()} disabled={busy || (!!source && (!size.width || !ready))} className="bg-[#1351AA] text-white px-4 py-2 text-xs font-bold disabled:opacity-50">{busy ? 'Preparing…' : 'Save & show'}</button>
    <p className="text-xs text-[#646464]">Saved media uses the System screen slot while ZERO is connected. Automatic cycling can switch screens. Selecting System Telemetry restores its normal display; use Show saved design to switch back. Original files aren’t saved; reselect one to edit its crop. Custom artwork stays on this computer; ZERO must be running and connected to display it on the pad.</p>
    {message && <p role="status" className="text-xs text-[#444343]">{message}</p>}
  </section>;
}
