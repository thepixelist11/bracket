import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js";
import { Evaluator } from "./evaluator.js";
import { Token, TokenError, TokenVoid, TokenType, INTERN_TABLE } from "./token.js";
import { ASTLiteralNode, ASTNode, ASTProgram, ASTSExprNode } from "./ast.js";
import { ASTToSourceCode, BCToString } from "./decompiler.js";
import { BracketEnvironment } from "./env.js";
import { PartialExitCode, REPL_ENVIRONMENT_LABEL, REPL_AUTOCOMPLETE, REPL_BANNER_ENABLED, REPL_HIST_APPEND_ERRORS, REPL_HISTORY_FILE, REPL_INPUT_HISTORY_SIZE, REPL_LOAD_COMMANDS_FROM_HIST, REPL_PROMPT, REPL_VERBOSITY, WELCOME_MESSAGE, STDOUT, REPL_SAVE_COMMANDS_TO_HIST, HELP_TOPICS, DEFAULT_HELP_LABEL, REPL_COMMAND_MAX_LINE_LENGTH, REPL_COMMAND_CORRECTION_MAX_DISTANCE, FEAT_IO, FEAT_REPL, FEAT_SYS_EXEC } from "./globals.js";
import { printDeep, Output, exit, editDistance, wrapLines, prune } from "./utils.js";
import { runFile } from "./run_file.js";
import fs from "fs";
import path from "path";
import os from "os";
import { ANFCompiler, ANFProgram } from "./anf.js";
import { BCCompiler } from "./compiler.js";

type REPLCommandFnContext = { stdout: Output, env: BracketEnvironment, evaluator: Evaluator, parser: Parser, lexer: Lexer, table: REPLCommandTable, repl: REPL };
type REPLCommand =
    ({
        manual_write: true;
        fn: (args: string[], ctx: REPLCommandFnContext) => void
    } | {
        manual_write?: false;
        fn: (args: string[], ctx: REPLCommandFnContext) => string
    }) & {
        dispatch: string;
        manual_write?: boolean;
        doc?: string;
        arg_names?: string[];
        arg_optional?: boolean[];
        aliases?: string[];
    };

