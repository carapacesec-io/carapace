import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#131313] flex items-center justify-center">
      <div className="text-center px-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl border border-[#1e1e1e] bg-[#141414] mb-6">
          <span className="text-4xl font-bold text-[#555] font-mono">404</span>
        </div>
        <h1 className="text-2xl font-bold text-[#e0e0e0] tracking-tight mb-2">
          Page not found
        </h1>
        <p className="text-[15px] text-[#555] mb-6 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/">
          <button className="text-[13px] px-6 py-2.5 bg-[#e0e0e0] hover:bg-white text-[#131313] rounded-lg font-medium transition-colors">
            Back to Home
          </button>
        </Link>
      </div>
    </div>
  );
}
