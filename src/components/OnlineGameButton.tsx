import { useStore } from "@nanostores/react";

import { Button } from "@/components/ui/button";
import {
    connectionStatus,
    gameSession,
    onlineEnabled,
    onlineGameDrawerOpen,
} from "@/lib/game/store";
import { cn } from "@/lib/utils";

/** Opens the Online game drawer; the dot shows the connection at a glance. */
export const OnlineGameButton = ({ className }: { className?: string }) => {
    const $session = useStore(gameSession);
    const $enabled = useStore(onlineEnabled);
    const $status = useStore(connectionStatus);

    const dot =
        !$session || !$enabled
            ? "bg-slate-400"
            : $status.status === "online"
              ? "bg-green-500"
              : $status.status === "failed" || $status.status === "ended"
                ? "bg-red-500"
                : "bg-amber-500";

    const label = !$session
        ? "Online game"
        : !$enabled
          ? "Online game (off)"
          : $status.status === "online"
            ? "Online game: connected"
            : "Online game: not connected";

    return (
        <Button
            variant="ghost"
            size="sm"
            className={cn("gap-2", className)}
            onClick={() => onlineGameDrawerOpen.set(true)}
            aria-label={label}
            title={label}
            data-testid="online-game-button"
        >
            <span className={cn("size-2.5 rounded-full", dot)} aria-hidden />
            Online
        </Button>
    );
};
