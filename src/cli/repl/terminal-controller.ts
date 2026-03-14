import { REPLError } from "../../shared/errors.js";
import { Output } from "../io/output.js";
import { Err, Ok, Result } from "../../shared/data-structures/result.js";
import { Input } from "../io/input.js";

export interface TerminalControllerOptions {
    use_hist: boolean;
    output: Output;
    input: Input;
    on_exit: (code: number) => void;
    clear_buffer_on_commit: boolean;
    prompt: string;
};

type TerminalControllerInputCallback = (controller: TerminalController) => void;

export class TerminalController {
    public readonly ops: Readonly<TerminalControllerOptions>;
    private buffer: string[] = [""];
    private cursor_row = 0;
    private cursor_col = 0;
    private last_rendered: string[] = [];
    private last_rendered_lines = 0;
    private last_cursor_row = 0;

    private __key_press_handlers = new Map<string, TerminalControllerInputCallback>();

    constructor(ops: Partial<TerminalControllerOptions> = {}) {
        this.ops = {
            use_hist: ops.use_hist ?? false,
            output: ops.output ?? Output.STDOUT,
            input: ops.input ?? Input.STDIN,
            on_exit: ops.on_exit ?? (() => { }),
            clear_buffer_on_commit: ops.clear_buffer_on_commit ?? true,
            prompt: ops.prompt ?? "",
        };
    }

    public start(): Result {
        const input = this.ops.input;

        if (input.isTTY) process.stdin.setRawMode(true);
        else return Err(new REPLError("this REPL requires a TTY."));

        input.setEncoding("utf8");
        input.resume();

        this.setupExitHandlers();
        input.on("data", this.handleInput);

        return Ok();
    }

    public exit(code = 0) {
        this.ops.on_exit(code);

        if (this.ops.input.isTTY) {
            this.ops.input.setRawMode(false);
            this.ops.input.pause();
        }
    }

    public commitBuffer() {
        const buf = this.buffer.join("\n");
        this.__onBufferCommit(buf);
        if (this.ops.clear_buffer_on_commit) this.reset();
    }

    public reset() {
        this.buffer = [];
        this.cursor_row = 0;
        this.cursor_col = 0;
        this.render();
    }

    public render() {
        this.ops.output.write("\r\u001b[2K");
        this.ops.output.write(
            this.ops.prompt +
            this.buffer[0]
            // this.buffer.join(`\n${" ".repeat(this.ops.prompt.length)}`)
        );

        this.ops.output.write(`\r\u001b[${this.ops.prompt.length + this.cursor_col}C`);
    }

    public clear() {
        this.ops.output.write("\r\u001b[2J\u001b[H");
        this.last_rendered = [];
        this.last_cursor_row = 0;
    }

    public onBufferCommit(cb: (buf: string) => void) {
        this.__onBufferCommit = cb;
    }

    public onKeyPress(key: string, cb: TerminalControllerInputCallback) {
        this.__key_press_handlers.set(key, cb);
    }

    public removeKeyPressHandler(key: string): boolean {
        return this.__key_press_handlers.delete(key);
    }

    public insertChar(ch: string): void {
        if (ch === "\n") {
            const before = this.buffer[this.cursor_row].slice(0, this.cursor_col);
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
            this.cursor_col += ch.length;
        }
    }

    private __onBufferCommit: (buf: string) => void = () => { };
    private setupExitHandlers() {
        this.ops.input.on("SIGINT", this.exit);
        this.ops.input.on("SIGUSR1", this.exit);
        this.ops.input.on("SIGUSR2", this.exit);
        this.ops.input.on("uncaughtException", err => {
            this.ops.output.error(err);
            this.exit(1);
        });
    }

    private handleInput(data: Buffer<ArrayBuffer>) {
        const key_str = String(data);

        for (const [key, cb] of this.__key_press_handlers) {
            if (key_str === key)
                cb(this);
        }

        this.render();
    }
}
