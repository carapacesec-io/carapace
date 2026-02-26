"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#fffbf7",
          }}
        >
          <div style={{ textAlign: "center", padding: "0 24px" }}>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 900,
                color: "#1a1a1a",
                marginBottom: "8px",
              }}
            >
              Something went wrong
            </h1>
            <p style={{ fontSize: "15px", color: "#666", marginBottom: "24px" }}>
              A critical error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                fontSize: "14px",
                padding: "12px 28px",
                backgroundColor: "#059669",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
