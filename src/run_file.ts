import { BracketEnvironment } from "./env.js";
import { PartialExitCode, STDOUT } from "./globals.js";
import { Output, printDeep } from "./utils.js";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js"
import { Evaluator } from "./evaluator.js";
import { TokenError, TokenType } from "./token.js";
import fs from "fs";
import path from "path";
import { ASTProgram } from "./ast.js";

export function runFile(filepath: string, env?: BracketEnvironment) {
    if (!filepath)
        throw new Error("a valid filepath must be provided");

    const fp = path.resolve(filepath);
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile())
        throw new Error(`${fp} does not exist or is not a file`);

    const rel_fp = path.relative(".", fp);

    const env_stdout = new Output();
    if (!env) env = new BracketEnvironment(rel_fp, undefined, env_stdout);

    const contents = fs.readFileSync(fp, "utf8");

    const l = new Lexer();
    const p = new Parser();
    const e = new Evaluator();

    try {
        const { result: toks, code: lex_code } = l.lex(contents);
        if (lex_code !== PartialExitCode.SUCCESS)
            throw new Error(`lexer error${toks[0] && toks[0].type === TokenType.ERROR
                ? ": " + toks[0].literal
                : ""}`);

        const { result: ast, code: parse_code } = p.parse(toks, rel_fp);
        if (parse_code !== PartialExitCode.SUCCESS) throw new Error(`parser error`);

        if (!(ast instanceof ASTProgram))
            throw new Error(`unexpected ASTNode; expected a Program`);

        e.evaluateProgram(ast, env);

        STDOUT.write(env.stdout.buffer);
    } catch (err) {
        const err_tok = TokenError(`${env.label} ${((err as any).message ?? String(err))}`);
        STDOUT.write(err_tok.toString() + "\n");
    }

    env.stdout.reset()
}
