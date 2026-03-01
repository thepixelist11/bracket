import { GOODBYE_MESSAGE, REPL_BANNER_ENABLED, STDOUT } from "../../shared/globals.js";

export function exit(code = 0): void {
    if (code === 0 && REPL_BANNER_ENABLED) {
        STDOUT.write(`\n${GOODBYE_MESSAGE}\n`);
    }

    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
    }
}