function generateDocumentation(name: string, doc: string = "", is_procedure: boolean = false, arg_names: string[] = [], variadic: boolean = false, bound_to: Token = TokenVoid(), imported_by: string) {
    let out = "";
    if (is_procedure) {
        if (arg_names.length === 0 && variadic === false)
            out += `${name}: (${name})`;
        else
            out += `${name}: (${[name, ...arg_names.slice(0, -1), (arg_names.at(-1) ?? "") + (variadic ? "..." : "")].join(" ")})`;
    } else {
        out += `${name}: ${bound_to.toString()}`;
    }
    if (doc !== "") out += `\n${doc}`;
    if (imported_by !== "") out += `\n\nImported by: ${imported_by}`;
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
            STDOUT.warn(`REPL command ${command.dispatch} already exists; overwriting.`);

        this.command_ids.set(command.dispatch, ++this.cur_id);
        this.commands.set(this.cur_id, command);
        this.valid_ids.add(this.cur_id);

        if (command.aliases) {
            for (const alias of command.aliases) {
                if (this.command_ids.has(alias))
                    STDOUT.warn(`REPL command ${alias} already exists; overwriting.`);

                this.command_ids.set(alias, this.cur_id);
            }
        }
    }

    // TODO: Currently, we cannot use strings like |this is a test| as a parameter.
    run(command: string, stdout: Output, lexer: Lexer, parser: Parser, evaluator: Evaluator, env: BracketEnvironment, repl: REPL): void {
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

        const result = cmd.fn(args, { stdout, env, evaluator, parser, lexer, repl, table: this });

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
        fn: (args, ctx) => {
            const { stdout } = ctx;

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
        dispatch: "clear",
        manual_write: true,
        doc: "Clears the REPL terminal.",
        fn: () => {
            STDOUT.write("\x1bc");
        }
    },
    {
        dispatch: "load",
        aliases: ["require", "import"],
        manual_write: true,
        arg_names: ["filepath"],
        doc: "Loads a Bracket file, importing all bindings into the current environment.",
        fn: (args, ctx) => {
            const { env, stdout } = ctx;

            runFile(args[0], env, stdout);
        }
    },
    {
        dispatch: "pwd",
        doc: "Displays the current working directory.",
        fn: () => {
            return process.cwd();
        }
    },
    {
        dispatch: "cd",
        aliases: ["chdir"],
        doc: "Changes the current working directory.",
        manual_write: true,
        arg_names: ["dir"],
        fn: (args) => {
            let pth = (args[0] ?? "").trim();

            if (pth.startsWith("~")) {
                pth = os.homedir() + pth.slice(1);
            }

            if (!fs.existsSync(pth))
                throw new Error(`${pth} does not exist.`);

            if (!fs.statSync(pth).isDirectory())
                throw new Error(`${pth} is not a directory.`);

            process.chdir(pth);
        }
    },
    {
        dispatch: "ls",
        doc: "Lists files and directories in the specified directory. If no directory is specified, the contents of the current working directory will be listed.",
        arg_names: ["dir"],
        arg_optional: [true],
        fn: (args) => {
            let out = "";
            const dir_path = path.resolve(args[0] ?? ".");

            if (!fs.existsSync(dir_path))
                throw new Error(`${dir_path} does not exist.`);

            if (!fs.statSync(dir_path).isDirectory())
                throw new Error(`${dir_path} is not a directory.`);

            const paths = fs.readdirSync(dir_path).map(p => path.resolve(dir_path, p));

            const files = [];
            const dirs = [];

            for (const pth of paths) {
                if (fs.statSync(pth).isDirectory())
                    dirs.push(`${path.basename(pth)}/`);
                else
                    files.push(`${path.basename(pth)}`);
            }

            for (const p of [...dirs.sort(), ...files.sort()])
                out += p + "\n";

            return out;
        }
    },
    {
        dispatch: "cat",
        doc: "Outputs the contents of the specified file.",
        arg_names: ["path"],
        fn: (args) => {
            if (!args[0])
                throw new Error(`No file specified.`);

            const file_path = path.resolve(args[0]);

            if (!fs.existsSync(file_path))
                return `file ${file_path} does not exist.`;

            if (!fs.statSync(file_path).isFile())
                return `${file_path} is not a file.`;

            return fs.readFileSync(file_path, "utf8");
        }
    },
    {
        dispatch: "source",
        aliases: ["so", "inspect"],
        arg_names: ["ident"],
        doc: "Outputs the post-macro-expansion source code of the object bound to an identifier. This will attempt to resolve expanded macros to the original source if possible.",
        fn: (args, ctx) => {
            const { env } = ctx;

            if (args.length === 0) return `No identifier specified. Usage: ,source <ident>`;

            const ident = args[0];

            if (ident === "") return `No identifier specified. Usage: ,source <ident>`;

            if (INTERN_TABLE.has(ident) && env.bindings.has(INTERN_TABLE.get(ident)!.id)) {
                const bound = env.bindings.get(INTERN_TABLE.get(ident)!.id)!;

                return ASTToSourceCode(bound);
            } else if (env.builtins.has(ident)) {
                return `${ident}: bound to builtin.`

            } else {
                let cmds: string[] = [];

                const candidates = [...INTERN_TABLE.keys()]
                    .map(word => ({ word, dist: editDistance(ident, word) }));
                const min_distance = Math.min(...candidates.map(v => v.dist));
                if (min_distance <= REPL_COMMAND_CORRECTION_MAX_DISTANCE)
                    cmds = candidates.filter(v => v.dist === min_distance)
                        .map(v => v.word);

                if (candidates.length === 0) return `${ident} is undefined.`;
                if (candidates.length === 1) return `${ident} is undefined. Did you mean this?\n${cmds[0]}`;
                return `${ident} is undefined. Did you mean one of these?\n${cmds.join(" ")}`;
            }
        }
    },
    {
        dispatch: "time",
        manual_write: true,
        arg_names: ["expr"],
        doc: "Runs an expression and logs the total time taken for it to run.",
        fn: (args, ctx) => {
            const { repl, env, stdout } = ctx;
            const expr = args.join(" ");

            let ret: { result: Token, code: PartialExitCode, ast: ASTNode | ASTProgram };

            let lex_start_time: number = 0;
            let parse_start_time: number = 0;
            let eval_start_time: number = 0;

            let lex_end_time: number = -1;
            let parse_end_time: number = -1;
            let eval_end_time: number = -1;

            const before_count = env.stdout.write_count;

            end: do {
                try {
                    lex_start_time = performance.now();
                    const { result: toks, code: lex_code } = repl.l.lex(expr);
                    lex_end_time = performance.now();

                    if (lex_code !== PartialExitCode.SUCCESS) {
                        ret = {
                            result: toks.at(-1) ?? TokenError("lexer error"),
                            code: lex_code,
                            ast: new ASTSExprNode()
                        };
                        break end;
                    }

                    parse_start_time = performance.now();
                    const { result: ast, code: parse_code } = repl.p.parse(toks);
                    parse_end_time = performance.now();

                    if (parse_code !== PartialExitCode.SUCCESS) {
                        ret = {
                            result:
                                ast instanceof ASTLiteralNode && ast.tok.type === TokenType.ERROR
                                    ? ast.tok
                                    : TokenError("parser error"),
                            code: parse_code,
                            ast
                        };
                        break end;
                    }

                    if (!(ast instanceof ASTProgram))
                        throw new Error(`unexpected ASTNode; expected a Program`);

                    eval_start_time = performance.now();
                    const value = repl.e.evaluateProgram(ast, env, env.stdout, false);
                    eval_end_time = performance.now();

                    ret = { result: value, code: PartialExitCode.SUCCESS, ast };
                } catch (err) {
                    ret = {
                        result: TokenError(`${env.label} ${((err as any).message ?? String(err))}`),
                        code: PartialExitCode.ERROR,
                        ast: new ASTSExprNode()
                    };
                }
            } while (false);

            let final_result: Token;

            switch (ret.code) {
                case PartialExitCode.SUCCESS:
                case PartialExitCode.ERROR:
                    final_result = ret.result;
                    break;
                case PartialExitCode.INCOMPLETE:
                    final_result = TokenVoid();
                    break;
            }


            const wrote_output = env.stdout.write_count !== before_count;

            if (wrote_output || (final_result && final_result.type !== TokenType.VOID && final_result.type !== TokenType.EOF))
                env.stdout.write("\n");

            if (final_result.type !== TokenType.EOF && final_result.type !== TokenType.VOID) {
                env.stdout.write(final_result.toString());
            }

            const lex_time = (lex_end_time - lex_start_time).toFixed(3);
            const parse_time = (parse_end_time - parse_start_time).toFixed(3);
            const eval_time = (eval_end_time - eval_start_time).toFixed(3);

            const total_time = (
                (lex_end_time - lex_start_time) +
                (parse_end_time - parse_start_time) +
                (eval_end_time - eval_start_time)
            ).toFixed(3);

            stdout.write(`TOTAL: ${total_time} ms = LEXER: ${lex_time} ms + PARSE: ${parse_time} ms + EVAL: ${eval_time} ms`);
        }
    },
    {
        dispatch: "features",
        aliases: ["feat"],
        doc: "Lists all currently enabled features.",
        fn: (_, ctx) => {
            const { lexer } = ctx;

            const feats = Array.from(lexer.ctx.features.values());
            let out = "Features Enabled:\n";

            if (feats.length === 0) out += " None.";

            for (let i = 0; i < feats.length; i++) {
                if (feats[i].split("").some(ch => Lexer.isWhitespace(ch)))
                    out += ` |${feats[i]}|`;
                else
                    out += ` ${feats[i]}`;
            }

            return out;
        }
    },
    {
        dispatch: "interned",
        doc: "Prints the current intern table",
        fn: () => {
            let out = "";

            for (const [name, sym] of INTERN_TABLE) {
                out += `${name.padEnd(20, " ")} : ${sym.id}\n`
            }

            return out;
        }
    },
    {
        dispatch: "apropos",
        aliases: ["ap", "/"],
        doc: "Searches for bound identifiers containing a string.",
        arg_names: ["search-term"],
        fn: (args, ctx) => {
            const { env } = ctx;

            const bindings = [
                ...INTERN_TABLE.keys(),
                ...env.builtins.keys()
            ].filter(s => s.match(args[0])).sort();

            if (bindings.length === 0)
                return "No matches found.";

            let out = "";
            let line_len = 0;
            for (let i = 0; i < bindings.length; i++) {
                let bind = bindings[i];
                if (bindings[i].split("").some(ch => Lexer.isWhitespace(ch)))
                    bind = `|${bind}|`;
                bind += (i !== bindings.length - 1 ? ", " : ".");

                line_len += bind.length;

                out += bind;
            }

            return out;
        }
    },
    {
        dispatch: "doc",
        doc: "Reads the documentation, if any, for a bound identifier.",
        arg_names: ["ident"],
        fn: (args, ctx) => {
            const { env } = ctx;

            if (args.length === 0) return `No identifier specified. Usage: ,doc <ident>`;

            const ident = args[0];
            let doc: string;
            let is_procedure: boolean;
            let arg_names: string[];
            let variadic: boolean;
            let bound_to = TokenVoid();
            let imported_by = "";

            if (ident === "") return `No identifier specified. Usage: ,doc <ident>`;

            const all_bindings = [
                ...INTERN_TABLE.keys(),
                ...env.builtins.keys(),
            ];

            if (INTERN_TABLE.has(ident) && env.bindings.has(INTERN_TABLE.get(ident)!.id)) {
                const bound = env.bindings.get(INTERN_TABLE.get(ident)!.id)!;
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

                imported_by = env.builtins.associations.get(ident) ?? "";

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

            return generateDocumentation(ident, doc, is_procedure, arg_names, variadic, bound_to, imported_by);
        }
    },
    {
        dispatch: "commands", // TODO: Allow for mid-entry tabulation to differentiate entries spanning multiple lines
        aliases: ["cmds", ","],
        doc: "Lists commands and their usage.",
        fn: (_, ctx) => {
            const { table } = ctx;

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
        fn: (_, ctx) => {
            const { env } = ctx;

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
    CBS = "\u001c",
};

export class REPL {
    constructor(
        public use_hist: boolean = true,
        env?: BracketEnvironment,
        stdout?: Output,
    ) {
        this.hist = this.use_hist ? this.loadREPLHistory() : [];
        this.l = new Lexer([FEAT_REPL, FEAT_IO, FEAT_SYS_EXEC]);
        this.p = new Parser(this.l.ctx.features, this.l.ctx.file_directives);
        this.e = new Evaluator(this.l.ctx.features, this.l.ctx.file_directives);
        this.repl_stdout = stdout ?? new Output();

        if (env)
            this.env = env;
        else
            this.env = new BracketEnvironment(REPL_ENVIRONMENT_LABEL, this.l.ctx, undefined, this.repl_stdout);

        this.command_stdout = new Output({
            forward_to: this.repl_stdout,
            chunk_fn: (c) => {
                const lines = (wrapLines(c.trimEnd())).split("\n");
                if (lines[0].trim() === "")
                    return "\n" + lines.slice(1).map(l => "; " + l).join("\n");
                else
                    return lines.map(l => "; " + l).join("\n");
            }
        });
    }

    start() {
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        else throw new Error("This REPL requires a TTY.");

        process.stdin.setEncoding("utf8");
        process.stdin.resume();

        process.on("SIGINT", exit);
        process.on("SIGUSR1", exit);
        process.on("SIGUSR2", exit);
        process.on("uncaughtException", err => {
            STDOUT.error(err);
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
                    this.temp_hist_buffers.set(-1, [""]);
                    this.current_hist = -1;
                    this.buffer = this.getHistEntry(-1);
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
                const autocomplete = this.getAutocomplete();
                const start_pos = Math.max(0, this.cursor_col - autocomplete.write_count);
                this.buffer[this.cursor_line] =
                    this.buffer[this.cursor_line].slice(0, start_pos) +
                    autocomplete.full +
                    this.buffer[this.cursor_line].slice(start_pos + autocomplete.write_count);

                this.cursor_col = this.buffer.length;
                this.render();
                return;
            }

            if (key_str === KeyPress.UP) {
                if (!this.use_hist) return;

                if (this.current_hist >= this.hist.length) return;
                this.buffer = this.getHistEntry(++this.current_hist);

                this.cursor_line = this.buffer.length - 1;
                this.cursor_col = this.buffer[this.cursor_line].length;

                this.render();
                return;
            }

            if (key_str === KeyPress.DOWN) {
                if (!this.use_hist) return;

                if (this.current_hist < 0) return;
                this.current_hist--;

                if (this.current_hist === -1) {
                    this.buffer = this.temp_hist_buffers.get(-1) ?? [""];
                } else {
                    this.buffer = this.getHistEntry(this.current_hist);
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
            STDOUT.write(`${WELCOME_MESSAGE}\n`);

        this.render();
    }

    buffer: string[] = [""];
    cursor_line = 0;
    cursor_col = 0;
    current_hist = -1;
    last_rendered: string[] = [];
    last_rendered_lines = 0;
    last_cursor_line = 0;

    hist: string[][];

    temp_hist_buffers = new Map<number, string[]>();

    l: Lexer;
    p: Parser;
    e: Evaluator;

    env: BracketEnvironment;

    repl_stdout: Output;
    command_stdout: Output;

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

        this.temp_hist_buffers.set(this.current_hist, this.buffer);
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

    loadREPLHistory(): string[][] {
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

    appendREPLHistory(current_buffer: string[]): void {
        // FIXME: Check array equality for buffers
        if (this.hist.at(0) === current_buffer) return;
        const escaped = current_buffer.map(line => line.replaceAll("::", "::::"));

        fs.appendFileSync(REPL_HISTORY_FILE, escaped + "::\n");
        this.hist.unshift(current_buffer);
    }

    getHistEntry(idx: number): string[] {
        if (this.temp_hist_buffers.has(idx))
            return this.temp_hist_buffers.get(idx)!;

        return idx >= this.hist.length ? [""] : this.hist[idx];
    }

    REPLRunWithVerbosity(verbosity: number, callback: () => void): void {
        if (REPL_VERBOSITY < verbosity) return;
        callback();
    }

    stdoutFlush() {
        STDOUT.write(this.env.stdout.buffer + (this.env.stdout.buffer === "" || this.env.stdout.buffer.at(-1) === "\n" ? "" : "\n"));
        this.env.stdout.reset();
    }

    evaluate(expr: string): { result: Token, code: PartialExitCode, ast: ASTNode | ASTProgram } {
        let ret: { result: Token, code: PartialExitCode, ast: ASTNode | ASTProgram };

        try {
            const { result: toks, code: lex_code } = this.l.lex(expr);
            if (lex_code !== PartialExitCode.SUCCESS) {
                ret = {
                    result: toks.at(-1) ?? TokenError("lexer error"),
                    code: lex_code,
                    ast: new ASTSExprNode()
                };
                return ret;
            }

            const { result: ast, code: parse_code } = this.p.parse(toks);
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

            const expanded_ast = ast.forms.map(f => Evaluator.expand(f, this.env, this.l.ctx));

            const anf_forms = expanded_ast.map(f => ANFCompiler.makeANFExpr(f));
            const anf_program = new ANFProgram(
                anf_forms.length === 1 ? anf_forms[0] : ANFCompiler.chainANFExprs(anf_forms),
                "test"
            );

            const compiler = new BCCompiler();
            const bytecode = compiler.compile(anf_program);
            console.log("\n" + BCToString(bytecode));

            // const value = this.e.evaluateProgram(ast, this.env, this.env.stdout, false);

            this.appendREPLHistory(expr.split("\n"));

            ret = { result: TokenVoid(), code: PartialExitCode.SUCCESS, ast };
            // ret = { result: value, code: PartialExitCode.SUCCESS, ast };
        } catch (err) {
            ret = {
                result: TokenError(`${this.env.label} ${((err as any).message ?? String(err))}`),
                code: PartialExitCode.ERROR,
                ast: new ASTSExprNode()
            };

            if (REPL_HIST_APPEND_ERRORS)
                this.appendREPLHistory(expr.split("\n"));
            return ret;
        }

        return ret;
    }

    commitBuffer(): void {
        const input = this.buffer.join("\n");
        let final_result: Token = TokenVoid();

        if (input === "") {
            STDOUT.write("\n");
            this.render();
            return;
        }

        if (input[0] === ",") {
            try {
                REPL_COMMANDS.run(input, this.command_stdout, this.l, this.p, this.e, this.env, this);
                if (REPL_SAVE_COMMANDS_TO_HIST)
                    this.appendREPLHistory([input]);
            } catch (err) {
                this.env.stdout.write("\n" + ((err as any).message ?? String(err)));
                if (REPL_HIST_APPEND_ERRORS && REPL_SAVE_COMMANDS_TO_HIST)
                    this.appendREPLHistory([input]);
            } finally {
                this.env.stdout.write("\n");
                this.stdoutFlush();
            }
        } else {
            const before_count = this.env.stdout.write_count;

            const { result, code, ast } = this.evaluate(input);

            switch (code) {
                case PartialExitCode.SUCCESS:
                    final_result = result;
                    break;
                case PartialExitCode.ERROR:
                    final_result = result;
                    break;
                case PartialExitCode.INCOMPLETE:
                    this.insertChar("\n");
                    this.render();
                    return;
            }

            STDOUT.write("\n");

            this.stdoutFlush();

            this.REPLRunWithVerbosity(2, () => {
                printDeep(prune(ast));
            });

            this.REPLRunWithVerbosity(1, () => {
                printDeep(final_result);
            });

            if (final_result.type !== TokenType.EOF && final_result.type !== TokenType.VOID) {
                STDOUT.write(final_result.toString());
            }

            const wrote_output = this.env.stdout.write_count !== before_count;

            if (wrote_output || (final_result && final_result.type !== TokenType.VOID && final_result.type !== TokenType.EOF))
                STDOUT.write("\n");
        }

        this.buffer = [""];
        this.temp_hist_buffers.clear();
        this.current_hist = -1;
        this.cursor_line = 0;
        this.cursor_col = 0;
        // this.last_rendered = [];
        // this.last_cursor_line = 0;

        this.render();
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

        this.temp_hist_buffers.set(this.current_hist, this.buffer);
    }

    // TODO: Split current input, only check current ident and only at cursor position
    getAutocomplete() {
        const keys = [...INTERN_TABLE.keys(), ...this.env.builtins.keys()];
        const full = keys.find(v => v.startsWith(this.buffer[this.cursor_line].substring(0, this.cursor_col))) ?? "";
        const suffix = full?.substring(this.cursor_col);

        return { full, suffix, write_count: full.length - suffix.length };
    }

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

    render(): void {
        STDOUT.write("\r\u001b[2K");
        STDOUT.write(REPL_PROMPT + this.buffer[0]);
        STDOUT.write(`\r\u001b[${REPL_PROMPT.length + this.cursor_col}C`);
    }

    clear(): void {
        STDOUT.write("\r\u001b[2J\u001b[H");
        this.last_rendered = [];
        this.last_cursor_line = 0;
    }

}
