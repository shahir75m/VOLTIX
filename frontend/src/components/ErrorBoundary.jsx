import { Component } from "react";

// Without this, one rendering bug anywhere shows a blank white page.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Page crashed:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="vx-page">
        <div className="vx-state" role="alert">
          <strong>Something went wrong</strong>
          <p>This page hit an unexpected problem. Reloading usually fixes it.</p>
          <button type="button" className="vx-btn-dark" onClick={() => window.location.reload()}>Reload page</button>
          <a href="/" className="vx-btn-dark">Back to home</a>
        </div>
      </div>
    );
  }
}
