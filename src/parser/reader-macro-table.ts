import { InterpreterContext, PartialExitCode } from "../shared/globals.js";
import { Lexer } from "./lexer.js";
import { Token, TokenType } from "./token.js";

export type ReaderMacro = {
    dispatch: string;
    cursor: "prefix" | "manual";
    produces: TokenType;
    fn: (
        lexer: Lexer,
        start: { row: number, col: number },
        ctx: InterpreterContext,
    ) => { result: Token; code: PartialExitCode };
};

export class ReaderMacroTable {
    private macros = new Map<string, ReaderMacro>();
    private max_len = 0;

    constructor(macros: ReaderMacro[] = []) {
        for (const m of macros)
            this.register(m);
    }

    register(m: ReaderMacro) {
        this.macros.set(m.dispatch, m);
        this.max_len = Math.max(this.max_len, m.dispatch.length);
    }

    resolve(lexer: Lexer): ReaderMacro | undefined {
        for (let n = this.max_len; n > 0; n--) {
            const key = lexer.peekNextNChars(n + 1).slice(1);
            const macro = this.macros.get(key);
            if (macro) return macro;
        }

        return undefined;
    }
}

