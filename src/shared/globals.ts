export const LANG_NAME = `Bracket` as const;
export const VERSION_ID = 1 as const;
export const VERSION_ID_MAP: { [VERSION_ID]: string; [key: number]: string } = {
    1: "0.1.0",
} as const;

export const REPL_PROMPT = "> " as const;
export const REPL_WELCOME_MESSAGE =
    `Welcome to ${LANG_NAME} v${VERSION_ID_MAP[VERSION_ID]}.` as const;
export const REPL_GOODBYE_MESSAGE = `Goodbye.` as const;
export const REPL_BANNER_ENABLED = true as const;
