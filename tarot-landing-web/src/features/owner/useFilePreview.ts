import { useCallback, useEffect, useRef, useState } from "react";

export interface FilePreview {
  file: File;
  url: string;
}

/* A preview address for the file just chosen. It is made when the file is
   chosen, and the one before it is let go then, or when the screen closes. */
export function useFilePreview() {
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const latest = useRef<FilePreview | null>(null);

  useEffect(() => () => {
    if (latest.current) URL.revokeObjectURL(latest.current.url);
  }, []);

  const show = useCallback((file: File | null) => {
    if (latest.current) URL.revokeObjectURL(latest.current.url);
    latest.current = file ? { file, url: URL.createObjectURL(file) } : null;
    setPreview(latest.current);
  }, []);

  return [preview, show] as const;
}
