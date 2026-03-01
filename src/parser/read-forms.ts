import { PartialExitCode } from "../shared/globals.js";
import { Lexer } from "./lexer.js";
import { Token, TokenError, TokenMetadata, TokenType } from "./token.js";

function splitForms(tokens: Token[]): Token[][] {
    const forms: Token[][] = [];
    let depth = 0;
    let current: Token[] = [];

    for (const tok of tokens) {
        if (tok.type === TokenType.LPAREN) depth++;
        if (tok.type === TokenType.RPAREN) depth--;

        if (depth < 0) throw new Error("illegal form; found extraneous )");

        current.push(tok);

        if (depth === 0) {
            forms.push(current);
            current = [];
        }
    }

    return forms;
}

export function readFormList(
    lexer: Lexer,
    start: TokenMetadata,
    opts: { min: number, max?: number, error: string }
): { result: Token[][], code: PartialExitCode.SUCCESS } | { result: Token; code: Exclude<PartialExitCode, PartialExitCode.SUCCESS> } {
    const form = lexer.readForm();
    if (form.code !== PartialExitCode.SUCCESS)
        return { result: form.result[0], code: form.code };

    const toks = form.result;

    if (toks.length < 2 ||
        toks[0].type !== TokenType.LPAREN ||
        toks.at(-1)!.type !== TokenType.RPAREN
    ) {
        return {
            result: TokenError("expected a list of tokens", start),
            code: PartialExitCode.ERROR
        };
    }

    const inner = toks.slice(1, -1);
    const forms = splitForms(inner);

    if (
        forms.length < opts.min ||
        (opts.max !== undefined && forms.length > opts.max)
    ) {
        return {
            result: TokenError(opts.error, start),
            code: PartialExitCode.ERROR
        };
    }

    return { result: forms, code: PartialExitCode.SUCCESS };
}

export function readNForms(
    lexer: Lexer,
    n: number,
): { result: Token[][]; code: PartialExitCode.SUCCESS } | { result: Token; code: Exclude<PartialExitCode, PartialExitCode.SUCCESS> } {
    const forms: Token[][] = [];

    for (let i = 0; i < n; i++) {
        const form = lexer.readForm();
        if (form.code !== PartialExitCode.SUCCESS)
            return { result: form.result[0], code: form.code };

        forms.push(form.result);
    }

    return { result: forms, code: PartialExitCode.SUCCESS };
}

