import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { Evaluator } from "./evaluator.js";
import { Token, TokenError, TokenVoid, TokenType } from "./token.js";
import { ASTLiteralNode, ASTNode, ASTProgram, ASTSExprNode } from "./ast.js";
import { BracketEnvironment } from "./env.js";
import { PartialExitCode, REPL_ENVIRONMENT_LABEL, REPL_AUTOCOMPLETE, REPL_BANNER_ENABLED, REPL_HIST_APPEND_ERRORS, REPL_HISTORY_FILE, REPL_INPUT_HISTORY_SIZE, REPL_LOAD_COMMANDS_FROM_HIST, REPL_PROMPT, REPL_VERBOSITY, WELCOME_MESSAGE, STDOUT, REPL_SAVE_COMMANDS_TO_HIST, HELP_TOPICS, DEFAULT_HELP_LABEL, REPL_APROPOS_MAX_LINE_LENGTH, REPL_COMMAND_CORRECTION_MAX_DISTANCE } from "./globals.js";
import { printDeep, Output, exit, editDistance } from "./utils.js";
import fs from "fs";

type REPLCommand =
    ({
        manual_write: true;
        fn: (args: string[], stdout: Output, env: BracketEnvironment, evaluator: Evaluator, parser: Parser, lexer: Lexer, table: REPLCommandTable) => void
    } | {
        manual_write?: false;
        fn: (args: string[], stdout: Output, env: BracketEnvironment, evaluator: Evaluator, parser: Parser, lexer: Lexer, table: REPLCommandTable) => string
    }) & {
        dispatch: string;
        manual_write?: boolean;
        doc?: string;
        arg_names?: string[];
        arg_optional?: boolean[];
        aliases?: string[];
    };

function generateDocumentation(name: string, doc: string = "", is_procedure: boolean = false, arg_names: string[] = [], variadic: boolean = false, bound_to: Token = TokenVoid()) {
    let out = "";
    if (is_procedure) {
        out += `${name}: (${[name, ...arg_names.slice(0, -1), (arg_names.at(-1) ?? "") + (variadic ? "..." : "")].join(" ")})`;
    } else {
        out += `${name}: ${bound_to.toString()}`;
    }
    if (doc !== "") out += `\n${doc}`;
    return out;
}

class REPLCommandTable {
    command_ids = new Map<string, number>();
    commands = new Map<number, REPLCommand>();
    valid_ids = new Set<number>();
    private cur_id = 0;

    constructor(commands: REPLCommand[] = []) {
        for (const c of commands)
            this.register(c);
    }

    register(command: REPLCommand) {
        if (this.command_ids.has(command.dispatch))
            console.warn(`REPL command ${command.dispatch} already exists; overwriting.`);

        this.command_ids.set(command.dispatch, ++this.cur_id);
        this.commands.set(this.cur_id, command);
        this.valid_ids.add(this.cur_id);

        if (command.aliases) {
            for (const alias of command.aliases) {
                if (this.command_ids.has(alias))
                    console.warn(`REPL command ${alias} already exists; overwriting.`);

                this.command_ids.set(alias, this.cur_id);
            }
        }
    }

    // TODO: Currently, we cannot use strings like |this is a test| as a parameter.
    run(command: string, stdout: Output, lexer: Lexer, parser: Parser, evaluator: Evaluator, env: BracketEnvironment): void {
        if (command[0] !== ",")
            throw new Error("commands must start with ,");

        const [cmd_name, ...args] = command.trim().slice(1).split(" ");

        if (cmd_name.trim() === "")
            throw new Error("command not specified; use ,help for general help or ,cmds for a list of commands.");

        const cmd_id = this.command_ids.get(cmd_name);
        const cmd = this.commands.get(cmd_id ?? -1);
        if (!cmd || !cmd_id) {
            const candidates = this.nearestCommands(cmd_name, REPL_COMMAND_CORRECTION_MAX_DISTANCE);
            if (candidates.length === 0)
                throw new Error(`unknown command: ,${cmd_name}.`);
            else if (candidates.length === 1)
                throw new Error(`unknown command: ,${cmd_name}. Did you mean this?\n ,${candidates[0]}`);
            else
                throw new Error(`unknown command: ,${cmd_name}. Did you mean one of the following?\n ${candidates
                    .slice(0, -1)
                    .map(c => "," + c)
                    .join(" ")} or ,${candidates.at(-1)}`);
        }

        const result = cmd.fn(args, stdout, env, evaluator, parser, lexer, this);

        if (!cmd.manual_write) stdout.write("\n" + result);
    }

