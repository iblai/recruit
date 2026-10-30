"use client";

import { useDispatch } from "react-redux";
import { CircleAlert } from "lucide-react";
import { setOpenPricingModal } from "@iblai/iblai-js/web-utils";
import { VOCAB } from "@/lib/recruit/vocabulary";

/** On the community organization every page sits under this line: sample data, and the way to an organization of one's own. */
export function SampleNotice() {
  const dispatch = useDispatch();
  return (
    <div
      data-testid="sample-notice"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-sm text-amber-900"
    >
      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span>
        You’re looking at sample data: fictional {VOCAB.prospect.lowerMany},{" "}
        {VOCAB.school.lowerMany} and {VOCAB.application.lowerMany}. Your own organization starts
        empty and is yours to run.
      </span>
      <button
        type="button"
        className="cursor-pointer font-medium text-amber-900 underline underline-offset-4 hover:text-amber-950"
        onClick={() => dispatch(setOpenPricingModal(true))}
      >
        Create your organization
      </button>
    </div>
  );
}
