import { PartialExitCode, LANG_NAME, VERSION_NUMBER, getDefaultReaderFeatures, InterpreterContext } from "../shared/globals.js";
import { READER_MACROS } from "./reader-macros.js";
import { Token, TokenEOF, TokenChar, TokenError, TokenNum, TokenStr, TokenIdent, TokenVoid, TokenType, TokenSym, TokenMetadata, TokenRParen, TokenLParen } from "./token.js";

export const enum ParenType {
    PAREN,
    BRACKET,
    BRACE
};

export const CHAR_TOK_MAP: Record<string, TokenType> = {
    "(": TokenType.LPAREN,
    "[": TokenType.LPAREN,
    "{": TokenType.LPAREN,

    ")": TokenType.RPAREN,
    "]": TokenType.RPAREN,
    "}": TokenType.RPAREN,
} as const;

export const PAREN_TYPE_MAP: Record<string, ParenType> = {
    "(": ParenType.PAREN,
    ")": ParenType.PAREN,

    "[": ParenType.BRACKET,
    "]": ParenType.BRACKET,

    "{": ParenType.BRACE,
    "}": ParenType.BRACE,
} as const;

export const LPAREN_TYPE_MAP: Record<ParenType, string> = {
    [ParenType.PAREN]: "(",
    [ParenType.BRACKET]: "[",
    [ParenType.BRACE]: "{",
} as const;

export const RPAREN_TYPE_MAP: Record<ParenType, string> = {
    [ParenType.PAREN]: ")",
    [ParenType.BRACKET]: "]",
    [ParenType.BRACE]: "}",
} as const;

export class Lexer {
    idx: number = 0;
    str: string = "";
    col: number = 0;
    row: number = 0;

    ctx: InterpreterContext = {
        file_directives: new Map(),
        features: new Set(),
    }

    constructor(features: string[] = []) {
        this.ctx.features = new Set([
            ...features,
            ...getDefaultReaderFeatures(LANG_NAME, VERSION_NUMBER)
        ]);
    }

    get cur() { return this.str[this.idx] ?? ""; }
    get peek() { return this.str[this.idx + 1] ?? ""; }

    private injected: Token[] = [];

    inject(tokens: Token[]) {
        this.injected.unshift(...tokens);
    }

    peekNextNChars(n: number) {
        let result = "";
        for (let i = 0; i < n; i++) {
            result += this.str[this.idx + i] ?? "";
        }
        return result;
    }

    lex(expr: string): { result: Token[], code: PartialExitCode } {
        this.idx = 0;
        this.str = expr;
        this.col = 0;
        this.row = 0;
        this.skipWhitespace();
        this.skipComment();

        let toks: Token[] = [];
        while (this.cur || this.injected.length > 0) {
            const { result, code } = this.readNextToken();
            if (code !== PartialExitCode.SUCCESS) return { result: [result], code };
            toks.push(result);
        }

        return { result: toks, code: PartialExitCode.SUCCESS };
    }

