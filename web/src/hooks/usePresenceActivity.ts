import { useEffect, useEffectEvent, useRef } from "react";

import { updatePresenceStatus } from "../lib/api";

const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const ONLINE_PULSE_MS = 20 * 1000;

type ClientPresenceStatus = "online" | "away";

export function usePresenceActivity(enabled: boolean) {
  const currentStatusRef = useRef<ClientPresenceStatus>("online");
  const idleTimerRef = useRef<number | null>(null);
  const lastOnlineSentAtRef = useRef(0);

  const clearIdleTimer = useEffectEvent(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  });

  const pushStatus = useEffectEvent((status: ClientPresenceStatus, force = false) => {
    if (!enabled) {
      return;
    }

    if (!force && currentStatusRef.current === status) {
      if (status !== "online" || Date.now() - lastOnlineSentAtRef.current < ONLINE_PULSE_MS) {
        return;
      }
    }

    currentStatusRef.current = status;
    if (status === "online") {
      lastOnlineSentAtRef.current = Date.now();
    }

    void updatePresenceStatus({ status }).catch(() => {});
  });

  const scheduleIdleTimer = useEffectEvent(() => {
    clearIdleTimer();

    if (document.visibilityState === "hidden") {
      pushStatus("away", true);
      return;
    }

    idleTimerRef.current = window.setTimeout(() => {
      pushStatus("away", true);
    }, IDLE_TIMEOUT_MS);
  });

  const handleActivity = useEffectEvent(() => {
    if (document.visibilityState === "hidden") {
      return;
    }

    scheduleIdleTimer();
    pushStatus("online");
  });

  useEffect(() => {
    if (!enabled) {
      clearIdleTimer();
      currentStatusRef.current = "online";
      lastOnlineSentAtRef.current = 0;
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearIdleTimer();
        pushStatus("away", true);
        return;
      }

      handleActivity();
    };

    pushStatus("online", true);
    scheduleIdleTimer();

    const events: Array<keyof WindowEventMap> = [
      "focus",
      "keydown",
      "pointerdown",
      "pointermove",
      "scroll",
      "touchstart",
    ];

    for (const eventName of events) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearIdleTimer();
      for (const eventName of events) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearIdleTimer, enabled, handleActivity, pushStatus, scheduleIdleTimer]);
}
