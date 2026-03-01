import { REPL_COMMAND_MAX_LINE_LENGTH } from "../../globals.js";

export function stripNewlines(str: string, replacement = "\\n"): string {
    return str.replaceAll(/\n/g, replacement);
}

export function wrapLines(str: string, max_len: number = REPL_COMMAND_MAX_LINE_LENGTH) {
    if (str === "\n") return "\n";

    const pattern = new RegExp(`\\n|[^\\n]{1,${max_len}}(?=\\s|$)|[^\\n]{${max_len}}`, "g");

    let result = "";
    let first = true;

    for (const m of str.matchAll(pattern)) {
        const chunk = m[0];

        if (chunk === "\n") {
            result += "\n";
            first = true;
        } else {
            if (!first) result += "\n";
            result += chunk;
            first = false;
        }
    }

    return result;
}