    readNextToken(): { result: Token, code: PartialExitCode } {
        if (this.injected.length > 0) {
            return {
                result: this.injected.shift()!,
                code: PartialExitCode.SUCCESS
            };
        }

        this.skipWhitespace();
        this.skipComment();

        if (!this.cur)
            return { result: TokenEOF({ row: this.row, col: this.col }), code: PartialExitCode.SUCCESS };

        let final_result: Token = TokenVoid({ row: this.row, col: this.col });

        if (CHAR_TOK_MAP[this.cur]) {
            if (Lexer.isLParen(this.cur)) {
                const result = TokenLParen(PAREN_TYPE_MAP[this.cur], { row: this.row, col: this.col });
                this.movePosition();
                final_result = result;
            } else {
                final_result = new Token(CHAR_TOK_MAP[this.cur]!, this.cur, { row: this.row, col: this.col }, {});
                this.movePosition();
            }

        } else if (this.cur === "#") {
            const meta: TokenMetadata = { row: this.row, col: this.col };

            const macro = READER_MACROS.resolve(this);
            if (!macro) {
                return {
                    result: TokenError("unknown reader macro", meta),
                    code: PartialExitCode.ERROR
                };
            }

            this.movePosition();

            if (macro.cursor === "prefix") {
                for (let i = 0; i < macro.dispatch.length; i++)
                    this.movePosition();
            }

            return macro.fn(this, meta, this.ctx);

        } else if (Lexer.isQuote(this.cur)) {
            const tok = this.readStringTok();

            if (tok.code !== PartialExitCode.SUCCESS) return tok;

            final_result = tok.result;

        } else if (this.cur === "'") {
            const tok = this.readSymbolTok();

            if (tok.code !== PartialExitCode.SUCCESS) return tok;

            final_result = tok.result;

        } else if (!Lexer.isWhitespace(this.cur)) {
            const tok =
                Lexer.isNumeric(this.cur) || Lexer.validNumericStartChar(this.cur)
                    ? this.readNumericTok()
                    : this.readIdentTok();

            if (tok.code !== PartialExitCode.SUCCESS) return tok;

            final_result = tok.result;

        } else {
            this.skipWhitespace();
            this.skipComment();
            return this.readNextToken();
        }

        return { result: final_result, code: PartialExitCode.SUCCESS };
    }

    movePosition(): void {
        if (this.cur === "\n") {
            this.row++;
            this.col = 0;
        } else {
            this.col++;
        }

        this.idx++;
    }

    skipWhitespace(): void {
        while (Lexer.isWhitespace(this.cur)) {
            this.movePosition();
        }
    }

    skipComment(): void {
        if (this.cur === ";") {
            // Type assertion due to irrelevant type mismatch warning
            while (this.cur && ((this.cur as string) !== "\n" || this.cur === ";")) {
                this.movePosition();
            }
        }
    }

    // TODO: Allow for exponent notation
    readNumericTok(): { result: Token, code: PartialExitCode } {
        let num = "";
        let dot_count = 0;
        const col = this.col;
        const row = this.row;

        this.skipComment();
        this.skipWhitespace();

        while (this.cur && Lexer.isNumeric(this.cur)) {
            num += this.cur;

            if (this.cur === ".") dot_count++;

            this.movePosition();
        }

        if (dot_count > 1 || Number.isNaN(parseFloat(num)))
            return { result: TokenIdent(num, { row, col }), code: PartialExitCode.SUCCESS };

        return { result: TokenNum(num, { row, col }), code: PartialExitCode.SUCCESS };
    }

    readListTokens(starting_paren?: string): { result: Token[], code: PartialExitCode } {
        const row = this.row;
        const col = this.col;

        let open = starting_paren ?? this.cur;
        if (!starting_paren) {
            if (!Lexer.isLParen(this.cur)) {
                return {
                    result: [TokenError("expected an opening parentheses", { row, col })],
                    code: PartialExitCode.ERROR
                };
            }
            this.movePosition();
        }

        const close = RPAREN_TYPE_MAP[PAREN_TYPE_MAP[open]];
        const tokens = [
            TokenLParen(ParenType.PAREN, { row, col })
        ];

        this.skipWhitespace();
        this.skipComment();

        while (this.cur && this.cur !== close) {
            const form = this.readForm();
            if (form.code !== PartialExitCode.SUCCESS) return form;

            tokens.push(...form.result);

            this.skipWhitespace();
            this.skipComment();
        }

        if (this.cur !== close) {
            return {
                result: [TokenError(`expected a closing ${close}`, { row, col })],
                code: PartialExitCode.INCOMPLETE
            };
        }

        tokens.push(TokenRParen(PAREN_TYPE_MAP[close], { row: this.row, col: this.col }));
        this.movePosition();

        return { result: tokens, code: PartialExitCode.SUCCESS };
    }

