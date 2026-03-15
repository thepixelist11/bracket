import { TerminalHistory } from "./history.js";
import {
    KeyPress,
    TERMINAL_CONTROLLER_DEFAULTS,
    TerminalController,
    TerminalControllerOptions,
} from "./terminal-controller.js";

export type REPLBackend = (
    input: string,
    controller: TerminalController,
) => void | Promise<void>;

export type REPLOptions = TerminalControllerOptions & {
    banner_enabled: boolean;
    welcome_message: string;
    history_size: number;
    history_file: string;
};

export const REPL_DEFAULTS: REPLOptions = {
    ...TERMINAL_CONTROLLER_DEFAULTS,
    banner_enabled: true,
    welcome_message: "",
    history_size: 100,
    history_file: "",
};

const rerender =
    (fn: (ctl: TerminalController, key: string) => void) =>
    (ctl: TerminalController, key: string) => {
        fn(ctl, key);
        ctl.render();
    };

export class REPL {
    public readonly opts: Readonly<REPLOptions>;
    private controller: TerminalController;
    private hist: TerminalHistory;

    constructor(
        private backend: REPLBackend,
        opts: Partial<REPLOptions> = {},
    ) {
        this.opts = this.defaultOptions(opts);
        this.hist = new TerminalHistory();
        this.controller = new TerminalController(this.opts);
        this.registerKeybinds();
    }

    private registerKeybinds() {
        this.controller.onKeyPress([KeyPress.EOT, KeyPress.ETX], (ctl) => {
            if (ctl.currentLine().length === 0) ctl.exit(0);
            else ctl.reset();
        });

        this.controller.onKeyPress([KeyPress.CR, KeyPress.LF], (ctl) =>
            ctl.commitBuffer(),
        );

        this.controller.onKeyPress(
            KeyPress.FF,
            rerender((ctl) => ctl.clear()),
        );

        this.controller.onKeyPress(
            KeyPress.RIGHT,
            rerender((ctl) => ctl.moveCursorRight()),
        );

        this.controller.onKeyPress(
            KeyPress.LEFT,
            rerender((ctl) => ctl.moveCursorLeft()),
        );

        this.controller.onKeyPress(
            KeyPress.UP,
            rerender((ctl) => {
                if (!this.opts.use_hist) return;
                const prev = this.hist.previous(ctl.current_buffer);
                if (prev) {
                    ctl.setBuffer(prev);
                    ctl.moveCursorTo(prev.length, prev.at(-1)?.length ?? 0);
                }
            }),
        );

        this.controller.onKeyPress(
            KeyPress.DOWN,
            rerender((ctl) => {
                if (!this.opts.use_hist) return;
                const next = this.hist.next();
                if (next) {
                    ctl.setBuffer(next);
                    ctl.moveCursorTo(next.length, next.at(-1)?.length ?? 0);
                }
            }),
        );

        this.controller.onKeyPress(
            KeyPress.DEL,
            rerender((ctl) => {
                ctl.backspace();
                if (this.opts.use_hist)
                    this.hist.updateCurrent(ctl.current_buffer);
            }),
        );

        this.controller.onKeyPress(
            TerminalController.KEYPRESS_PRINTABLE,
            rerender((ctl, key) => {
                ctl.insertChar(key);
                if (this.opts.use_hist)
                    this.hist.updateCurrent(ctl.current_buffer);
            }),
        );

        this.controller.onBufferCommit(async (buf) => {
            if (this.opts.use_hist) {
                this.hist.append(buf);
                this.hist.appendFile(this.opts.history_file, buf);
            }
            await this.backend(buf.join("\n"), this.controller);
        });
    }

    public loadHist(file_path: string): boolean {
        if (!this.opts.use_hist) return false;
        return this.hist.loadFile(file_path, this.opts.history_size);
    }

    public defaultOptions(opts: Partial<REPLOptions> = {}): REPLOptions {
        return {
            ...REPL_DEFAULTS,
            ...opts,
        };
    }

    public start() {
        this.controller.start();

        if (this.opts.use_hist && this.opts.history_file !== "")
            this.loadHist(this.opts.history_file);

        if (this.opts.banner_enabled)
            this.opts.output.write(`${this.opts.welcome_message}\n`);

        this.controller.render();
    }
}
