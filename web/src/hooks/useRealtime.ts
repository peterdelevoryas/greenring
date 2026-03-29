import { useEffect, useEffectEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getRealtimeUrl } from "../lib/api";
import type { ServerEvent } from "../lib/types";

export function useRealtime(
  enabled: boolean,
  onEvent?: (timestamp: number) => void,
) {
  const queryClient = useQueryClient();
  const handleEvent = useEffectEvent((timestamp: number) => {
    onEvent?.(timestamp);
  });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const websocketUrl = getRealtimeUrl();
    let isDisposed = false;
    let reconnectHandle: number | undefined;
    let socket: WebSocket | undefined;

    const connect = () => {
      socket = new WebSocket(websocketUrl);

      socket.onmessage = (message) => {
        const event = JSON.parse(message.data) as ServerEvent;
        const now = Date.now();
        handleEvent(now);

        if (event.type === "message.created") {
          queryClient.invalidateQueries({
            queryKey: ["messages", event.payload.message.party_id],
          });
          queryClient.invalidateQueries({ queryKey: ["home"] });
          return;
        }

        if (
          event.type === "presence.updated" ||
          event.type === "party.created" ||
          event.type === "party.updated" ||
          event.type === "party.joined" ||
          event.type === "party.left"
        ) {
          queryClient.invalidateQueries({ queryKey: ["home"] });
          return;
        }

        if (event.type === "profile.updated") {
          queryClient.invalidateQueries({ queryKey: ["session"] });
          queryClient.invalidateQueries({ queryKey: ["home"] });
          queryClient.invalidateQueries({ queryKey: ["messages"] });
          return;
        }

        if (
          event.type === "invite.created" ||
          event.type === "invite.revoked"
        ) {
          queryClient.invalidateQueries({ queryKey: ["invites"] });
        }
      };

      socket.onclose = () => {
        if (!isDisposed) {
          reconnectHandle = window.setTimeout(connect, 2_000);
        }
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectHandle) {
        window.clearTimeout(reconnectHandle);
      }
      socket?.close();
    };
  }, [enabled, queryClient]);
}
