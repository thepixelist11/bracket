import { ANFProgramToString } from "../../decompiler/anf/anf-to-string.js";
import { ASTToSourceCode } from "../../decompiler/ast/render.js";
import { binaryFileToString } from "../../decompiler/bytecode/binary-reader.js";
import { ANFCompiler, ANFProgram } from "../../ir/anf.js";
import { BCCompiler } from "../../ir/compiler/compiler.js";
import { ASTLiteralNode, ASTNode, ASTProgram, ASTSExprNode } from "../../parser/ast.js";
import { Lexer } from "../../parser/lexer.js";
import { Parser } from "../../parser/parser.js";
import { INTERN_TABLE, internSymbol, Token, TokenError, TokenType, TokenVoid } from "../../parser/token.js"
import { BracketEnvironment } from "../../runtime/env.js";
import { Evaluator } from "../../runtime/evaluator.js"
import { InterpreterContext, PartialExitCode } from "../../shared/globals.js";
import fs from "fs";
import { printDeep } from "../io/output.js";

type EvaluatorBackend = (ast: ASTProgram, env: BracketEnvironment, ctx: InterpreterContext, result: EvaluationResult, time: boolean, print_intermediates: boolean) => void;

export type EvaluationResult = {
    result: Token;
    code: PartialExitCode;
    ast: ASTProgram | ASTNode;
    time?: {
        lex: number;
        parse: number;
        eval?: number;
        total: number;
    }
}

export const BACKEND_TREE_WALK = (
    ast: ASTProgram,
    env: BracketEnvironment,
    ctx: InterpreterContext,
    result: EvaluationResult,
    time: boolean,
    print_intermediates = false,
) => {
    let eval_start_time = 0;
    let eval_end_time = 0;

    const e = new Evaluator(ctx.features, ctx.file_directives);

    if (time) {
        result.time ??= {
            lex: 0,
            parse: 0,
            total: 0,
        }
    }

    if (time) eval_start_time = performance.now();
    const value = e.evaluateProgram(ast, env, env.stdout, print_intermediates);
    if (time) eval_end_time = performance.now();

    const eval_time = eval_end_time - eval_start_time;

    if (result.time) {
        result.time.eval = eval_time;
        result.time.total += eval_time;
    }

    result.result = value;
}

export const BACKEND_BYTECODE = (
    ast: ASTProgram,
    env: BracketEnvironment,
    ctx: InterpreterContext,
    result: EvaluationResult,
) => {
    const expanded_ast = ast.forms.map(f => Evaluator.expand(f, env, ctx));
    const anf_forms = expanded_ast.map(f => ANFCompiler.compile(f, INTERN_TABLE));
    const anf_program = new ANFProgram(
        anf_forms.length === 1 ? anf_forms[0] : ANFCompiler.chainANFExprs(anf_forms),
        "test"
    );

    const compiler = new BCCompiler();
    const bytecode = compiler.compile(anf_program);

    fs.writeFileSync("out.bc", bytecode, "binary");

    console.log("\n" + binaryFileToString(bytecode));
    console.log("\n" + ANFProgramToString(anf_program));
    console.log("\n" + ASTToSourceCode(ast));

    printDeep(anf_program, 20);

    result.result = TokenVoid();
}

export function evaluate(
    expr: string,
    env: BracketEnvironment,
    ctx: InterpreterContext,
    backend: EvaluatorBackend = BACKEND_TREE_WALK,
    time = true,
    print_intermediates = false,

): EvaluationResult {
    let result: EvaluationResult = {
        result: TokenVoid(),
        code: PartialExitCode.ERROR,
        ast: new ASTSExprNode(),
    };

    const l = new Lexer();
    const p = new Parser();

    let lex_start_time: number = 0;
    let lex_end_time: number = 0;

    let parse_start_time: number = 0;
    let parse_end_time: number = 0;

    const before_count = env.stdout.write_count;

    end: do {
        try {
            internSymbol("add1");

            if (time) lex_start_time = performance.now();
            const { result: toks, code: lex_code } = l.lex(expr);
            if (time) lex_end_time = performance.now();

            if (lex_code !== PartialExitCode.SUCCESS) {
                result = {
                    result: toks.at(-1) ?? TokenError("lexer error"),
                    code: lex_code,
                    ast: new ASTSExprNode()
                };
                break end;
            }

            if (time) parse_start_time = performance.now();
            const { result: ast, code: parse_code } = p.parse(toks);
            if (time) parse_end_time = performance.now();

            if (parse_code !== PartialExitCode.SUCCESS) {
                result = {
                    result: ast instanceof ASTLiteralNode && ast.tok.type === TokenType.ERROR
                        ? ast.tok
                        : TokenError("parser error"),
                    code: parse_code,
                    ast
                }
                break end;
            }

            if (!(ast instanceof ASTProgram))
                throw new Error(`unexpected ASTNode; expected a program`);

            backend(ast, env, ctx, result, time, print_intermediates);

        } catch (err) {
            result = {
                result: TokenError(`${env.label} ${((err as any).message) ?? String(err)}`),
                code: PartialExitCode.ERROR,
                ast: new ASTSExprNode()
            }
        }
    } while (false);

    if (!print_intermediates) {
        let final_result: Token;

        switch (result.code) {
            case PartialExitCode.SUCCESS:
            case PartialExitCode.ERROR:
                final_result = result.result;
                break;
            case PartialExitCode.INCOMPLETE:
                final_result = TokenVoid();
                break;
        }

        const wrote_output = env.stdout.write_count !== before_count;

        if (wrote_output || (
            final_result &&
            final_result.type !== TokenType.VOID &&
            final_result.type !== TokenType.EOF)
        ) {
            env.stdout.write("\n");
        }

        if (
            final_result.type !== TokenType.VOID &&
            final_result.type !== TokenType.EOF
        ) {
            env.stdout.write(final_result.toString());
        }
    }

    if (time) {
        result.time ??= {
            lex: 0,
            parse: 0,
            total: 0,
        };

        const lex_time = lex_end_time - lex_start_time;
        const parse_time = parse_end_time - parse_start_time;

        const total_time = result.time.total + lex_time + parse_time;

        result.time!.lex = lex_time;
        result.time!.parse = parse_time;
        result.time!.total = total_time;
    }

    return result;
}
