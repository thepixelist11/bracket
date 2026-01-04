import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { Evaluator } from "./evaluator.js";
import { Token, TokenError, TokenVoid, TokenType } from "./token.js";
import { ASTLiteralNode, ASTNode, ASTProgram, ASTSExprNode } from "./ast.js";
import { BracketEnvironment } from "./env.js";
import { PartialExitCode, REPL_ENVIRONMENT_LABEL, REPL_AUTOCOMPLETE, REPL_BANNER_ENABLED, REPL_HIST_APPEND_ERRORS, REPL_HISTORY_FILE, REPL_INPUT_HISTORY_SIZE, REPL_LOAD_COMMANDS_FROM_HIST, REPL_PROMPT, REPL_VERBOSITY, WELCOME_MESSAGE, GOODBYE_MESSAGE, STDOUT } from "./globals.js";
import { printDeep, Output } from "./utils.js";
import fs from "fs";

const enum KeyPress {
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
};

export function REPL(use_hist = true) {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    else throw new Error("This REPL requires a TTY.");

    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    process.on("SIGINT", exit.bind(null, { exit: true }));
    process.on("SIGUSR1", exit.bind(null, { exit: true }));
    process.on("SIGUSR2", exit.bind(null, { exit: true }));
    process.on("uncaughtException", err => {
        console.error(err);
        exit({ exit: true }, 1);
    });

    let buffer: string[] = [""];
    let cursor_line = 0;
    let cursor_col = 0;
    let current_hist = -1;
    let last_rendered: string[] = [];
    let last_rendered_lines = 0;
    let last_cursor_line = 0;

    const hist = use_hist ? loadREPLHistory() : [];
    const temp_hist_buffers = new Map<number, string[]>();

    const l = new Lexer();
    const p = new Parser();
    const e = new Evaluator();

    const repl_stdout = new Output();
    const env = new BracketEnvironment(REPL_ENVIRONMENT_LABEL, undefined, repl_stdout);

    function insertChar(ch: string): void {
        if (ch === "\n") {
            const before = buffer[cursor_line].slice(0, cursor_col);
            const after = buffer[cursor_line].slice(cursor_col);
            buffer[cursor_line] = before;
            cursor_line++;
            cursor_col = 0;
            buffer.splice(cursor_line, 0, after);
        } else {
            buffer[cursor_line] =
                buffer[cursor_line].slice(0, cursor_col) +
                ch +
                buffer[cursor_line].slice(cursor_col);
            cursor_col += ch.length;
        }

        temp_hist_buffers.set(current_hist, buffer);
    }

    function isEnter(key: string): boolean {
        return key === KeyPress.CR || key === KeyPress.LF;
    }

    function isEnd(key: string): boolean {
        return key === KeyPress.EOT || key === KeyPress.ETX;
    }

    function loadREPLHistory(): string[][] {
        if (!REPL_HISTORY_FILE || !fs.existsSync(REPL_HISTORY_FILE)) return [];

        const lines = fs.readFileSync(REPL_HISTORY_FILE, "utf8")
            .split(/(?<!:)::\n/)
            .filter(v => v !== "");

        return lines
            .filter(l => REPL_LOAD_COMMANDS_FROM_HIST || l[0] !== ",")
            .reverse()
            .slice(0, REPL_INPUT_HISTORY_SIZE)
            .map(l => l.replaceAll("::::", "::").split("\n"));
    }

    function appendREPLHistory(current_buffer: string[]): void {
        if (hist.at(0) === current_buffer) return;
        const escaped = current_buffer.map(line => line.replaceAll("::", "::::"));

        fs.appendFileSync(REPL_HISTORY_FILE, escaped + "::\n");
        hist.unshift(current_buffer);
    }

    function getHistEntry(idx: number): string[] {
        if (temp_hist_buffers.has(idx))
            return temp_hist_buffers.get(idx)!;

        return idx >= hist.length ? [""] : hist[idx];
    }

    function REPLRunWithVerbosity(verbosity: number, callback: () => void): void {
        if (REPL_VERBOSITY < verbosity) return;
        callback();
    }

    function stdoutFlush() {
        STDOUT.write(env.stdout.buffer);
        env.stdout.reset();
    }

    function evaluate(expr: string): { result: Token, code: PartialExitCode, ast: ASTNode | ASTProgram } {
        let ret: { result: Token, code: PartialExitCode, ast: ASTNode | ASTProgram };

        try {
            const { result: toks, code: lex_code } = l.lex(expr);
            if (lex_code !== PartialExitCode.SUCCESS) {
                ret = {
                    result: toks.at(-1) ?? TokenError("lexer error"),
                    code: lex_code,
                    ast: new ASTSExprNode()
                };
                return ret;
            }

            const { result: ast, code: parse_code } = p.parse(toks);
            if (parse_code !== PartialExitCode.SUCCESS) {
                ret = {
                    result:
                        ast instanceof ASTLiteralNode && ast.tok.type === TokenType.ERROR
                            ? ast.tok
                            : TokenError("parser error"),
                    code: parse_code,
                    ast
                };
                return ret;
            }

            if (!(ast instanceof ASTProgram))
                throw new Error(`unexpected ASTNode; expected a Program`);

            const value = e.evaluateProgram(ast, env, env.stdout, false);

            appendREPLHistory(expr.split("\n"));

            ret = { result: value, code: PartialExitCode.SUCCESS, ast };
        } catch (err) {
            ret = {
                result: TokenError(`${env.label} ${((err as any).message ?? String(err))}`),
                code: PartialExitCode.ERROR,
                ast: new ASTSExprNode()
            };

            if (REPL_HIST_APPEND_ERRORS)
                appendREPLHistory(expr.split("\n"));
            return ret;
        }

        return ret;
    }

    function restoreTerminal(): void {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
            process.stdin.pause();
        }
    }

    function exit(options?: { exit: boolean }, code = 0): void {
        if ((!options || options.exit) && code === 0 && REPL_BANNER_ENABLED) {
            STDOUT.write(`\n${GOODBYE_MESSAGE}\n`);
        }

        restoreTerminal();
        if (options?.exit) process.exit(code);
    }

    function commitBuffer(): void {
        const input = buffer.join("\n");
        let final_result: Token = TokenVoid();

        if (input === "") {
            STDOUT.write("\n");
            render();
            return;
        }

        const before_count = env.stdout.write_count;

        const { result, code, ast } = evaluate(input);

        switch (code) {
            case PartialExitCode.SUCCESS:
                final_result = result;
                break;
            case PartialExitCode.ERROR:
                final_result = result;
                break;
            case PartialExitCode.INCOMPLETE:
                insertChar("\n");
                render();
                return;
        }

        STDOUT.write("\n");

        stdoutFlush();

        REPLRunWithVerbosity(2, () => {
            printDeep(ast);
        });

        REPLRunWithVerbosity(1, () => {
            printDeep(final_result);
        });

        if (final_result.type !== TokenType.EOF && final_result.type !== TokenType.VOID) {
            STDOUT.write(final_result.toString());
        }

        const wrote_output = env.stdout.write_count !== before_count;

        if (wrote_output || (final_result && final_result.type !== TokenType.VOID && final_result.type !== TokenType.EOF))
            STDOUT.write("\n");

        buffer = [""];
        temp_hist_buffers.clear();
        current_hist = -1;
        cursor_line = 0;
        cursor_col = 0;
        // last_rendered = [];
        // last_cursor_line = 0;

        render();
    }

    function backspace(): void {
        // if (cursor_col === 0) {
        //     if (cursor_line === 0) return;
        //     const prev = buffer[cursor_line - 1];
        //     buffer[cursor_line - 1] += buffer[cursor_line];
        //     buffer.splice(cursor_line, 1);
        //     cursor_line--;
        //     cursor_col = Math.max(prev.length, 0);
        //     return;
        // };

        if (cursor_col === 0) return;

        buffer[cursor_line] =
            buffer[cursor_line].slice(0, cursor_col - 1) +
            buffer[cursor_line].slice(cursor_col);
        cursor_col--;

        temp_hist_buffers.set(current_hist, buffer);
    }

    // TODO: Split current input, only check current ident and only at cursor position
    function getAutocomplete() {
        const keys = [...env.bindings.keys(), ...env.builtins.keys()];
        const full = keys.find(v => v.startsWith(buffer[cursor_line].substring(0, cursor_col))) ?? "";
        const suffix = full?.substring(cursor_col);

        return { full, suffix, write_count: full.length - suffix.length };
    }

    function moveCursorLeft(): void {
        if (cursor_col > 0) {
            cursor_col--;
        } else if (cursor_line > 0) {
            // cursor_line--;
            // cursor_col = Math.max(buffer[cursor_line].length, 0);
        }
    }

    function moveCursorRight(): void {
        if (cursor_col < buffer[cursor_line].length) {
            cursor_col++;
        } else if (cursor_line < buffer.length - 1) {
            // cursor_line++;
            // cursor_col = 0;
        }
    }

    function moveCursorUp(): void {
        if (cursor_line > 0) {
            cursor_line--;
            cursor_col = Math.min(cursor_col, buffer[cursor_line].length);
        }
    }

    function moveCursorDown(): void {
        if (cursor_line < buffer.length - 1) {
            cursor_line++;
            cursor_col = Math.min(cursor_col, buffer[cursor_line].length);
        }
    }

    // function render(): void {
    //     if (last_cursor_line > 1) {
    //         STDOUT.write(`\u001b[${last_cursor_line - 1}A`);
    //     }
    //     STDOUT.write("\r");
    //
    //     let first_diff = 0;
    //     while (
    //         first_diff < last_rendered.length &&
    //         first_diff < buffer.length &&
    //         last_rendered[first_diff] === buffer[first_diff]
    //     ) {
    //         first_diff++;
    //     }
    //
    //     if (first_diff > 0)
    //         STDOUT.write(`\u001b[${first_diff}B`);
    //
    //     const dy = (last_rendered.length - 1) - first_diff;
    //     if (dy > 0) STDOUT.write(`\u001b[${dy}A`);
    //     STDOUT.write("\r");
    //
    //     for (let i = first_diff; i < buffer.length; i++) {
    //         STDOUT.write("\r\u001b[2K");
    //         STDOUT.write(i === 0 ? REPL_PROMPT : REPL_CONTINUATION_PROMPT);
    //         STDOUT.write(buffer[i]);
    //         if (i + 1 < buffer.length) STDOUT.write("\n");
    //     }
    //
    //     for (let i = buffer.length; i < last_rendered.length; i++) {
    //         STDOUT.write("\r\u001b[2K\n");
    //     }
    //
    //     const to_top = buffer.length - 1;
    //     if (to_top > 0) STDOUT.write(`\u001b[${to_top}A`);
    //
    //     if (cursor_line > 0) {
    //         STDOUT.write(`\u001b[${cursor_line}B`);
    //     }
    //
    //     const prompt_width = cursor_line === 0 ? REPL_PROMPT.length : REPL_CONTINUATION_PROMPT.length;
    //
    //     STDOUT.write(`\r\u001b[${prompt_width + cursor_col}C`);
    //
    //     // if (REPL_AUTOCOMPLETE && str !== "") {
    //     //     const autocomplete = getAutocomplete();
    //     //     STDOUT.write(`\u001b[38;5;${REPL_AUTOCOMPLETE_GHOST_COLOR}m`);
    //     //     STDOUT.write(autocomplete.suffix);
    //     //     STDOUT.write("\u001b[0m");
    //     // }
    //
    //     last_rendered = buffer.slice();
    //     last_rendered_lines = cursor_line;
    // }

    function render(): void {
        STDOUT.write("\r\u001b[2K");
        STDOUT.write(REPL_PROMPT + buffer[0]);
        STDOUT.write(`\r\u001b[${REPL_PROMPT.length + cursor_col}C`);
    }

    function clear(): void {
        STDOUT.write("\r\u001b[2J\u001b[H");
        last_rendered = [];
        last_cursor_line = 0;
    }

    process.stdin.on("data", data => {
        const key_str = String(data);

        if (isEnd(key_str)) {
            if (buffer[cursor_line].length === 0) {
                exit({ exit: true }, 0);
            } else {
                temp_hist_buffers.set(-1, [""]);
                current_hist = -1;
                buffer = getHistEntry(-1);
                cursor_line = 0;
                cursor_col = 0;
                render();
                return;
            }
        }

        if (isEnter(key_str)) {
            commitBuffer();
            return;
        }

        if (key_str === KeyPress.FF) {
            clear();
            render();
            return;
        }

        if (key_str === KeyPress.DEL) {
            backspace();
            render();
            return;
        }

        if (key_str === KeyPress.HT) {
            if (!REPL_AUTOCOMPLETE) return;
            const autocomplete = getAutocomplete();
            const start_pos = Math.max(0, cursor_col - autocomplete.write_count);
            buffer[cursor_line] =
                buffer[cursor_line].slice(0, start_pos) +
                autocomplete.full +
                buffer[cursor_line].slice(start_pos + autocomplete.write_count);

            cursor_col = buffer.length;
            render();
            return;
        }

        if (key_str === KeyPress.UP) {
            if (!use_hist) return;

            if (current_hist >= hist.length) return;
            buffer = getHistEntry(++current_hist);

            cursor_line = buffer.length - 1;
            cursor_col = buffer[cursor_line].length;

            render();
            return;
        }

        if (key_str === KeyPress.DOWN) {
            if (!use_hist) return;

            if (current_hist < 0) return;
            current_hist--;

            if (current_hist === -1) {
                buffer = temp_hist_buffers.get(-1) ?? [""];
            } else {
                buffer = getHistEntry(current_hist);
            }

            cursor_line = 0;
            cursor_col = buffer[cursor_line].length;

            render();
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
            moveCursorRight();
            render();
            return;
        }

        if (key_str === KeyPress.LEFT) {
            moveCursorLeft();
            render();
            return;
        }

        if (key_str < " " || key_str === "\u007f") return;

        insertChar(key_str);
        render();
    });

    if (REPL_BANNER_ENABLED)
        STDOUT.write(`${WELCOME_MESSAGE}\n`);

    render();
}
