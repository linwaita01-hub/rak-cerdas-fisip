import { useSampul } from "@/lib/sampul";
import { BookOpen } from "lucide-react";

export function SampulImg({
  raw,
  alt,
  className,
}: {
  raw: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const url = useSampul(raw ?? null);
  if (url) {
    return <img src={url} alt={alt ?? ""} className={className} />;
  }
  return <BookOpen className="h-6 w-6 text-muted-foreground" />;
}
