export type OcrMode =
    | "balanced"
    | "highContrast"
    | "lowLight"
    | "sharpened";

export const OCR_MODES: Array<{
    id: OcrMode;
    label: string;
    detail: string;
}> = [
        {
            id: "balanced",
            label: "Balanced",
            detail: "General-purpose correction",
        },
        {
            id: "highContrast",
            label: "High contrast",
            detail: "For glare and busy backgrounds",
        },
        {
            id: "lowLight",
            label: "Low light",
            detail: "Brightens dark or shadowed cards",
        },
        {
            id: "sharpened",
            label: "Sharpened",
            detail: "For soft or slightly blurry text",
        },
    ];