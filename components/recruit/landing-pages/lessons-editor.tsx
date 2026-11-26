"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/crm/info-tip";
import { COURSE_LIMITS, type Lesson, type PageCourse } from "@/lib/recruit/landing-pages";

const label = "flex items-center gap-1";
const empty = (): Lesson => ({ title: "", body: [] });

/** A taster course's lessons; removing the last one removes the course. */
export function LessonsEditor({
  course,
  onChange,
  version,
}: {
  course?: PageCourse;
  onChange: (course: PageCourse | undefined) => void;
  /** Remounts the uncontrolled paragraph boxes after a save. */
  version: string;
}) {
  const t = useTranslations("recruit.pages");
  // Bumped when lessons change places, so each paragraph box remounts with its own lesson's text.
  const [order, setOrder] = useState(0);
  const lessons = course?.lessons ?? [];
  const set = (next: Lesson[], moved = false) => {
    if (moved) setOrder((n) => n + 1);
    onChange(next.length ? { lessons: next } : undefined);
  };
  const edit = (i: number, p: Partial<Lesson>) =>
    set(lessons.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const move = (i: number, by: number) => {
    const next = [...lessons];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set(next, true);
  };

  if (!course)
    return (
      <div className="flex items-center justify-between gap-3">
        <Label className={label}>
          {t("lessons")} <InfoTip label={t("lessonsAbout")}>{t("lessonsHint")}</InfoTip>
        </Label>
        <Button variant="outline" size="sm" onClick={() => set([empty(), empty()])}>
          <Plus data-icon="inline-start" /> {t("addLessons")}
        </Button>
      </div>
    );

  return (
    <div className="grid gap-3">
      <Label className={label}>
        {t("lessons")} <InfoTip label={t("lessonsAbout")}>{t("lessonsHint")}</InfoTip>
      </Label>
      <ol className="grid gap-3">
        {lessons.map((lesson, i) => (
          <li
            key={`${order}-${i}`}
            className="grid gap-2 rounded-lg border border-[var(--border-color,#e5e7eb)] p-3"
          >
            <div className="flex items-center gap-1">
              <Input
                value={lesson.title}
                onChange={(e) => edit(i, { title: e.target.value })}
                placeholder={t("lessonTitle", { n: i + 1 })}
                aria-label={t("lessonTitle", { n: i + 1 })}
                className="h-8 text-sm"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={t("moveUp")}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={i === lessons.length - 1}
                onClick={() => move(i, 1)}
                aria-label={t("moveDown")}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  set(
                    lessons.filter((_, j) => j !== i),
                    true,
                  )
                }
                aria-label={t("removeLesson")}
              >
                <Trash2 />
              </Button>
            </div>
            {/* Uncontrolled so a typed newline survives; a save or a move remounts it. */}
            <Textarea
              key={version}
              name={`lesson-${i + 1}-text`}
              rows={3}
              defaultValue={lesson.body.join("\n")}
              onChange={(e) =>
                edit(i, {
                  body: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder={t("lessonText")}
              aria-label={t("lessonText")}
            />
            <Input
              value={lesson.question ?? ""}
              onChange={(e) => edit(i, { question: e.target.value || undefined })}
              placeholder={t("lessonQuestion")}
              aria-label={t("lessonQuestion")}
              className="h-8 text-sm"
            />
          </li>
        ))}
      </ol>
      {lessons.length < COURSE_LIMITS.lessons[1] ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => set([...lessons, empty()])}>
            <Plus data-icon="inline-start" /> {t("addLesson")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
