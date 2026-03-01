import { REPL_AUTOCOMPLETE, REPL_BANNER_ENABLED, REPL_PROMPT, WELCOME_MESSAGE } from "../../shared/globals.js";
import { exit } from "../io/lifecycle.js";
import { Output } from "../io/output.js";
import { TerminalHistory } from "./history.js";

export const enum KeyPress {
    ETX = "\u0003",
    EOT = "\u0004",
    HT = "\u0009",
    LF = "\u000a",
    VT = "\u000b",
    FF = "\u000c",
    CR = "\u000d",
    DEL = "\u007f",
    UP = "\u001b[A",
    DOWN = "\u001b[B",
    RIGHT = "\u001b[C",
    LEFT = "\u001b[D",
    CBS = "\u001c",
};

export class TerminalController {
    buffer: string[] = [""];
    cursor_line = 0;
    cursor_col = 0;
    last_rendered: string[] = [];
    last_rendered_lines = 0;
    last_cursor_line = 0;

    private __onBufferCommit: (buf: string) => void = () => { };

    constructor(public stdout: Output, private hist: TerminalHistory, public use_hist: boolean) { }

    insertChar(ch: string): void {
        if (ch === "\n") {
            const before = this.buffer[this.cursor_line].slice(0, this.cursor_col);
            const after = this.buffer[this.cursor_line].slice(this.cursor_col);
            this.buffer[this.cursor_line] = before;
            this.cursor_line++;
            this.cursor_col = 0;
            this.buffer.splice(this.cursor_line, 0, after);
        } else {
            this.buffer[this.cursor_line] =
                this.buffer[this.cursor_line].slice(0, this.cursor_col) +
                ch +
                this.buffer[this.cursor_line].slice(this.cursor_col);
            this.cursor_col += ch.length;
        }

        this.hist.temp_hist_buffers.set(this.hist.current_hist, this.buffer);
    }

    isEnter(key: string): boolean {
        return key === KeyPress.CR || key === KeyPress.LF;
    }

    isEnd(key: string): boolean {
        return key === KeyPress.EOT || key === KeyPress.ETX;
    }

    isCtrlBackslash(key: string): boolean {
        return key === KeyPress.CBS;
    }

    render(): void {
        this.stdout.write("\r\u001b[2K");
        this.stdout.write(REPL_PROMPT + this.buffer[0]);
        this.stdout.write(`\r\u001b[${REPL_PROMPT.length + this.cursor_col}C`);
    }

    clear(): void {
        this.stdout.write("\r\u001b[2J\u001b[H");
        this.last_rendered = [];
        this.last_cursor_line = 0;
    }

    commitBuffer(): void {
        const buf = this.buffer.join("\n");
        this.__onBufferCommit(buf);
    }

    backspace(): void {
        // if (cursor_col === 0) {
        //     if (cursor_line === 0) return;
        //     const prev = buffer[cursor_line - 1];
        //     buffer[cursor_line - 1] += buffer[cursor_line];
        //     buffer.splice(cursor_line, 1);
        //     cursor_line--;
        //     cursor_col = Math.max(prev.length, 0);
        //     return;
        // };

        if (this.cursor_col === 0) return;

        this.buffer[this.cursor_line] =
            this.buffer[this.cursor_line].slice(0, this.cursor_col - 1) +
            this.buffer[this.cursor_line].slice(this.cursor_col);
        this.cursor_col--;

        this.hist.temp_hist_buffers.set(this.hist.current_hist, this.buffer);
    }

    // TODO: Split current input, only check current ident and only at cursor position
    // getAutocomplete() {
    //     const keys = [...INTERN_TABLE.keys(), ...this.env.builtins.keys()];
    //     const full = keys.find(v => v.startsWith(this.buffer[this.cursor_line].substring(0, this.cursor_col))) ?? "";
    //     const suffix = full?.substring(this.cursor_col);
    //
    //     return { full, suffix, write_count: full.length - suffix.length };
    // }

    moveCursorLeft(): void {
        if (this.cursor_col > 0) {
            this.cursor_col--;
        } else if (this.cursor_line > 0) {
            // cursor_line--;
            // cursor_col = Math.max(buffer[cursor_line].length, 0);
        }
    }

