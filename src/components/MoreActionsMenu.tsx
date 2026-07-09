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
}: {
    children: React.ReactNode;
    disabled?: boolean;
    label?: string;
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
        <PopoverContent align="end" className="w-56 p-1">
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
                "text-destructive hover:text-destructive hover:bg-destructive/10",
            className,
        )}
    >
        {icon}
        {children}
    </Button>
);
