import { REPL_HISTORY_FILE, REPL_INPUT_HISTORY_SIZE, REPL_LOAD_COMMANDS_FROM_HIST } from "../../shared/globals.js";
import fs from "fs";

export class TerminalHistory {
    current_hist = -1;
    hist: string[][] = [];
    temp_hist_buffers = new Map<number, string[]>();

    load(): void {
        if (!REPL_HISTORY_FILE || !fs.existsSync(REPL_HISTORY_FILE)) return;

        const lines = fs.readFileSync(REPL_HISTORY_FILE, "utf8")
            .split(/(?<!:)::\n/)
            .filter(v => v !== "");

        this.hist = lines
            .filter(l => REPL_LOAD_COMMANDS_FROM_HIST || l[0] !== ",")
            .reverse()
            .slice(0, REPL_INPUT_HISTORY_SIZE)
            .map(l => l.replaceAll("::::", "::").split("\n"));
    }

    append(current_buffer: string[]): void {
        // FIXME: Check array equality for buffers
        if (this.hist.at(0) === current_buffer) return;
        const escaped = current_buffer.map(line => line.replaceAll("::", "::::"));

        fs.appendFileSync(REPL_HISTORY_FILE, escaped + "::\n");
        this.hist.unshift(current_buffer);
    }

    getEntry(idx: number): string[] {
        if (this.temp_hist_buffers.has(idx))
            return this.temp_hist_buffers.get(idx)!;

        return idx >= this.hist.length ? [""] : this.hist[idx];
    }

}
