import { toast } from "react-toastify";

import { compress, shareOrFallback, uploadToPastebin } from "@/lib/utils";

export const HIDING_ZONE_COMPRESSED_URL_PARAM = "hzc";
export const PASTEBIN_URL_PARAM = "pb";

export const shareHidingZone = async (
    hidingZone: unknown,
    alwaysUsePastebin: boolean,
    pastebinApiKey: string,
) => {
    const hidingZoneString = JSON.stringify(hidingZone);
    let compressedData;
    try {
        compressedData = await compress(hidingZoneString);
    } catch (error) {
        console.error("Compression failed:", error);
        toast.error(`Failed to prepare data for sharing`);
        return;
    }

    const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
    let shareUrl = `${baseUrl}?${HIDING_ZONE_COMPRESSED_URL_PARAM}=${compressedData}`;

    if (alwaysUsePastebin || shareUrl.length > 2000) {
        if (!pastebinApiKey) {
            toast.error(
                "Data is too large for a URL or Pastebin is forced. Please enter a Pastebin API key in Options to share via Pastebin.",
            );
            return;
        }
        try {
            toast.info("Data is being shared via Pastebin...");
            const pastebinUrl = await uploadToPastebin(
                pastebinApiKey,
                hidingZoneString,
            );
            const pasteId = pastebinUrl.substring(
                pastebinUrl.lastIndexOf("/") + 1,
            );
            shareUrl = `${baseUrl}?${PASTEBIN_URL_PARAM}=${pasteId}`;
            toast.success(
                "Successfully uploaded to Pastebin! URL is ready to be shared.",
            );
        } catch (error) {
            console.error("Pastebin upload failed:", error);
            toast.error(
                `Pastebin upload failed. Please check your API key and try again.`,
            );
            return;
        }
    }

    // Show platform native share sheet if possible
    await shareOrFallback(shareUrl).then((result) => {
        if (result === false) {
            return toast.error(
                `Clipboard not supported. Try manually copying/pasting: ${shareUrl}`,
                { className: "p-0 w-[1000px]" },
            );
        }

        if (result === "clipboard") {
            toast.success("Hiding zone URL copied to clipboard", {
                autoClose: 2000,
            });
        }
    });
};
