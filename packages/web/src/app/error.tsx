"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#131313] flex items-center justify-center">
      <div className="text-center px-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl border border-red-500/20 bg-red-500/5 mb-6">
          <span className="text-3xl font-bold text-red-400/70">!</span>
        </div>
        <h1 className="text-2xl font-bold text-[#e0e0e0] tracking-tight mb-2">
          Something went wrong
        </h1>
        <p className="text-[15px] text-[#555] mb-6 max-w-md">
          An unexpected error occurred. Our team has been notified.
        </p>
        <button
          onClick={reset}
          className="text-[13px] px-6 py-2.5 bg-[#e0e0e0] hover:bg-white text-[#131313] rounded-lg font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
