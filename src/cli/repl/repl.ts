import { Lexer } from "../../parser/lexer.js";
import { Parser } from "../../parser/parser.js";
import { Evaluator } from "../../runtime/evaluator.js";
import { Token, TokenError, TokenType, TokenVoid } from "../../parser/token.js";
import { ASTNode, ASTProgram, ASTSExprNode } from "../../parser/ast.js";
import { BracketEnvironment } from "../../runtime/env.js";
import { PartialExitCode, REPL_ENVIRONMENT_LABEL, REPL_HIST_APPEND_ERRORS, REPL_VERBOSITY, STDOUT, REPL_SAVE_COMMANDS_TO_HIST, FEAT_IO, FEAT_REPL, FEAT_SYS_EXEC } from "../../shared/globals.js";
import { BACKEND_BYTECODE, BACKEND_TREE_WALK, evaluate, EvaluationResult } from "./evaluator.js";
import { REPL_COMMANDS } from "./commands.js";
import { TerminalHistory } from "./history.js";
import { TerminalController } from "./terminal-controller.js";
import { Output } from "../io/output.js";
import { wrapLines } from "../../shared/utils/text/wrap.js";

export class REPL {
    private hist: TerminalHistory;
    private controller: TerminalController;

    constructor(
        use_hist: boolean = true,
        env?: BracketEnvironment,
        stdout?: Output,
    ) {
        this.hist = new TerminalHistory();
        this.controller = new TerminalController(STDOUT, this.hist, use_hist);

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

        this.controller.onBufferCommit((buf) => {
            let final_result: Token = TokenVoid();

            if (buf === "") {
                this.controller.stdout.write("\n");
                this.controller.render();
                return;
            }

            if (buf[0] === ",") {
                try {
                    REPL_COMMANDS.run(buf, this.controller.stdout, this.l, this.p, this.e, this.env, this);
                    if (REPL_SAVE_COMMANDS_TO_HIST)
                        this.hist.append([buf]);

                } catch (err) {
                    this.env.stdout.write("\n" + ((err as any).message ?? String(err)));
                    if (REPL_HIST_APPEND_ERRORS && REPL_SAVE_COMMANDS_TO_HIST)
                        this.hist.append([buf]);

                } finally {
                    this.env.stdout.write("\n");
                    this.stdoutFlush();
                }
            } else {
                const { result, code } = this.evaluate_expr(buf);

                switch (code) {
                    case PartialExitCode.SUCCESS:
                        final_result = result;
                        break;
                    case PartialExitCode.ERROR:
                        final_result = result;
                        break;
                    case PartialExitCode.INCOMPLETE:
                        this.controller.insertChar("\n");
                        this.controller.render();
                        return;
                }

                this.stdoutFlush();

                if (
                    final_result.type === TokenType.VOID ||
                    final_result.type === TokenType.EOF
                ) {
                    STDOUT.write("\n");
                }
            }

            this.hist.temp_hist_buffers.clear();
            this.hist.current_hist = -1;
            this.controller.buffer = [""];
            this.controller.cursor_line = 0;
            this.controller.cursor_col = 0;
            // this.controller.last_rendered = [];
            // this.controller.last_cursor_line = 0;

            this.controller.render();
        });
    }

    l: Lexer;
    p: Parser;
    e: Evaluator;

    env: BracketEnvironment;

    repl_stdout: Output;
    command_stdout: Output;

    REPLRunWithVerbosity(verbosity: number, callback: () => void): void {
        if (REPL_VERBOSITY < verbosity) return;
        callback();
    }

    stdoutFlush() {
        STDOUT.write(this.env.stdout.buffer + (this.env.stdout.buffer === "" || this.env.stdout.buffer.at(-1) === "\n" ? "" : "\n"));
        this.env.stdout.reset();
    }

    evaluate_expr(expr: string): { result: Token, code: PartialExitCode, ast: ASTNode | ASTProgram } {
        let result: EvaluationResult;

        try {
            result = evaluate(expr, this.env, this.l.ctx, BACKEND_BYTECODE);
            this.hist.append(expr.split("\n"));
        } catch (err) {
            result = {
                result: TokenError(`${this.env.label} ${((err as any).message ?? String(err))}`),
                code: PartialExitCode.ERROR,
                ast: new ASTSExprNode()
            };

            if (REPL_HIST_APPEND_ERRORS)
                this.hist.append(expr.split("\n"));
        }

        return result;
    }

    start() {
        this.hist.load();
        this.controller.start();
    }
}