    moveCursorRight(): void {
        if (this.cursor_col < this.buffer[this.cursor_line].length) {
            this.cursor_col++;
        } else if (this.cursor_line < this.buffer.length - 1) {
            // cursor_line++;
            // cursor_col = 0;
        }
    }

    moveCursorUp(): void {
        if (this.cursor_line > 0) {
            this.cursor_line--;
            this.cursor_col = Math.min(this.cursor_col, this.buffer[this.cursor_line].length);
        }
    }

    moveCursorDown(): void {
        if (this.cursor_line < this.buffer.length - 1) {
            this.cursor_line++;
            this.cursor_col = Math.min(this.cursor_col, this.buffer[this.cursor_line].length);
        }
    }

    start() {
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        else throw new Error("this.REPL requires a TTY.");

        process.stdin.setEncoding("utf8");
        process.stdin.resume();

        process.on("SIGINT", exit);
        process.on("SIGUSR1", exit);
        process.on("SIGUSR2", exit);
        process.on("uncaughtException", err => {
            this.stdout.error(err);
            exit(1);
        });

        process.stdin.on("data", data => {
            const key_str = String(data);

            if (this.isCtrlBackslash(key_str)) {
                this.insertChar("λ");
                this.render();
                return;
            }

            if (this.isEnd(key_str)) {
                if (this.buffer[this.cursor_line].length === 0) {
                    exit(0);
                } else {
                    this.hist.temp_hist_buffers.set(-1, [""]);
                    this.hist.current_hist = -1;
                    this.buffer = this.hist.getEntry(-1);
                    this.cursor_line = 0;
                    this.cursor_col = 0;
                    this.render();
                    return;
                }
            }

            if (this.isEnter(key_str)) {
                this.commitBuffer();
                return;
            }

            if (key_str === KeyPress.FF) {
                this.clear();
                this.render();
                return;
            }

            if (key_str === KeyPress.DEL) {
                this.backspace();
                this.render();
                return;
            }

            if (key_str === KeyPress.HT) {
                if (!REPL_AUTOCOMPLETE) return;
                // const autocomplete = this.getAutocomplete();
                // const start_pos = Math.max(0, this.cursor_col - autocomplete.write_count);
                // this.buffer[this.cursor_line] =
                //     this.buffer[this.cursor_line].slice(0, start_pos) +
                //     autocomplete.full +
                //     this.buffer[this.cursor_line].slice(start_pos + autocomplete.write_count);
                //
                // this.cursor_col = this.buffer.length;
                // this.render();
                return;
            }

            if (key_str === KeyPress.UP) {
                if (!this.use_hist) return;

                if (this.hist.current_hist >= this.hist.hist.length) return;
                this.buffer = this.hist.getEntry(++this.hist.current_hist);

                this.cursor_line = this.buffer.length - 1;
                this.cursor_col = this.buffer[this.cursor_line].length;

                this.render();
                return;
            }

            if (key_str === KeyPress.DOWN) {
                if (!this.use_hist) return;

                if (this.hist.current_hist < 0) return;
                this.hist.current_hist--;

                if (this.hist.current_hist === -1) {
                    this.buffer = this.hist.temp_hist_buffers.get(-1) ?? [""];
                } else {
                    this.buffer = this.hist.getEntry(this.hist.current_hist);
                }

                this.cursor_line = 0;
                this.cursor_col = this.buffer[this.cursor_line].length;

                this.render();
                return;
            }

            // if (key_str === KeyPress.UP) {
            //     moveCursorUp();
            //     render();
            //     return;
            // }
            //
            // if (key_str === KeyPress.DOWN) {
            //     moveCursorDown();
            //     render();
            //     return;
            // }

            if (key_str === KeyPress.RIGHT) {
                this.moveCursorRight();
                this.render();
                return;
            }

            if (key_str === KeyPress.LEFT) {
                this.moveCursorLeft();
                this.render();
                return;
            }

            if (key_str < " " || key_str === "\u007f") return;

            this.insertChar(key_str);
            this.render();
        });

        if (REPL_BANNER_ENABLED)
            this.stdout.write(`${WELCOME_MESSAGE}\n`);

        this.render();
    }

    onBufferCommit(cb: (buf: string) => void) {
        this.__onBufferCommit = cb;
    }
}

