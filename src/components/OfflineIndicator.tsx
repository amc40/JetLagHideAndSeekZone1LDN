import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export const OfflineIndicator = ({
    className = "",
}: {
    className?: string;
}) => {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        setIsOffline(!navigator.onLine);

        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div
            className={`flex items-center gap-2 rounded-md bg-amber-100 px-3 py-1.5 text-sm text-amber-900 shadow-md ${className}`}
            role="status"
        >
            <WifiOff className="h-4 w-4 shrink-0" />
            Offline &mdash; new searches and some questions may not work
        </div>
    );
};
