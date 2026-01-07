"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
    this.setState({ errorInfo: info });
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = process.env.NODE_ENV !== "production";
    const { error, errorInfo, showDetails } = this.state;

    return (
      <div className="surface" style={{ padding: 12, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Something went wrong</div>
        <div style={{ color: "#6b7280", fontSize: 13 }}>
          An unexpected error occurred while rendering this page.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={this.handleReload} style={{ padding: "6px 10px" }}>
            Reload page
          </button>
          {isDev ? (
            <button type="button" className="btn" onClick={this.toggleDetails} style={{ padding: "6px 10px" }}>
              {showDetails ? "Hide details" : "Show details"}
            </button>
          ) : null}
        </div>
        {isDev && showDetails ? (
          <pre
            style={{
              margin: 0,
              padding: 10,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {error?.message}
            {error?.stack ? `\n\n${error.stack}` : ""}
            {errorInfo?.componentStack ? `\n\n${errorInfo.componentStack}` : ""}
          </pre>
        ) : null}
      </div>
    );
  }
}
