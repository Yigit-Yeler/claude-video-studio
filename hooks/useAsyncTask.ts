"use client";

import { notifications } from "@mantine/notifications";
import { useCallback, useState } from "react";
import { errorMessage } from "@/lib/errors";

/**
 * Bir async işi "yükleniyor" durumuyla çalıştırır; hata olursa kırmızı bildirim gösterir.
 * Yükleme butonlarındaki tekrar eden try/catch/finally kalıbının yerine geçer.
 */
export function useAsyncTask<Args extends unknown[]>(task: (...args: Args) => Promise<void>, errorTitle: string) {
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (...args: Args) => {
      setPending(true);
      try {
        await task(...args);
      } catch (error) {
        notifications.show({ color: "red", title: errorTitle, message: errorMessage(error, errorTitle) });
      } finally {
        setPending(false);
      }
    },
    [task, errorTitle],
  );

  return { run, pending };
}