    private nearestCommands(cmd: string, max_distance: number): string[] {
        const candidates = [...this.command_ids.keys()]
            .map(word => ({ word, dist: editDistance(cmd, word) }));
        const min_distance = Math.min(...candidates.map(v => v.dist));
        if (min_distance > max_distance) return [];
        return candidates
            .filter(v => v.dist === min_distance)
            .map(v => v.word);
    }
}

const REPL_COMMANDS = new REPLCommandTable([
    {
        dispatch: "help",
        aliases: ["h", "?"],
        manual_write: true,
        arg_names: ["topic"],
        arg_optional: [true],
        doc: "Provides general help or help for a specific topic.",
        fn: (args, stdout) => {
            if (!args[0])
                stdout.write(HELP_TOPICS[DEFAULT_HELP_LABEL]);
            else if (!HELP_TOPICS[args[0]])
                stdout.write(`Help topic was not found: ${args[0]}\n\n` +
                    HELP_TOPICS[DEFAULT_HELP_LABEL]);
            else
                stdout.write(HELP_TOPICS[args[0]]);
        }
    },
    {
        dispatch: "exit",
        aliases: ["quit"],
        manual_write: true,
        doc: "Exits the REPL.",
        fn: () => {
            exit(0);
        }
    },
    {
        dispatch: "apropos",
        aliases: ["ap", "/"],
        doc: "Searches for bound identifiers containing a string.",
        arg_names: ["search-term"],
        fn: (args, _, env) => {
            const bindings = [
                ...env.bindings.keys(),
                ...env.builtins.keys()
            ].filter(s => s.match(args[0])).sort();

            if (bindings.length === 0)
                return "No matches found.";

            let out = "";
            let line_len = 0;
            for (let i = 0; i < bindings.length; i++) {
                let bind = bindings[i];
                if (bindings[i].split("").some(ch => Lexer.isIllegalIdentChar(ch)))
                    bind = `|${bind}|`;
                bind += (i !== bindings.length - 1 ? ", " : ".");

                line_len += bind.length;

                if (line_len > REPL_APROPOS_MAX_LINE_LENGTH) {
                    out += "\n";
                    line_len = 0;
                }

                out += bind;
            }

            return out;
        }
    },
    {
        dispatch: "doc",
        doc: "Reads the documentation, if any, for a bound identifier.",
        arg_names: ["ident"],
        fn: (args, _, env) => {
            if (args.length === 0) return `No identifier specified. Usage: ,doc <ident>`;

            const ident = args[0];
            let doc: string;
            let is_procedure: boolean;
            let arg_names: string[];
            let variadic: boolean;
            let bound_to = TokenVoid();

            if (ident === "") return `No identifier specified. Usage: ,doc <ident>`;

            const all_bindings = [
                ...env.bindings.keys(),
                ...env.builtins.keys(),
            ];

            if (env.bindings.has(ident)) {
                const bound = env.bindings.get(ident)!;
                if (!(bound instanceof ASTLiteralNode))
                    return `Identifier bound to non-literal/procedure node. Unable to get documentation.`;

                if (bound.tok.type === TokenType.PROCEDURE) {
                    doc = (bound.meta?.doc ?? "").toString();
                    variadic = false;
                    arg_names = (bound.tok.value as { params: string[] }).params;
                    is_procedure = true;
                } else {
                    doc = (bound.meta?.doc ?? "").toString();
                    variadic = false;
                    arg_names = [];
                    is_procedure = false;
                    bound_to = bound.tok;
                }
            } else if (env.builtins.has(ident)) {
                const builtin = env.builtins.get(ident)!;
                doc = builtin.doc ?? "";

                if (builtin?.constant) {
                    variadic = false;
                    arg_names = [];
                    is_procedure = false;
                    bound_to = builtin.value;
                } else if (builtin?.special) {
                    variadic = false;
                    arg_names = ["special_function"]; // TODO:
                    is_procedure = true;
                } else {
                    variadic = builtin.variadic ?? false;
                    arg_names = builtin.arg_names ?? (variadic
                        ? [...Array.from({ length: (builtin.min_args ?? 1) - 1 }, (_, i) => `arg${i}`), "args"]
                        : Array.from({ length: builtin.min_args ?? 0 }, (_, i) => `arg${i}`));
                    is_procedure = true;
                }
            } else {
                let cmds: string[] = [];

                const candidates = [...all_bindings]
                    .map(word => ({ word, dist: editDistance(ident, word) }));
                const min_distance = Math.min(...candidates.map(v => v.dist));
                if (min_distance <= REPL_COMMAND_CORRECTION_MAX_DISTANCE)
                    cmds = candidates.filter(v => v.dist === min_distance)
                        .map(v => v.word);

                if (candidates.length === 0) return `${ident} is undefined.`;
                if (candidates.length === 1) return `${ident} is undefined. Did you mean this?\n${cmds[0]}`;
                return `${ident} is undefined. Did you mean one of these?\n${cmds.join(" ")}`;
            }

            return generateDocumentation(ident, doc, is_procedure, arg_names, variadic, bound_to);
        }
    },
    {
        dispatch: "commands",
        aliases: ["cmds", ","],
        doc: "Lists commands and their usage.",
        fn: (_, _0, _1, _2, _3, _4, table) => {
            let out = "";

            for (const id of table.valid_ids) {
                const cmd = table.commands.get(id);
                if (!cmd) continue;

                const arg_names = cmd.arg_names ?? [];
                const arg_optional = cmd.arg_optional ?? [];

                out += `${cmd.dispatch}`
                for (let i = 0; i < arg_names.length; i++) {
                    if (arg_optional[i])
                        out += ` <[${arg_names![i]}]>`;
                    else
                        out += ` <${arg_names![i]}>`;
                }

                if (cmd.aliases) out += ` (${cmd.aliases.join(" ")})`;
                if (cmd.doc) out += `: ${cmd.doc}`;
                out += "\n";
            }

            return out;
        }
    },
    {
        dispatch: "env",
        doc: "Prints the full top-level Bracket environment",
        manual_write: true,
        fn: (_, _0, env) => {
            function prune(value: unknown, prune_terms = new Set(["builtins", "__builtins", "__stdout"]), seen = new WeakMap()): unknown {
                if (value && typeof value === "object") {
                    if (seen.has(value)) {
                        return seen.get(value);
                    }

                    let result: any;

                    if (Array.isArray(value)) {
                        result = [];
                        seen.set(value, result);
                        for (const item of value) {
                            result.push(prune(item, prune_terms, seen));
                        }
                    } else if (value instanceof Map) {
                        result = new Map();
                        seen.set(value, result);
                        for (const [k, v] of value.entries()) {
                            if (prune_terms.has(k)) continue;
                            result.set(k, prune(v, prune_terms, seen));
                        }
                    } else if (value instanceof Set) {
                        result = new Set();
                        seen.set(value, result);
                        for (const v of value) {
                            result.add(prune(v, prune_terms, seen));
                        }
                    } else {
                        result = {};
                        seen.set(value, result);
                        for (const [key, val] of Object.entries(value)) {
                            if (prune_terms.has(key)) continue;
                            result[key] = prune(val, prune_terms, seen);
                        }
                    }

                    return result;
                }

                return value;
            }

            const pruned = prune(env);
            STDOUT.write("\n");
            printDeep(pruned);
        }
    },
])

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

    process.on("SIGINT", exit);
    process.on("SIGUSR1", exit);
    process.on("SIGUSR2", exit);
    process.on("uncaughtException", err => {
        console.error(err);
        exit(1);
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
    const command_stdout = new Output({
        forward_to: repl_stdout,
        chunk_fn: (c) => {
            const lines = c.trimEnd().split("\n");
            if (lines[0].trim() === "")
                return "\n" + lines.slice(1).map(l => "; " + l).join("\n");
            else
                return lines.map(l => "; " + l).join("\n");
        }
    });
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
        STDOUT.write(env.stdout.buffer + (env.stdout.buffer === "" || env.stdout.buffer.at(-1) === "\n" ? "" : "\n"));
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

    function commitBuffer(): void {
        const input = buffer.join("\n");
        let final_result: Token = TokenVoid();

        if (input === "") {
            STDOUT.write("\n");
            render();
            return;
        }

        if (input[0] === ",") {
            try {
                REPL_COMMANDS.run(input, command_stdout, l, p, e, env);
                if (REPL_SAVE_COMMANDS_TO_HIST)
                    appendREPLHistory([input]);
            } catch (err) {
                env.stdout.write("\n" + ((err as any).message ?? String(err)));
                if (REPL_HIST_APPEND_ERRORS && REPL_SAVE_COMMANDS_TO_HIST)
                    appendREPLHistory([input]);
            } finally {
                env.stdout.write("\n");
                stdoutFlush();
            }
        } else {
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
        }

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
                exit(0);
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
