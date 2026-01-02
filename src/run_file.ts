import { BracketEnvironment } from "./env.js";
import { PartialExitCode, STDOUT } from "./globals.js";
import { Output } from "./utils.js";
import { Lexer } from "./lexer.js";
import { Parser } from "./parser.js"
import { Evaluator } from "./evaluator.js";
import { TokenType } from "./token.js";
import fs from "fs";
import path from "path";

export function runFile(filepath: string, env?: BracketEnvironment) {
    if (!filepath)
        throw new Error("a valid filepath must be provided");

    const fp = path.resolve(filepath);
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile())
        throw new Error(`${fp} does not exist or is not a file`);

    const env_stdout = new Output();
    if (!env) env = new BracketEnvironment(path.relative(fp, "."), undefined, env_stdout);

    const contents = fs.readFileSync(fp, "utf8");

    const l = new Lexer();
    const p = new Parser();
    const e = new Evaluator();

    const { result: toks, code: lex_code } = l.lex(contents);
    if (lex_code !== PartialExitCode.SUCCESS) throw new Error(`lexer error`); // FIXME: error handling

    const { result: ast, code: parse_code } = p.parse(toks);
    if (parse_code !== PartialExitCode.SUCCESS) throw new Error(`parser error`);

    const result = e.evaluate(ast, env);

    STDOUT.write(env.stdout.buffer);
    env.stdout.reset()

    if (result.type !== TokenType.EOF && result.type !== TokenType.VOID) {
        STDOUT.write(result.toString());
    }

    STDOUT.write("\n");
}
