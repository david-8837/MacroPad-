import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { Intro, IntroBoundary } from './intro/Intro';
import './index.css';

const STARTUP_MIN_LOAD_MS = 4000;

class StartupBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; ready: boolean }> {
  state = { failed: false, ready: false };
  private timer: number | null = null;
  static getDerivedStateFromError() { return { failed: true, ready: true }; }
  componentDidMount() {
    this.timer = window.setTimeout(() => {
      this.setState({ ready: true });
      window.dispatchEvent(new Event('kadowaz-editor-ready'));
      window.electronAPI?.rendererReady?.();
    }, STARTUP_MIN_LOAD_MS);
  }
  componentWillUnmount() {
    if (this.timer !== null) window.clearTimeout(this.timer);
  }
  componentDidCatch(error: Error) { console.error('[renderer] Startup error:', error); }
  render() {
    if (this.state.failed) return <main style={{ padding: 32, fontFamily: 'system-ui' }}><h1>Editor could not start</h1><p>Try reloading. If this continues, quit and restart the app.</p><button onClick={() => window.location.reload()}>Reload editor</button></main>;
    return (
      <>
        <App />
        {this.state.ready && <IntroBoundary><Intro /></IntroBoundary>}
      </>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupBoundary><App /><IntroBoundary><Intro /></IntroBoundary></StartupBoundary>
  </React.StrictMode>,
);