    readStringEscapeSeq(): { result: string, code: PartialExitCode } {
        function convertSeqToString(ch: string) {
            const code = ch.codePointAt(0)!;

            switch (code) {
                case 7: return "\a";
                case 8: return "\b";
                case 9: return "\t";
                case 10: return "\n";
                case 11: return "\v";
                case 12: return "\f";
                case 13: return "\r";
                case 27: return "\x1b";
            }

            if (!/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(ch)) {
                return ch;
            }

            const hex = code.toString(16).toUpperCase();
            const prefix = (code <= 0xFFFF ? "\\u" : "\\U");
            return prefix + hex.padStart(code <= 0xFFFF ? 4 : 8, "0");
        }

        // Any assertion to prevent overly specific type narrowing
        if ((this.cur as any) !== "\\") return { result: "", code: PartialExitCode.SUCCESS };
        this.movePosition();

        let seq = this.cur;

        if (/^[0-7]$/.test(this.cur)) {
            for (let i = 0; i < 2 && /^[0-7]$/.test(this.peek); i++) {
                this.movePosition();
                seq += this.cur;
            }

            this.movePosition();

            seq = String.fromCharCode(parseInt(seq, 8));
            seq = convertSeqToString(seq);
        } else if (this.cur === "x") {
            seq = "";
            for (let i = 0; i < 2 && /^[0-9a-fA-F]$/.test(this.peek); i++) {
                this.movePosition();
                seq += this.cur;
            }

            if (seq.length === 0) return { result: `Invalid escape sequence: \\x`, code: PartialExitCode.ERROR };

            this.movePosition();

            seq = String.fromCharCode(parseInt(seq, 16));
            seq = convertSeqToString(seq);
        } else if (this.cur === "u") {
            seq = "";
            for (let i = 0; i < 4 && /^[0-9a-fA-F]$/.test(this.peek); i++) {
                this.movePosition();
                seq += this.cur;
            }

            if (seq.length === 0) return { result: `Invalid escape sequence: \\u`, code: PartialExitCode.ERROR };

            this.movePosition();

            if (seq.length === 4 && /^\\u[0-9a-fA-F]{4}$/.test(this.peekNextNChars(6))) {
                const low = parseInt(this.peekNextNChars(6).substring(2), 16);
                const high = parseInt(seq, 16);

                if (0xD800 <= high && high <= 0xDBFF &&
                    0xDC00 <= low && low <= 0xDFFF) {
                    const code =
                        (high - 0xD800) * 0x400 +
                        (low - 0xDC00) +
                        0x10000;

                    seq = String.fromCodePoint(code);

                    for (let i = 0; i < 6; i++)
                        this.movePosition();
                } else {
                    seq = String.fromCharCode(parseInt(seq, 16));
                }
            } else {
                seq = String.fromCharCode(parseInt(seq, 16));
            }

            seq = convertSeqToString(seq);
        } else if (this.cur === "U") {
            seq = "";
            for (let i = 0; i < 8 && /^[0-9a-fA-F]$/.test(this.peek); i++) {
                this.movePosition();
                seq += this.cur;
            }

            if (seq.length === 0) return { result: `Invalid escape sequence: \\U`, code: PartialExitCode.ERROR };

            this.movePosition();

            seq = String.fromCodePoint(parseInt(seq, 16));
            seq = convertSeqToString(seq);
        } else if (this.cur === "\n") {
            seq = "";
        } else {
            switch (this.cur) {
                case "a": seq = "\a"; break;
                case "b": seq = "\b"; break;
                case "t": seq = "\t"; break;
                case "n": seq = "\n"; break;
                case "v": seq = "\v"; break;
                case "f": seq = "\f"; break;
                case "r": seq = "\r"; break;
                case "e": seq = "\x1b"; break;
                case "\"": seq = "\""; break;
                case "\'": seq = "'"; break;
                case "\\": seq = "\\"; break;
            }

            this.movePosition();
        }

        return { result: seq, code: PartialExitCode.SUCCESS };
    }

