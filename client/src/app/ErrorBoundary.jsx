import { Component } from 'react';
import '../pages/pages.css';

export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Screen error:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page message">
        <h1>Something went wrong</h1>
        <p className="muted">Please refresh the page. If it keeps happening, tell us what you were doing.</p>
        <button type="button" className="btn btn--primary btn--md" onClick={() => window.location.reload()}>Refresh</button>
      </main>
    );
  }
}
