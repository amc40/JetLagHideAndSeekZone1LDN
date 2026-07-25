import { MoreHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const MoreActionsMenu = ({
    children,
    disabled,
    label = "More actions",
    onInteractOutside,
}: {
    children: React.ReactNode;
    disabled?: boolean;
    label?: string;
    onInteractOutside?: React.ComponentProps<
        typeof PopoverContent
    >["onInteractOutside"];
}) => (
    <Popover>
        <PopoverTrigger asChild>
            <Button
                variant="outline"
                size="icon"
                disabled={disabled}
                title={label}
                aria-label={label}
            >
                <MoreHorizontalIcon />
            </Button>
        </PopoverTrigger>
        <PopoverContent
            align="end"
            className="w-56 p-1"
            onInteractOutside={onInteractOutside}
        >
            <div className="flex flex-col gap-1">{children}</div>
        </PopoverContent>
    </Popover>
);

export const MoreActionsMenuItem = ({
    icon,
    children,
    onClick,
    disabled,
    destructive,
    className,
}: {
    icon: React.ReactNode;
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    destructive?: boolean;
    className?: string;
}) => (
    <Button
        type="button"
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "w-full justify-start gap-2 px-2",
            destructive &&
                "text-red-600 hover:text-red-600 hover:bg-destructive/10 dark:text-red-400 dark:hover:text-red-400",
            className,
        )}
    >
        {icon}
        {children}
    </Button>
);
