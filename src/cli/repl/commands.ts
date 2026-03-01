import { ASTLiteralNode, ASTSExprNode } from "../../parser/ast.js";
import { Lexer } from "../../parser/lexer.js";
import { INTERN_TABLE, TokenError, TokenType, TokenVoid } from "../../parser/token.js";
import { DEFAULT_HELP_LABEL, HELP_TOPICS, PartialExitCode, REPL_COMMAND_CORRECTION_MAX_DISTANCE, STDOUT } from "../../shared/globals.js";
import { runFile } from "../run_file.js";
import { REPLCommandTable } from "./command-dispatcher.js";
import { BACKEND_TREE_WALK, evaluate, EvaluationResult } from "./evaluator.js";
import { ASTToSourceCode } from "../../decompiler/ast/render.js";
import { exit } from "../io/lifecycle.js";
import { editDistance } from "../../shared/utils/text/editDistance.js";
import { generateDocumentation } from "../formatting.js";
import { printDeep } from "../io/output.js";
import { prune } from "../../shared/utils/object/prune.js";
import path from "path";
import os from "os";
import fs from "fs";

export const REPL_COMMANDS = new REPLCommandTable([
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
            const { env, stdout } = ctx;
            const expr = args.join(" ");

            let result: EvaluationResult;

            try {
                result = evaluate(expr, env, env.ctx, BACKEND_TREE_WALK, true);
            } catch (err) {
                result = {
                    result: TokenError(`${env.label} ${((err as any).message ?? String(err))}`),
                    code: PartialExitCode.ERROR,
                    ast: new ASTSExprNode()
                };
            }

            const total_time = (result.time?.total ?? 0).toFixed(3);
            const lex_time = (result.time?.lex ?? 0).toFixed(3);
            const parse_time = (result.time?.parse ?? 0).toFixed(3);
            const eval_time = (result.time?.eval ?? 0).toFixed(3);

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

            return generateDocumentation(
                ident,
                doc,
                is_procedure,
                arg_names,
                variadic,
                bound_to,
                imported_by
            );
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
        fn: (_, ctx, repl_stdout) => {
            const { env } = ctx;

            const pruned = prune(env);
            repl_stdout.write("\n");
            printDeep(pruned);
        }
    },
], STDOUT);
