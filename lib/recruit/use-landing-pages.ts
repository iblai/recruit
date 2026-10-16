"use client";

import { useCallback, useMemo } from "react";
import {
  useCreateWebFormMutation,
  useDeleteWebFormMutation,
  useGetWebFormQuery,
  useListWebFormsQuery,
  useUpdateWebFormMutation,
} from "@/lib/crm/api";
import { fromWebForm, toWebForm, type LandingPage } from "./landing-pages";

/**
 * The organization's landing pages — its CRM web forms, as the editor shows
 * them, newest change first. A save is one PATCH of the whole document.
 */
export function useLandingPages() {
  const { data, isLoading, error } = useListWebFormsQuery();
  const [createForm, created] = useCreateWebFormMutation();
  const [updateForm, updated] = useUpdateWebFormMutation();
  const [deleteForm, deleted] = useDeleteWebFormMutation();

  const pages = useMemo(
    () =>
      (data?.results ?? []).map(fromWebForm).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [data],
  );

  const create = useCallback(
    (page: LandingPage) => createForm(toWebForm(page)).unwrap().then(fromWebForm),
    [createForm],
  );
  const save = useCallback(
    (slug: string, page: LandingPage) =>
      updateForm({ slug, body: toWebForm(page) })
        .unwrap()
        .then(fromWebForm),
    [updateForm],
  );
  const setPublished = useCallback(
    (slug: string, on: boolean) =>
      updateForm({ slug, body: { is_published: on } })
        .unwrap()
        .then(fromWebForm),
    [updateForm],
  );
  const remove = useCallback((slug: string) => deleteForm(slug).unwrap(), [deleteForm]);

  return {
    pages,
    /** The list arrived — slug checks are meaningful only after this. */
    loaded: !!data,
    isLoading,
    error,
    create,
    save,
    setPublished,
    remove,
    isSaving: created.isLoading || updated.isLoading || deleted.isLoading,
  };
}

/** One landing page by slug, for the editor. */
export function useLandingPage(slug: string) {
  const { data, isLoading, error } = useGetWebFormQuery(slug, { skip: !slug });
  const page = useMemo(() => (data ? fromWebForm(data) : null), [data]);
  return { page, isLoading, error };
}
