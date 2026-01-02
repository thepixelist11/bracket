import { CHAR_TOK_MAP, PartialExitCode, ErrorTokenLiteral, BOOL_FALSE, BOOL_TRUE } from "./globals.js";
import { Token, TokenEOF, TokenChar, TokenType, TokenError, TokenSym, TokenNum, TokenStr, TokenIdent } from "./token.js";

export class Lexer {
    private idx: number = 0;
    private str: string = "";
    private col: number = 0;
    private row: number = 0;

    private get cur() { return this.str[this.idx] ?? ""; }
    private get peek() { return this.str[this.idx + 1] ?? ""; }

    private peekNextNChars(n: number) {
        let result = "";
        for (let i = 0; i < n; i++) {
            result += this.str[this.idx + i] ?? "";
        }
        return result;
    }

    public lex(expr: string): { result: Token[], code: PartialExitCode } {
        this.idx = 0;
        this.str = expr;
        this.col = 0;
        this.row = 0;
        this.skipWhitespace();
        this.skipComment();

        let toks: Token[] = [];
        while (this.cur) {
            if (CHAR_TOK_MAP[this.cur]) {
                toks.push(new Token(CHAR_TOK_MAP[this.cur]!, this.cur, this.row, this.col));
                this.movePosition();
            } else if (Lexer.isQuote(this.cur)) {
                const { result, code } = this.readStringTok();

                if (code !== PartialExitCode.SUCCESS) return { code, result: toks };

                toks.push(result);
            } else if (this.cur === "'") {
                const { result, code } = this.readSymbolTok();

                if (code !== PartialExitCode.SUCCESS) return { code, result: toks };

                toks.push(result);
            } else if (/\#\\./.test(this.peekNextNChars(3))) {
                const { result, code } = this.readCharTok();

                if (code !== PartialExitCode.SUCCESS) return { code, result: toks };

                toks.push(result);
            } else if (!Lexer.isWhitespace(this.cur)) {
                const { result, code } =
                    Lexer.isNumeric(this.cur) || this.cur === "-"
                        ? this.readNumericTok()
                        : this.readIdentTok();

                if (code !== PartialExitCode.SUCCESS) return { code, result: toks };

                toks.push(result);
            }

            this.skipWhitespace();
            this.skipComment();
        }

        toks.push(TokenEOF(this.row, this.col));

        return { result: toks, code: PartialExitCode.SUCCESS };
    }

    private movePosition(): void {
        if (this.cur === "\n") {
            this.row++;
            this.col = 0;
        } else {
            this.col++;
        }

        this.idx++;
    }

    private skipWhitespace(): void {
        while (Lexer.isWhitespace(this.cur)) {
            this.movePosition();
        }
    }

    private skipComment(): void {
        if (this.cur === ";") {
            // Type assertion due to irrelevant type mismatch warning
            while (this.cur && ((this.cur as string) !== "\n" || this.cur === ";")) {
                this.movePosition();
            }
        }
    }

    private readNumericTok(): { result: Token, code: PartialExitCode } {
        let num = "";
        let previous_dot = false;
        const col = this.col;
        const row = this.row;

        if (this.cur === "-") {
            if (this.peek === ".") {
                this.movePosition();
                return {
                    result: TokenError(ErrorTokenLiteral.INVALID_NEGATIVE_NUMERIC, row, col),
                    code: PartialExitCode.ERROR
                };
            }

            num += "-";
            this.movePosition();
        }

        while (this.cur && Lexer.isNumeric(this.cur)) {
            if (this.cur === ".") {
                if (previous_dot) {
                    return {
                        result: TokenError(ErrorTokenLiteral.NUMERIC_EXTRANEOUS_PERIODS, row, col),
                        code: PartialExitCode.ERROR
                    };
                }

                previous_dot = true;
            } else {
                previous_dot = false;
            }

            num += this.cur;
            this.movePosition();
        }

        return { result: TokenNum(num, row, col), code: PartialExitCode.SUCCESS };
    }

    private readStringEscapeSeq(): string {
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
        if ((this.cur as any) !== "\\") return "";
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

            if (seq.length === 0) throw new Error(`Invalid escape sequence: \\x`);

            this.movePosition();

            seq = String.fromCharCode(parseInt(seq, 16));
            seq = convertSeqToString(seq);
        } else if (this.cur === "u") {
            seq = "";
            for (let i = 0; i < 4 && /^[0-9a-fA-F]$/.test(this.peek); i++) {
                this.movePosition();
                seq += this.cur;
            }

            if (seq.length === 0) throw new Error(`Invalid escape sequence: \\u`);

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

            if (seq.length === 0) throw new Error(`Invalid escape sequence: \\U`);

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

        return seq;
    }

    private readStringTok(): { result: Token, code: PartialExitCode } {
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
                str += this.readStringEscapeSeq();
                continue;
            }