    readStringTok(): { result: Token, code: PartialExitCode } {
        let str = "";
        let quote = this.cur;
        const col = this.col;
        const row = this.row;
        this.movePosition();

        while (this.cur) {
            if (this.cur === quote) {
                this.movePosition();
                break;
            }

            if (this.cur === "\\") {
                const esc = this.readStringEscapeSeq();
                if (esc.code !== PartialExitCode.SUCCESS) return { result: TokenError(esc.result, { row, col }), code: esc.code };
                str += esc.result;
                continue;
            }

            if (!this.peek) {
                return {
                    result: TokenError(`Missing closing ${quote}`, { row, col }),
                    code: PartialExitCode.INCOMPLETE
                };
            }

            str += this.cur;

            this.movePosition();
        }

        return {
            result: TokenStr(str, { row, col }),
            code: PartialExitCode.SUCCESS
        };
    }

    readIdentTok(): { result: Token, code: PartialExitCode } {
        let lit = "";
        const col = this.col;
        const row = this.row;
        let quoted = false;

        this.skipComment();
        this.skipWhitespace();

        // TODO: Allow escaping |
        if (this.cur === "|") {
            quoted = true;
            this.movePosition();
        }

        if (
            !quoted &&
            (
                Lexer.isNumeric(this.cur) ||
                Lexer.isWhitespace(this.cur) ||
                Lexer.isQuote(this.cur) ||
                CHAR_TOK_MAP[this.cur]
            )
        ) {
            this.movePosition();
            return {
                result: TokenError("invalid identifier name", { row, col }),
                code: PartialExitCode.ERROR
            };
        }

        while (
            this.cur &&
            (quoted || (
                !Lexer.isWhitespace(this.cur) &&
                !Lexer.isQuote(this.cur) &&
                !CHAR_TOK_MAP[this.cur]
            ))
        ) {
            if (this.cur === "|") break;

            lit += this.cur;
            this.movePosition();
        }

        if (!quoted) {
            if (lit[0] === "#" && lit[1] !== "%") {
                return {
                    result: TokenError(`invalid identifier: ${lit}; an identifier may not start with # without a following %`, { row, col }),
                    code: PartialExitCode.ERROR
                };
            }

            if (lit === ".") {
                return {
                    result: TokenError(`invalid identifier: .; invalid use of .`, { row, col }),
                    code: PartialExitCode.ERROR
                };
            }

            if (lit === "") {
                return {
                    result: TokenError(`invalid identifier; empty identifiers are not allowed without |`, { row, col }),
                    code: PartialExitCode.ERROR
                };
            }
        }

        if (quoted) {
            if (this.cur !== "|") {
                return {
                    result: TokenError("expected closing |", { row, col }),
                    code: PartialExitCode.INCOMPLETE
                };
            }

            this.movePosition();
        }

        return { result: TokenIdent(lit, { row, col }), code: PartialExitCode.SUCCESS }
    }

    readSymbolTok(allow_no_starting_quote = false): { result: Token, code: PartialExitCode } {
        const col = this.col;
        const row = this.row;
        let result = TokenVoid({ row, col });

        if (!allow_no_starting_quote) {
            // Any assertion to prevent overly specific type narrowing.
            if ((this.cur as any) !== "'") {
                return {
                    result: TokenError("invalid symbol literal", { row, col }),
                    code: PartialExitCode.ERROR
                };
            }

            this.movePosition();
            this.skipWhitespace();
        }

        const next = this.readNextToken();

        if (next.code !== PartialExitCode.SUCCESS) return next;

        if (next.result.type === TokenType.IDENT) {
            result = TokenSym(next.result.literal, { row, col });
        } else if (next.result.type === TokenType.LPAREN) {
            result = TokenVoid();
            // const list = this.readListTok(next.result.literal);
            // if (list.code !== PartialExitCode.SUCCESS) return list;
            // result = list.result;
        } else {
            result = next.result;
        }

        return { result, code: PartialExitCode.SUCCESS };
    }

