"use client";

import { notifications } from "@mantine/notifications";
import { useCallback, useState } from "react";
import { loginToClaude, type ClaudeAuthState } from "@/lib/client/claude-auth";
import { errorMessage } from "@/lib/errors";

type Options = {
  onConnected?: (auth: ClaudeAuthState) => void;
  /** Verilmezse hata bildirim olarak gösterilir. */
  onError?: (message: string) => void;
};

/** "Claude ile bağlan" butonu: giriş penceresini açar ve kullanıcı girişi bitirene kadar bekler. */
export function useClaudeLogin({ onConnected, onError }: Options = {}) {
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      onConnected?.(await loginToClaude());
    } catch (error) {
      const message = errorMessage(error, "Claude girişi tamamlanamadı.");
      if (onError) onError(message);
      else notifications.show({ color: "red", title: "Claude bağlanamadı", message });
    } finally {
      setConnecting(false);
    }
  }, [onConnected, onError]);

  return { connect, connecting };
}