            if (!this.peek) {
                return {
                    result: TokenError("Missing closing \"", row, col),
                    code: PartialExitCode.INCOMPLETE
                };
            }

            str += this.cur;

            this.movePosition();
        }

        return {
            result: TokenStr(str, row, col),
            code: PartialExitCode.SUCCESS
        };
    }

    private readIdentTok(): { result: Token, code: PartialExitCode } {
        let lit = "";
        const col = this.col;
        const row = this.row;

        if (
            Lexer.isNumeric(this.cur) ||
            Lexer.isWhitespace(this.cur) ||
            Lexer.isQuote(this.cur) ||
            CHAR_TOK_MAP[this.cur]
        ) {
            this.movePosition();
            return {
                result: TokenError(ErrorTokenLiteral.INVALID_IDENT_NAME, row, col),
                code: PartialExitCode.ERROR
            };
        }

        while (
            this.cur &&
            !Lexer.isWhitespace(this.cur) &&
            !Lexer.isQuote(this.cur) &&
            !CHAR_TOK_MAP[this.cur]
        ) {
            lit += this.cur;
            this.movePosition();
        }

        if (this.builtins.has(lit)) {
            const { type, literal } = this.builtins.get(lit)!;
            return { result: new Token(type, literal, row, col), code: PartialExitCode.SUCCESS }
        } else {
            return { result: TokenIdent(lit, row, col), code: PartialExitCode.SUCCESS }
        }
    }

    private readSymbolTok(): { result: Token, code: PartialExitCode } {
        let lit = "";
        const col = this.col;
        const row = this.row;
        let quoted = false;

        // Any assertion to prevent overly specific type narrowing.
        if ((this.cur as any) !== "'") {
            return {
                result: TokenError(ErrorTokenLiteral.INVALID_SYMBOL_LITERAL, row, col),
                code: PartialExitCode.ERROR
            };
        }

        this.movePosition();
        this.skipWhitespace();

        // TODO: This does not allow for escaped pipes within quoted symbols.
        if (this.cur === "|") {
            quoted = true;
            this.movePosition();
        }

        if (this.cur === "#") {
            if (this.peek === "%") {
                lit = "#%";
                this.movePosition();
                this.movePosition();
            } else {
                return {
                    result: TokenError(ErrorTokenLiteral.ILLEGAL_SYMBOL_HASH_START, row, col),
                    code: PartialExitCode.ERROR
                };
            }
        }

        while (
            this.cur &&
            !Lexer.isIllegalSymbolChar(this.cur, quoted)
        ) {
            lit += this.cur;
            this.movePosition();
        }

        if (quoted) {
            if (this.cur !== "|")
                return {
                    result: TokenError(ErrorTokenLiteral.INVALID_SYMBOL_LITERAL, row, col),
                    code: PartialExitCode.ERROR
                };

            this.movePosition();
        }

        if (lit === "." || lit === "") {
            return {
                result: TokenError(ErrorTokenLiteral.INVALID_SYMBOL_LITERAL, row, col),
                code: PartialExitCode.ERROR
            };
        }

        return { result: TokenSym(lit, row, col), code: PartialExitCode.SUCCESS };
    }

    private readCharTok(): { result: Token, code: PartialExitCode } {
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

        if (!/\#\\./.test(this.peekNextNChars(3)))
            return {
                result: TokenError(ErrorTokenLiteral.INVALID_CHARACTER_LITERAL, row, col),
                code: PartialExitCode.ERROR
            }

        this.movePosition();
        this.movePosition();
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

                    if (!/^[0-9A-Fa-f]{1,8}$/.test(hex))
                        throw new Error(`Invalid unicode character literal: #\\${ch}`);

                    let int = parseInt(hex, 16);

                    ch = convertCharToString(String.fromCodePoint(int));
                } else if (ch.length > 1) {
                    throw new Error(`Invalid character literal: #\\${ch}`)
                }

                ch = convertCharToString(ch);
            }
        }

        return { result: TokenChar(`${ch}`, row, col), code: PartialExitCode.SUCCESS };
    }

    static isWhitespace(ch: string): boolean { return /\s/.test(ch); }
    static isNumeric(ch: string): boolean { return /[\d.]/.test(ch); }
    static isQuote(ch: string): boolean { return /["`]/.test(ch); }
    static isIllegalSymbolChar(ch: string, quoted: boolean = false): boolean { return (quoted ? /[|]/ : /[()[\]{}",'`;|\\\s]/).test(ch); }

    private readonly builtins = new Map<string, { type: TokenType, literal: string }>([
        ["#t", { type: TokenType.BOOL, literal: BOOL_TRUE }],
        ["#T", { type: TokenType.BOOL, literal: BOOL_TRUE }],
        ["#f", { type: TokenType.BOOL, literal: BOOL_FALSE }],
        ["#F", { type: TokenType.BOOL, literal: BOOL_FALSE }],
    ])
};
