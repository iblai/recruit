"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { handleLogout } from "@/lib/iblai/auth-utils";

const MESSAGES: Record<string, { title: string; body: string }> = {
  "400": { title: "Bad request", body: "Something in that link was not right." },
  "403": {
    title: "No access to this organization",
    body: "Your account is not a member of the organization you asked for, or the organization refused the sign-in. Switch to another organization or sign in with a different account.",
  },
  "404": { title: "Not found", body: "We could not find what you were looking for." },
};

export default function ErrorPage() {
  const { code } = useParams<{ code: string }>();
  const message = MESSAGES[code] ?? {
    title: "Something went wrong",
    body: "Please try again.",
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--sidebar-bg,#fafbfc)] p-8">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-white p-8 text-center shadow-sm">
        <Image
          src="/images/iblai-logo.png"
          alt="ibl.ai"
          width={120}
          height={40}
          className="mx-auto h-8 w-auto"
        />
        <p className="text-muted-foreground mt-6 text-xs font-semibold tracking-wider uppercase">
          Error {code}
        </p>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{message.title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{message.body}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="border-border bg-background text-foreground hover:bg-accent inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Go home
          </Link>
          <button
            type="button"
            onClick={() => handleLogout()}
            className="inline-flex items-center rounded-lg bg-gradient-to-r from-[#2563EB] to-[#93C5FD] px-4 py-2 text-sm font-medium text-white"
          >
            Sign in again
          </button>
        </div>
      </div>
    </div>
  );
}
