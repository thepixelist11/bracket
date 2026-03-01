import { BracketEnvironment } from "../runtime/env.js";
import { STDOUT } from "../shared/globals.js";
import { TokenError } from "../parser/token.js";
import fs from "fs";
import path from "path";
import { BACKEND_TREE_WALK, evaluate } from "./repl/evaluator.js";
import { Output } from "./io/output.js";

export function runFile(filepath: string, env?: BracketEnvironment, stdout?: Output) {
    if (!filepath)
        throw new Error("a valid filepath must be provided");

    const fp = path.resolve(filepath);
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile())
        throw new Error(`${fp} does not exist or is not a file`);

    const rel_fp = path.relative(".", fp);

    const env_stdout = stdout ?? env?.stdout ?? new Output();
    if (!env) env = new BracketEnvironment(rel_fp, { features: new Set(), file_directives: new Map() }, undefined, env_stdout);

    const contents = fs.readFileSync(fp, "utf8");

    try {
        evaluate(contents, env, env.ctx, BACKEND_TREE_WALK, false, true);
        STDOUT.write(env_stdout.buffer);
    } catch (err) {
        const err_tok = TokenError(`${env.label} ${((err as any).message ?? String(err))}`);
        STDOUT.write(err_tok.toString());
    }

    env_stdout.reset()
}