    readCharTok(): { result: Token, code: PartialExitCode } {
        function convertCharToString(ch: string) {
            const code = ch.codePointAt(0)!;

            switch (code) {
                case 0: return "nul";
                case 8: return "backspace";
                case 9: return "tab";
                case 10: return "newline";
                case 11: return "vtab";
                case 12: return "page";
                case 13: return "return";
                case 32: return "space";
                case 127: return "rubout";
            }

            if (!/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(ch)) {
                return ch;
            }

            const hex = code.toString(16).toUpperCase();
            const prefix = (code <= 0xFFFF ? "\\u" : "\\U");
            return prefix + hex.padStart(code <= 0xFFFF ? 4 : 8, "0");
        }

        const col = this.col;
        const row = this.row;

        let ch = "";

        do {
            ch += this.cur;
            this.movePosition();
        } while (
            this.cur &&
            !Lexer.isWhitespace(this.cur) &&
            !Lexer.isQuote(this.cur) &&
            !CHAR_TOK_MAP[this.cur]
        )

        switch (ch.toLowerCase()) {
            case "nul": ch = "nul"; break;
            case "null": ch = "nul"; break;
            case "backspace": ch = "backspace"; break;
            case "tab": ch = "tab"; break;
            case "newline": ch = "newline"; break;
            case "linefeed": ch = "newline"; break;
            case "vtab": ch = "vtab"; break;
            case "page": ch = "page"; break;
            case "return": ch = "return"; break;
            case "space": ch = "space"; break;
            case "rubout": ch = "rubout"; break;
            default: {
                if (/^[0-3][0-7]{2}$/.test(ch)) {
                    ch = convertCharToString(String.fromCharCode(parseInt(ch, 8)));
                } else if (ch[0] === "u" || ch[0] === "U") {
                    let hex = ch.substring(1);

                    if (!/^[0-9A-Fa-f]{1,8}$/.test(hex)) {
                        return {
                            result: TokenError(`Invalid unicode character literal: #\\${ch}`, { row, col }),
                            code: PartialExitCode.ERROR
                        };
                    }

                    let int = parseInt(hex, 16);

                    ch = convertCharToString(String.fromCodePoint(int));
                } else if (ch.length > 1) {
                    return {
                        result: TokenError(`Invalid character literal: #\\${ch}`, { row, col }),
                        code: PartialExitCode.ERROR
                    };
                }

                ch = convertCharToString(ch);
            }
        }

        return { result: TokenChar(`${ch}`, { row, col }), code: PartialExitCode.SUCCESS };
    }

    readForm(): { result: Token[]; code: PartialExitCode } {
        this.skipWhitespace();
        this.skipComment();

        const tok = this.readNextToken();
        if (tok.code !== PartialExitCode.SUCCESS)
            return { result: [tok.result], code: tok.code };

        if (tok.result.type === TokenType.LPAREN) {
            return this.readListTokens(tok.result.literal);
        }

        return { result: [tok.result], code: PartialExitCode.SUCCESS };
    }

    readStringToLineEnd(): { result: string; code: PartialExitCode } {
        let result = "";

        while (this.cur && this.cur !== "\n") {
            result += this.cur;
            this.movePosition();
        }

        return { result, code: PartialExitCode.SUCCESS };
    }

    makeMeta(row: number, col: number): TokenMetadata
    makeMeta(pos: { row: number, col: number }): TokenMetadata
    makeMeta(row: number | { row: number, col: number }, col?: number): TokenMetadata {
        if (typeof row === "object")
            return { row: row.row, col: row.col };
        else
            return { row, col: col ?? -1 };
    }

    static isWhitespace(ch: string): boolean { return /\s/.test(ch); }
    static isNumeric(ch: string): boolean { return /[\d+.-]/.test(ch); }
    static validNumericStartChar(ch: string): boolean { return /^[-+.]$/.test(ch); }
    static isQuote(ch: string): boolean { return /["]/.test(ch); }
    static isIllegalIdentChar(ch: string, quoted: boolean = false): boolean { return (quoted ? /[|]/ : /[()[\]{}",'`;|.\\\s]/).test(ch); }
    static isLParen(ch: string): boolean { return /[(\[{]/.test(ch); }
    static isRParen(ch: string): boolean { return /[)\]}]/.test(ch); }
};
