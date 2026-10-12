import { Link } from "react-router-dom";

export default function PageNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#08080a] text-white">
      <div className="max-w-md w-full text-center">
        <div className="text-8xl font-black tracking-tighter text-white/10">404</div>
        <div className="mx-auto mt-4 h-px w-16 bg-white/20" />
        <h1 className="mt-6 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-500">The page you requested does not exist.</p>
        <Link to="/" className="mt-7 inline-flex rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200">
          Go home
        </Link>
      </div>
    </div>
  );
}

