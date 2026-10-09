import { MoreHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Touch-friendly menu row: 44px min height, label wraps instead of clipping. */
export const MORE_ACTIONS_ITEM_CLASS =
    "w-full h-auto min-h-11 justify-start gap-3 px-3 py-2 text-left whitespace-normal [&_svg]:shrink-0";

export const MoreActionsMenu = ({
    children,
    disabled,
    label = "More actions",
    triggerText,
}: {
    children: React.ReactNode;
    disabled?: boolean;
    label?: string;
    /** Optional visible text shown next to the icon on the trigger. */
    triggerText?: string;
}) => (
    <Popover>
        <PopoverTrigger asChild>
            <Button
                variant="outline"
                size={triggerText ? "default" : "icon"}
                className={cn("h-11", triggerText ? "gap-2" : "w-11")}
                disabled={disabled}
                title={label}
                aria-label={label}
            >
                <MoreHorizontalIcon />
                {triggerText}
            </Button>
        </PopoverTrigger>
        <PopoverContent
            align="end"
            collisionPadding={{ top: 8, left: 8, right: 8, bottom: 96 }}
            className="w-72 max-w-[calc(100vw-1rem)] p-1"
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
            MORE_ACTIONS_ITEM_CLASS,
            destructive &&
                "text-red-600 hover:text-red-600 hover:bg-destructive/10 dark:text-red-400 dark:hover:text-red-400",
            className,
        )}
    >
        {icon}
        {children}
    </Button>
);
