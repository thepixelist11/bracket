import { Lexer } from "../../parser/lexer.js";
import { Parser } from "../../parser/parser.js";
import { BracketEnvironment } from "../../runtime/env.js";
import { Evaluator } from "../../runtime/evaluator.js";
import { REPL_COMMAND_CORRECTION_MAX_DISTANCE } from "../../shared/globals.js";
import { editDistance } from "../../shared/utils/text/editDistance.js";
import { Output } from "../io/output.js";
import { REPL } from "./repl.js";

export type REPLCommandFnContext = { stdout: Output, env: BracketEnvironment, evaluator: Evaluator, parser: Parser, lexer: Lexer, table: REPLCommandTable, repl: REPL };
export type REPLCommand =
    ({
        manual_write: true;
        fn: (args: string[], ctx: REPLCommandFnContext, repl_stdout: Output) => void
    } | {
        manual_write?: false;
        fn: (args: string[], ctx: REPLCommandFnContext, repl_stdout: Output) => string
    }) & {
        dispatch: string;
        manual_write?: boolean;
        doc?: string;
        arg_names?: string[];
        arg_optional?: boolean[];
        aliases?: string[];
    };

export class REPLCommandTable {
    command_ids = new Map<string, number>();
    commands = new Map<number, REPLCommand>();
    valid_ids = new Set<number>();
    private cur_id = 0;

    constructor(commands: REPLCommand[] = [], private stdout: Output) {
        for (const c of commands)
            this.register(c);
    }

    register(command: REPLCommand) {
        if (this.command_ids.has(command.dispatch))
            this.stdout.warn(`REPL command ${command.dispatch} already exists; overwriting.`);

        this.command_ids.set(command.dispatch, ++this.cur_id);
        this.commands.set(this.cur_id, command);
        this.valid_ids.add(this.cur_id);

        if (command.aliases) {
            for (const alias of command.aliases) {
                if (this.command_ids.has(alias))
                    this.stdout.warn(`REPL command ${alias} already exists; overwriting.`);

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

        const result = cmd.fn(args, { stdout, env, evaluator, parser, lexer, repl, table: this }, this.stdout);

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

