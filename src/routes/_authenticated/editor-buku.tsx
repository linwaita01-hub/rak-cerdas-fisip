import { createFileRoute } from "@tanstack/react-router";
import { BookGridEditor } from "@/components/editor/BookGridEditor";

export const Route = createFileRoute("/_authenticated/editor-buku")({
  ssr: false,
  component: EditorBukuPage,
  head: () => ({ meta: [{ title: "Editor Buku — Perpus FISIP ULM" }] }),
});

function EditorBukuPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <BookGridEditor />
      </main>
    </div>
  );
}
