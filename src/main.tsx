import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

class StartupBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidMount() {
    window.dispatchEvent(new Event('kadowaz-editor-ready'));
    window.electronAPI?.rendererReady?.();
  }
  componentDidCatch(error: Error) { console.error('[renderer] Startup error:', error); }
  render() {
    if (this.state.failed) return <main style={{ padding: 32, fontFamily: 'system-ui' }}><h1>Editor could not start</h1><p>Try reloading. If this continues, quit and restart the app.</p><button onClick={() => window.location.reload()}>Reload editor</button></main>;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupBoundary><App /></StartupBoundary>
  </React.StrictMode>,
);
