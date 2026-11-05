import { useStore } from "@nanostores/react";
import {
    AlertTriangleIcon,
    CheckCircle2Icon,
    InfoIcon,
    XCircleIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { debugLocationOverride, hiderMode } from "@/lib/context";
import { formatGameCode } from "@/lib/game/protocol";
import {
    disablePush,
    enablePush,
    getPushState,
    isIOS,
    isStandalone,
    type PushState,
    requestTestPush,
} from "@/lib/game/push";
import {
    connectionStatus,
    createPassphrase,
    gameServerUrl,
    gameSession,
    keepScreenOn,
    onlineEnabled,
    onlineGameDrawerOpen,
    pushTestResult,
    unreadableMessages,
} from "@/lib/game/store";
import {
    createGame,
    endGame,
    joinGame,
    leaveGame,
    sendZoneNotice,
} from "@/lib/game/sync";

type Level = "ok" | "warn" | "bad" | "info";

const LEVEL_ICON: Record<Level, ReactNode> = {
    ok: <CheckCircle2Icon className="size-5 shrink-0 text-green-600" />,
    warn: <AlertTriangleIcon className="size-5 shrink-0 text-amber-600" />,
    bad: <XCircleIcon className="size-5 shrink-0 text-red-600" />,
    info: <InfoIcon className="size-5 shrink-0 text-blue-600" />,
};

const CheckRow = ({
    level,
    title,
    children,
}: {
    level: Level;
    title: string;
    children?: ReactNode;
}) => (
    <div className="flex w-full items-start gap-3 rounded-md border p-3">
        {LEVEL_ICON[level]}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">{title}</span>
            {children && (
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    {children}
                </div>
            )}
        </div>
    </div>
);

const copyText = async (text: string, what: string) => {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${what} copied`, { autoClose: 1500 });
    } catch {
        toast.error("Couldn't copy. Select the text and copy it by hand.");
    }
};

const useNow = (intervalMs: number) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);
    return now;
};

const formatRemaining = (ms: number) => {
    if (ms <= 0) return "expired";
    const minutes = Math.floor(ms / 60_000);
    return minutes >= 60
        ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left`
        : `${Math.max(1, minutes)}m left`;
};

const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong";

// --- Readiness check --------------------------------------------------------

type LocationCheck =
    | { state: "idle" }
    | { state: "checking" }
    | { state: "done"; accuracy: number }
    | { state: "error"; message: string };

const ReadinessCheck = () => {
    const $status = useStore(connectionStatus);
    const $enabled = useStore(onlineEnabled);
    const $session = useStore(gameSession);
    const $testResult = useStore(pushTestResult);
    const $keepScreenOn = useStore(keepScreenOn);
    const $debugLocation = useStore(debugLocationOverride);
    const $hiderMode = useStore(hiderMode);
    const [push, setPush] = useState<PushState | null>(null);
    const [pushBusy, setPushBusy] = useState(false);
    const [location, setLocation] = useState<LocationCheck>({ state: "idle" });

    const refreshPush = useCallback(async () => {
        setPush(await getPushState());
    }, []);
    useEffect(() => {
        void refreshPush();
    }, [refreshPush]);

    const checkLocation = () => {
        if (!navigator.geolocation) {
            setLocation({
                state: "error",
                message: "This device can't provide a location.",
            });
            return;
        }
        setLocation({ state: "checking" });
        navigator.geolocation.getCurrentPosition(
            (position) =>
                setLocation({
                    state: "done",
                    accuracy: position.coords.accuracy,
                }),
            (error) =>
                setLocation({
                    state: "error",
                    message:
                        error.code === error.PERMISSION_DENIED
                            ? "Location is blocked. Allow it for this app in your device settings."
                            : "Couldn't get a location fix. Try again outdoors.",
                }),
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
        );
    };

    const ios = isIOS();
    const standalone = isStandalone();
    const connected = $status.status === "online";

    return (
        <div className="flex w-full flex-col gap-2">
            <h3 className="font-poppins text-lg font-semibold">
                Are we ready?
            </h3>
            <p className="text-sm text-muted-foreground">
                Each of these can fail silently on a phone, so check them before
                the game starts.
            </p>

            <CheckRow
                level={
                    !$enabled
                        ? "info"
                        : connected
                          ? "ok"
                          : $status.status === "failed" ||
                              $status.status === "ended"
                            ? "bad"
                            : "warn"
                }
                title={
                    !$enabled
                        ? "The game server is switched off"
                        : connected
                          ? "Connected to the game"
                          : $status.status === "failed"
                            ? "Couldn't join the game"
                            : $status.status === "ended"
                              ? "This game has ended"
                              : "Not connected"
                }
            >
                {!$enabled && (
                    <span>
                        You&apos;re using <strong>Share question</strong> and
                        the paste button. Everything is saved on this device.
                        Switch the server back on above to carry on where you
                        left off.
                    </span>
                )}
                {$enabled && !connected && (
                    <>
                        {$status.detail && <span>{$status.detail}</span>}
                        <span>
                            You can keep playing: use{" "}
                            <strong>Share question</strong> on a question and
                            the paste button, exactly as before. Everything is
                            still saved on this device.
                        </span>
                    </>
                )}
            </CheckRow>

            {ios && !standalone && (
                <CheckRow level="bad" title="Not installed to the Home Screen">
                    <span>
                        On iPhone and iPad, notifications only work from the
                        installed app. Tap Share, then{" "}
                        <strong>Add to Home Screen</strong>, and open the game
                        from there.
                    </span>
                    <span>
                        Do this <strong>before</strong> the game: the installed
                        app keeps its own saved data, separate from Safari.
                    </span>
                </CheckRow>
            )}
            {standalone && (
                <CheckRow level="ok" title="Running as an installed app" />
            )}

            {push && (
                <CheckRow
                    level={
                        push.support === "unsupported"
                            ? "warn"
                            : push.support === "needs-install"
                              ? "bad"
                              : push.permission === "denied"
                                ? "bad"
                                : push.permission === "granted" &&
                                    push.subscribed
                                  ? "ok"
                                  : "warn"
                    }
                    title={
                        push.permission === "granted" && push.subscribed
                            ? "Notifications on"
                            : "Notifications off"
                    }
                >
                    {push.support === "needs-install" && (
                        <span>Install the app first (see above).</span>
                    )}
                    {push.support === "unsupported" && (
                        <span>
                            This browser can&apos;t send notifications. You will
                            still be alerted while the app is open.
                        </span>
                    )}
                    {push.support === "supported" &&
                        push.permission === "denied" && (
                            <span>
                                Notifications are blocked. Allow them for this
                                app in your device settings.
                            </span>
                        )}
                    {push.support === "supported" &&
                        push.permission !== "denied" && (
                            <div className="flex flex-wrap gap-2">
                                {!(
                                    push.permission === "granted" &&
                                    push.subscribed
                                ) && (
                                    <Button
                                        size="sm"
                                        disabled={pushBusy || !connected}
                                        onClick={async () => {
                                            setPushBusy(true);
                                            const result = await enablePush();
                                            setPushBusy(false);
                                            if (!result.ok) {
                                                toast.error(result.reason, {
                                                    autoClose: 8000,
                                                });
                                            }
                                            await refreshPush();
                                        }}
                                    >
                                        Turn on notifications
                                    </Button>
                                )}
                                {push.permission === "granted" &&
                                    push.subscribed && (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={!connected}
                                                onClick={() =>
                                                    requestTestPush()
                                                }
                                            >
                                                Send a test notification
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={async () => {
                                                    await disablePush();
                                                    await refreshPush();
                                                }}
                                            >
                                                Turn off
                                            </Button>
                                        </>
                                    )}
                            </div>
                        )}
                    {!connected && push.support === "supported" && (
                        <span>Connect to the game first.</span>
                    )}
                    {$testResult && (
                        <span>
                            {$testResult.sent
                                ? "Test sent. Lock your phone for a moment: did a notification appear?"
                                : `Test failed: ${$testResult.error ?? "unknown error"}`}
                        </span>
                    )}
                </CheckRow>
            )}

            <CheckRow
                level={
                    $debugLocation !== false
                        ? "info"
                        : location.state === "done"
                          ? location.accuracy <= 100
                              ? "ok"
                              : location.accuracy <= 1000
                                ? "warn"
                                : "bad"
                          : location.state === "error"
                            ? "bad"
                            : "info"
                }
                title={
                    $debugLocation !== false
                        ? "Using a debug location"
                        : location.state === "done"
                          ? `Location accurate to about ${Math.round(location.accuracy)} m`
                          : "Location not checked"
                }
            >
                {$debugLocation !== false ? (
                    <span>
                        The app is pretending you&apos;re at your debug
                        location, not using GPS.
                    </span>
                ) : (
                    <>
                        {location.state === "done" &&
                            location.accuracy > 100 && (
                                <span>
                                    That&apos;s rough. If you chose
                                    &ldquo;approximate&rdquo; location, turn on
                                    Precise Location for this app, or questions
                                    and zone alerts will be unreliable.
                                </span>
                            )}
                        {location.state === "error" && (
                            <span>{location.message}</span>
                        )}
                        <div>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={location.state === "checking"}
                                onClick={checkLocation}
                            >
                                {location.state === "checking"
                                    ? "Checking…"
                                    : "Check my location"}
                            </Button>
                        </div>
                    </>
                )}
            </CheckRow>

            {$session?.role === "hider" && (
                <CheckRow
                    level={$hiderMode !== false ? "ok" : "bad"}
                    title={
                        $hiderMode !== false
                            ? "Hider mode is on"
                            : "Hider mode is off"
                    }
                >
                    {$hiderMode === false && (
                        <span>
                            Turn on <strong>Hider mode</strong> in Options so
                            your answers have a hiding station to fall back on.
                        </span>
                    )}
                </CheckRow>
            )}

            <label className="flex min-h-11 w-full cursor-pointer flex-row items-center justify-between gap-2 rounded-md border p-3">
                <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                        Keep the screen on
                    </span>
                    <span className="text-sm text-muted-foreground">
                        Phones stop tracking location and drop the connection
                        when the screen locks. Uses more battery.
                    </span>
                </span>
                <Checkbox
                    checked={$keepScreenOn}
                    onCheckedChange={(checked) => keepScreenOn.set(!!checked)}
                />
            </label>
        </div>
    );
};

// --- Setup (no game yet) ----------------------------------------------------

const SetupForm = () => {
    const $serverUrl = useStore(gameServerUrl);
    const $passphrase = useStore(createPassphrase);
    const [code, setCode] = useState("");
    const [hiderKey, setHiderKey] = useState("");
    const [busy, setBusy] = useState(false);

    const run = async (action: () => Promise<void> | void) => {
        setBusy(true);
        try {
            await action();
        } catch (error) {
            toast.error(errorMessage(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <details open={!$serverUrl} className="w-full">
                <summary className="cursor-pointer text-sm font-medium">
                    Game server
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                    <Label htmlFor="game-server-url">Server address</Label>
                    <Input
                        id="game-server-url"
                        type="url"
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        placeholder="https://your-relay.workers.dev"
                        value={$serverUrl}
                        onChange={(event) =>
                            gameServerUrl.set(event.target.value)
                        }
                    />
                    <Label htmlFor="game-server-passphrase">
                        Server passphrase (only if your server asks for one)
                    </Label>
                    <Input
                        id="game-server-passphrase"
                        type="password"
                        autoComplete="off"
                        value={$passphrase}
                        onChange={(event) =>
                            createPassphrase.set(event.target.value)
                        }
                    />
                </div>
            </details>

            <div className="flex flex-col gap-2 rounded-md border p-3">
                <h3 className="font-poppins text-lg font-semibold">
                    I&apos;m the hider
                </h3>
                <p className="text-sm text-muted-foreground">
                    Start a game and share the code with the seekers.
                </p>
                <Button
                    disabled={busy || !$serverUrl}
                    onClick={() => run(createGame)}
                >
                    Create a game
                </Button>
            </div>

            <div className="flex flex-col gap-2 rounded-md border p-3">
                <h3 className="font-poppins text-lg font-semibold">
                    I&apos;m a seeker
                </h3>
                <Label htmlFor="game-code">Game code</Label>
                <Input
                    id="game-code"
                    className="font-mono text-lg uppercase tracking-widest"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="XXXXX-XXXXX"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                />
                <Button
                    disabled={busy || !$serverUrl || !code.trim()}
                    onClick={() => run(() => joinGame(code))}
                >
                    Join the game
                </Button>

                <details className="mt-1">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                        I&apos;m the hider, on another device
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                        <Label htmlFor="game-hider-key">Hider key</Label>
                        <Input
                            id="game-hider-key"
                            type="password"
                            autoComplete="off"
                            autoCapitalize="none"
                            autoCorrect="off"
                            value={hiderKey}
                            onChange={(event) =>
                                setHiderKey(event.target.value)
                            }
                        />
                        <Button
                            variant="outline"
                            disabled={
                                busy ||
                                !$serverUrl ||
                                !code.trim() ||
                                !hiderKey.trim()
                            }
                            onClick={() => run(() => joinGame(code, hiderKey))}
                        >
                            Join as the hider
                        </Button>
                    </div>
                </details>
            </div>
        </div>
    );
};

// --- Active game ------------------------------------------------------------

const ActiveGame = () => {
    const $session = useStore(gameSession);
    const $status = useStore(connectionStatus);
    const $unreadable = useStore(unreadableMessages);
    const now = useNow(30_000);

    if (!$session) return null;
    const isHider = $session.role === "hider";
    const formattedCode = formatGameCode($session.code);

    return (
        <div className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                        You&apos;re the{" "}
                        <strong>{isHider ? "hider" : "seeker"}</strong>
                    </span>
                    {$session.expiresAt && (
                        <span className="text-xs text-muted-foreground">
                            {formatRemaining($session.expiresAt - now)}
                        </span>
                    )}
                </div>
                <span className="text-sm text-muted-foreground">Game code</span>
                <span
                    className="select-all font-mono text-3xl font-semibold tracking-widest"
                    data-testid="game-code"
                >
                    {formattedCode}
                </span>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyText(formattedCode, "Game code")}
                    >
                        Copy code
                    </Button>
                    {typeof navigator !== "undefined" &&
                        "share" in navigator && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    navigator
                                        .share({
                                            title: "Hide and Seek game",
                                            text: `Join my Hide and Seek game with code ${formattedCode}`,
                                        })
                                        .catch(() => {})
                                }
                            >
                                Share
                            </Button>
                        )}
                </div>
                {isHider && $session.hiderKey && (
                    <details className="mt-1">
                        <summary className="cursor-pointer text-sm text-muted-foreground">
                            Hider key (keep this secret)
                        </summary>
                        <div className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">
                            <span>
                                Needed to take over as the hider on another
                                device, or if this one loses its data. Never
                                send it to the seekers.
                            </span>
                            <span className="select-all break-all font-mono">
                                {$session.hiderKey}
                            </span>
                            <div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        copyText(
                                            $session.hiderKey ?? "",
                                            "Hider key",
                                        )
                                    }
                                >
                                    Copy hider key
                                </Button>
                            </div>
                        </div>
                    </details>
                )}
            </div>

            {isHider && (
                <div className="flex flex-col gap-2 rounded-md border p-3">
                    <h3 className="font-poppins text-lg font-semibold">
                        Hider controls
                    </h3>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                disabled={$status.status !== "online"}
                                className="bg-amber-600 hover:bg-amber-700"
                            >
                                Tell the seekers they&apos;re in my zone
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Tell the seekers they&apos;re in your zone?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    Every seeker is alerted at once. Once
                                    they&apos;ve entered your zone you should
                                    stop moving.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    className="mb-2 sm:mb-0"
                                    onClick={() => {
                                        sendZoneNotice();
                                        toast.success("Seekers alerted", {
                                            autoClose: 2000,
                                        });
                                    }}
                                >
                                    Alert the seekers
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="outline"
                                disabled={$status.status !== "online"}
                            >
                                End the game for everyone
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    End the game for everyone?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    The server deletes everything it holds for
                                    this game straight away. Everyone keeps
                                    their own questions on their device.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    className="mb-2 sm:mb-0"
                                    onClick={() => endGame()}
                                >
                                    End the game
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}

            {$unreadable.length > 0 && (
                <div className="flex flex-col gap-2 rounded-md border border-amber-400 p-3">
                    <h3 className="font-poppins text-lg font-semibold">
                        Messages this version couldn&apos;t read
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Update the app, then paste these in with the paste
                        button. Nothing has been lost.
                    </p>
                    {$unreadable.map((message) => (
                        <div
                            key={message.seq}
                            className="flex items-center justify-between gap-2"
                        >
                            <span className="text-sm">
                                From the {message.from}
                            </span>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    copyText(message.payload, "Message")
                                }
                            >
                                Copy
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="ghost" className="text-red-700">
                        Leave this game
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Leave this game?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You&apos;ll stop getting updates.{" "}
                            {isHider &&
                                "Keep your hider key if you may want to come back. "}
                            Your questions stay on this device.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Stay</AlertDialogCancel>
                        <AlertDialogAction
                            className="mb-2 sm:mb-0"
                            onClick={() => leaveGame()}
                        >
                            Leave
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export const OnlineGameDrawer = () => {
    const $open = useStore(onlineGameDrawerOpen);
    const $session = useStore(gameSession);
    const $enabled = useStore(onlineEnabled);

    return (
        <Drawer open={$open} onOpenChange={onlineGameDrawerOpen.set}>
            <DrawerContent>
                <div className="mb-4 flex min-h-0 flex-1 flex-col items-center gap-4">
                    <DrawerHeader>
                        <DrawerTitle className="font-poppins text-4xl font-semibold">
                            Online game
                        </DrawerTitle>
                        <DrawerDescription>
                            Send questions and answers through a server instead
                            of copy and paste.
                        </DrawerDescription>
                    </DrawerHeader>
                    <div
                        key={$session ? "active" : "setup"}
                        className="flex max-h-[65vh] min-h-0 w-full max-w-[600px] flex-col items-center gap-4 overflow-y-scroll px-4 sm:px-12"
                    >
                        <label className="flex min-h-11 w-full cursor-pointer flex-row items-center justify-between gap-2">
                            <span className="flex flex-col gap-0.5">
                                <span className="text-base font-medium">
                                    Use the game server
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    Turn off to go back to Share and Paste. Your
                                    questions are kept.
                                </span>
                            </span>
                            <Checkbox
                                checked={$enabled}
                                onCheckedChange={(checked) =>
                                    onlineEnabled.set(!!checked)
                                }
                            />
                        </label>
                        <Separator />
                        {$session ? (
                            <>
                                <ActiveGame />
                                <ReadinessCheck />
                            </>
                        ) : (
                            <SetupForm />
                        )}
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    );
};
