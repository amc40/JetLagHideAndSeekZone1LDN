import { useState } from "react";

import { Button } from "./ui/button";

interface CacheReport {
    name: string;
    entries: number;
    bytes: number;
    opaque: number;
}

interface Report {
    caches: CacheReport[];
    usage?: number;
    quota?: number;
}

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

// The service worker's precache holds the app itself; wiping it would break
// offline use until the next online visit, so "clear" leaves it alone.
const isPrecache = (name: string) => name.startsWith("workbox-precache");

const measure = async (): Promise<Report> => {
    const caches_: CacheReport[] = [];

    for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        let bytes = 0;
        let opaque = 0;

        for (const request of requests) {
            const response = await cache.match(request);
            if (!response) continue;
            // Opaque responses can't be read; browsers just report a padded
            // quota figure for them.
            if (response.type === "opaque") {
                opaque++;
                continue;
            }
            bytes += (await response.clone().blob()).size;
        }

        caches_.push({ name, entries: requests.length, bytes, opaque });
    }

    const estimate = await navigator.storage?.estimate?.();

    return {
        caches: caches_.sort((a, b) => b.bytes - a.bytes),
        usage: estimate?.usage,
        quota: estimate?.quota,
    };
};

export const StorageUsage = () => {
    const [report, setReport] = useState<Report | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);

    const run = async (action?: () => Promise<void>) => {
        setBusy(true);
        setError(false);
        try {
            await action?.();
            setReport(await measure());
        } catch (e) {
            console.log(e); // Probably a caches not supported error
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex w-full flex-col gap-2">
            <span className="text-base font-medium">Offline data</span>
            <p className="text-sm text-muted-foreground">
                Map tiles and downloaded data kept for offline use. Game state
                is stored separately and is not affected by clearing this.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy} onClick={() => run()}>
                    {report ? "Refresh" : "Check storage"}
                </Button>
                {report && (
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                            run(async () => {
                                for (const name of await caches.keys()) {
                                    if (!isPrecache(name)) {
                                        await caches.delete(name);
                                    }
                                }
                            })
                        }
                    >
                        Clear offline data
                    </Button>
                )}
            </div>
            {error && (
                <p className="text-sm text-red-600">
                    Couldn&apos;t read storage on this browser.
                </p>
            )}
            {report && (
                <div className="text-sm">
                    {report.usage !== undefined && (
                        <p>
                            Browser reports {formatBytes(report.usage)} used
                            {report.quota !== undefined &&
                                ` of ${formatBytes(report.quota)}`}
                            . This can overstate real usage.
                        </p>
                    )}
                    <ul className="mt-1 flex flex-col gap-0.5">
                        {report.caches.map((cache) => (
                            <li
                                key={cache.name}
                                className="flex justify-between gap-2"
                            >
                                <span className="break-all">{cache.name}</span>
                                <span className="whitespace-nowrap">
                                    {cache.entries} · {formatBytes(cache.bytes)}
                                    {cache.opaque > 0 &&
                                        ` (+${cache.opaque} opaque)`}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
