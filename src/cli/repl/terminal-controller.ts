import { REPLError } from "../../shared/errors.js";
import { Output } from "../io/output.js";
import { Err, Ok, Result } from "../../shared/data-structures/result.js";
import { Input } from "../io/input.js";

export const TERMINAL_CONTROLLER_DEFAULTS = {
    use_hist: false,
    output: Output.STDOUT,
    input: Input.STDIN,
    on_exit: () => {},
    clear_buffer_on_commit: true,
    prompt: "",
    newline_on_commit: true,
} as const;

export interface TerminalControllerOptions {
    use_hist: boolean;
    output: Output;
    input: Input;
    on_exit: (code: number) => void;
    clear_buffer_on_commit: boolean;
    prompt: string;
    newline_on_commit: boolean;
}

type TerminalControllerInputCallback = (
    controller: TerminalController,
    key: string,
) => void;

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
}

export class TerminalController {
    public readonly opts: Readonly<TerminalControllerOptions>;
    private buffer: string[] = [""];
    private cursor_row = 0;
    private cursor_col = 0;

    private __key_press_handlers_str = new Map<
        string,
        TerminalControllerInputCallback
    >();

    private __key_press_handlers_pred: [
        (key: string) => boolean,
        TerminalControllerInputCallback,
    ][] = [];

    constructor(opts: Partial<TerminalControllerOptions> = {}) {
        this.opts = TerminalController.defaultOptions(opts);
    }

    get row() {
        return this.cursor_row;
    }
    get col() {
        return this.cursor_col;
    }
    get current_buffer(): Readonly<string[]> {
        return this.buffer;
    }

    public setBuffer(buffer: string[]) {
        this.buffer = buffer;
    }

    public currentLine() {
        return this.buffer[this.cursor_row] ?? "";
    }

    public start(): Result {
        const input = this.opts.input;

        if (input.isTTY) process.stdin.setRawMode(true);
        else return Err(new REPLError("this REPL requires a TTY."));

        input.setEncoding("utf8");
        input.resume();

        this.setupExitHandlers();
        input.on("data", this.handleInput);

        return Ok();
    }

    public exit = (code = 0) => {
        this.opts.on_exit(code);

        if (this.opts.input.isTTY) {
            this.opts.input.setRawMode(false);
            this.opts.input.pause();
        }
    };

    public commitBuffer() {
        if (this.opts.newline_on_commit) this.outputNewline();

        if (this.__onBufferCommit) this.__onBufferCommit(this.buffer);

        if (this.opts.clear_buffer_on_commit) this.reset();
    }

    public reset() {
        this.buffer = [""];
        this.cursor_row = 0;
        this.cursor_col = 0;
        this.render();
    }

    public render() {
        this.opts.output.write("\r\u001b[2K");
        this.opts.output.write(
            this.opts.prompt + this.buffer[0],
            // this.buffer.join(`\n${" ".repeat(this.ops.prompt.length)}`)
        );

        this.opts.output.write(
            `\r\u001b[${this.opts.prompt.length + this.cursor_col}C`,
        );
    }

    public clear() {
        this.opts.output.write("\r\u001b[2J\u001b[H");
    }

    public onBufferCommit(cb: (buf: string[]) => void) {
        this.__onBufferCommit = cb;
    }

    public onKeyPress(key: string, cb: TerminalControllerInputCallback): void;
    public onKeyPress(key: string[], cb: TerminalControllerInputCallback): void;
    public onKeyPress(
        key: (key: string) => boolean,
        cb: TerminalControllerInputCallback,
    ): void;
    public onKeyPress(
        key: string | string[] | ((key: string) => boolean),
        cb: TerminalControllerInputCallback,
    ) {
        if (typeof key === "string") this.__key_press_handlers_str.set(key, cb);
        else if (Array.isArray(key))
            for (const k of key) this.__key_press_handlers_str.set(k, cb);
        else if (typeof key === "function")
            this.__key_press_handlers_pred.push([key, cb]);
    }

    public removeKeyPressHandler(key: string): boolean {
        return this.__key_press_handlers_str.delete(key);
    }

    public insertChar(ch: string): void {
        if (ch === "\n") {
            const before = this.buffer[this.cursor_row].slice(
                0,
                this.cursor_col,
            );
            const after = this.buffer[this.cursor_row].slice(this.cursor_col);
            this.buffer[this.cursor_row] = before;
            this.cursor_row++;
            this.cursor_col = 0;
            this.buffer.splice(this.cursor_row, 0, after);
        } else {
            this.buffer[this.cursor_row] =
                this.buffer[this.cursor_row].slice(0, this.cursor_col) +
                ch +
                this.buffer[this.cursor_row].slice(this.cursor_col);
            this.cursor_col++;
        }
    }

    public backspace(): void {
        if (this.cursor_col === 0) return;

        this.buffer[this.cursor_row] =
            this.buffer[this.cursor_row].slice(0, this.cursor_col - 1) +
            this.buffer[this.cursor_row].slice(this.cursor_col);
        this.cursor_col--;
    }

    public moveCursorLeft(n = 1): void {
        if (this.cursor_col - n >= 0) {
            this.cursor_col -= n;
        } else if (this.cursor_row - n >= 0) {
            // for multi-line editing
        }
    }

    public moveCursorRight(n = 1): void {
        if (this.cursor_col + n <= this.currentLine().length) {
            this.cursor_col += n;
        } else if (this.cursor_row + n <= this.buffer.length - 1) {
            // for multi-line editing
        }
    }

    public moveCursorTo(row: number, col: number): void {
        this.cursor_row = Math.max(Math.min(row, this.buffer.length - 1), 0);
        this.cursor_col = Math.max(
            Math.min(col, this.buffer[this.cursor_row].length),
            0,
        );
    }

    public outputNewline(): boolean {
        return this.opts.output.write("\n");
    }

    public output(str: string): boolean {
        return this.opts.output.write(str);
    }

    private __onBufferCommit: (buf: string[]) => void = () => {};
    private setupExitHandlers(): void {
        process.on("SIGINT", this.exit);
        process.on("SIGUSR1", this.exit);
        process.on("SIGUSR2", this.exit);
        process.on("uncaughtException", (err) => {
            this.opts.output.error(err);
            this.exit(1);
        });
    }

    private handleInput = (data: Buffer): void => {
        const key_str = String(data);

        for (const [key, cb] of this.__key_press_handlers_str) {
            if (key_str === key) {
                cb(this, key_str);
                return;
            }
        }

        for (const [pred, cb] of this.__key_press_handlers_pred) {
            if (pred(key_str)) {
                cb(this, key_str);
                return;
            }
        }
    };

    static defaultOptions(
        opts: Partial<TerminalControllerOptions> = {},
    ): TerminalControllerOptions {
        return {
            ...TERMINAL_CONTROLLER_DEFAULTS,
            ...opts,
        };
    }

    static KEYPRESS_DEFAULT = () => true;
    static KEYPRESS_ASCII_PRINTABLE = (key: string) =>
        key.length === 1 &&
        key[0].charCodeAt(0) >= 32 && // 32 == space
        key[0].charCodeAt(0) < 127; // 127 == delete
    static KEYPRESS_PRINTABLE = (key: string) => /[^\p{C}]/u.test(key);
}
