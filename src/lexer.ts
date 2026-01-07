import { CHAR_TOK_MAP, PartialExitCode, RPAREN_TYPE_MAP, PAREN_TYPE_MAP, LANG_NAME, VERSION_NUMBER, getDefaultReaderFeatures, InterpreterContext, FD_LANGUAGE, FD_SHEBANG } from "./globals.js";
import { Token, TokenEOF, TokenChar, TokenError, TokenNum, TokenStr, TokenIdent, TokenVoid, TokenType, TokenSym, TokenBool, TokenMetadata, TokenRParen, TokenLParen, TokenMeta, TokenForm } from "./token.js";

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

function readFormList(
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

function readNForms(
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

const READER_MACROS = new ReaderMacroTable([ // TODO: Add doc meta shorthand
    {
        dispatch: "t",
        cursor: "prefix",
        produces: TokenType.BOOL,
        fn: (_, start) => ({
            result: TokenBool(true, start),
            code: PartialExitCode.SUCCESS,
        })
    },
    {
        dispatch: "T",
        cursor: "prefix",
        produces: TokenType.BOOL,
        fn: (_, start) => ({
            result: TokenBool(true, start),
            code: PartialExitCode.SUCCESS,
        })
    },
    {
        dispatch: "f",
        cursor: "prefix",
        produces: TokenType.BOOL,
        fn: (_, start) => ({
            result: TokenBool(false, start),
            code: PartialExitCode.SUCCESS,
        })
    },
    {
        dispatch: "F",
        cursor: "prefix",
        produces: TokenType.BOOL,
        fn: (_, start) => ({
            result: TokenBool(false, start),
            code: PartialExitCode.SUCCESS,
        })
    },
    {
        dispatch: "v",
        cursor: "prefix",
        produces: TokenType.VOID,
        fn: (lexer, start) => {
            const toks = [
                TokenLParen(),
                TokenIdent("void"),
                TokenRParen(),
            ];

            lexer.inject(toks);

            return {
                result: TokenVoid(start),
                code: PartialExitCode.SUCCESS,
            }
        }
    },
    {
        dispatch: "\\",
        cursor: "prefix",
        produces: TokenType.CHAR,
        fn: (lexer, _) => { return lexer.readCharTok() },
    },
    {
        dispatch: ";",
        cursor: "manual",
        produces: TokenType.VOID,
        fn: (lexer, start) => {
            lexer.movePosition();
            const ignored = lexer.readForm();
            if (ignored.code !== PartialExitCode.SUCCESS)
                return { result: ignored.result[0], code: ignored.code };

            return {
                result: TokenVoid(lexer.makeMeta(start)),
                code: PartialExitCode.SUCCESS
            };
        }
    },
    {
        dispatch: "!",
        cursor: "manual",
        produces: TokenType.VOID,
        fn: (lexer, start, ctx) => {
            lexer.movePosition();
            const filepath = lexer.readStringToLineEnd();

            if (filepath.code !== PartialExitCode.SUCCESS)
                return { result: TokenError(filepath.result, start), code: filepath.code };

            ctx.file_directives.set(FD_SHEBANG, filepath.result);

            return {
                result: TokenVoid(lexer.makeMeta(start)),
                code: PartialExitCode.SUCCESS
            };
        }
    },
    {
        dispatch: "meta",
        cursor: "prefix",
        produces: TokenType.VOID,
        fn: (lexer, start) => {
            const res = readNForms(lexer, 2);
            if (res.code !== PartialExitCode.SUCCESS) return res;

            if (res.result[0].length !== 1 ||
                res.result[1].length !== 1) {
                return {
                    result: TokenError("expected #meta <key> <value>"),
                    code: PartialExitCode.ERROR
                };
            }

            const [key, value] = res.result.map(f => f[0]);

            if (key.type !== TokenType.IDENT) {
                return {
                    result: TokenError("expected #meta <key> <value>; expected key to be an ident"),
                    code: PartialExitCode.ERROR
                };
            }

            if (key.literal.startsWith("__")) {
                return {
                    result: TokenError("Any metadata properties of the format __KEY are reserved for internal use."),
                    code: PartialExitCode.ERROR
                };
            }

            if (key.literal === "row" || key.literal === "col") {
                return {
                    result: TokenError("Positional metadata may not be overwritten."),
                    code: PartialExitCode.ERROR
                };
            }

            if (value.type !== TokenType.STR && value.type !== TokenType.NUM) {
                return {
                    result: TokenError("expected #meta <key> <value>; expected key to be a string or a number"),
                    code: PartialExitCode.ERROR
                };
            }

            lexer.skipWhitespace();
            lexer.skipComment();

            if (value.type === TokenType.STR)
                return { result: TokenMeta({ meta: { [key.literal]: value.literal } }, start), code: PartialExitCode.SUCCESS };
            else
                return { result: TokenMeta({ meta: { [key.literal]: parseFloat(value.literal) } }, start), code: PartialExitCode.SUCCESS };
        }
    },
    {
        dispatch: "doc",
        cursor: "prefix",
        produces: TokenType.VOID,
        fn: (lexer, start) => {
            const res = lexer.readForm();
            if (res.code !== PartialExitCode.SUCCESS)
                return { result: res.result[0], code: res.code };

            if (res.result.length !== 1) {
                return {
                    result: TokenError("expected #doc <value>; expected value to be a string or a number"),
                    code: PartialExitCode.ERROR
                };
            }

            const value = res.result[0];

            if (value.type !== TokenType.STR && value.type !== TokenType.NUM) {
                return {
                    result: TokenError("expected #doc <value>; expected value to be a string or a number"),
                    code: PartialExitCode.ERROR
                };
            }

            lexer.skipWhitespace();
            lexer.skipComment();

            if (value.type === TokenType.STR)
                return { result: TokenMeta({ meta: { doc: value.literal } }, start), code: PartialExitCode.SUCCESS };
            else
                return { result: TokenMeta({ meta: { doc: parseFloat(value.literal) } }, start), code: PartialExitCode.SUCCESS };
        }
    },
    {
        dispatch: "|",
        cursor: "manual",
        produces: TokenType.VOID,
        fn: (lexer, start) => {
            let comment_stack = 1;
            while (
                lexer.cur &&
                lexer.peek &&
                comment_stack > 0
            ) {
                lexer.movePosition();
                if (lexer.peekNextNChars(2) === "#|")
                    comment_stack++;
                if (lexer.peekNextNChars(2) === "|#")
                    comment_stack--;
            }

            if (lexer.peekNextNChars(2) !== "|#") {
                return {
                    result: TokenError("could not find closing |#"),
                    code: PartialExitCode.INCOMPLETE
                };
            }

            lexer.movePosition();
            lexer.movePosition();

            return {
                result: TokenVoid(lexer.makeMeta(start)),
                code: PartialExitCode.SUCCESS
            };
        }
    },
    {
        dispatch: "lang",
        cursor: "prefix",
        produces: TokenType.VOID,
        fn: (lexer, start, ctx) => {
            const lang_name = lexer.readIdentTok();
            if (lang_name.code !== PartialExitCode.SUCCESS) return lang_name;

            ctx.file_directives.set(FD_LANGUAGE, lang_name.result.literal);

            return {
                result: TokenVoid(lexer.makeMeta(start)),
                code: PartialExitCode.SUCCESS,
            };
        }
    },
    {
        dispatch: "feat-require",
        cursor: "prefix",
        produces: TokenType.VOID,
        fn: (lexer, start, ctx) => {
            const res = readFormList(lexer, start, {
                min: 1,
                max: 2,
                error: "expected #feat-require(feature err-msg)"
            });

            if (res.code !== PartialExitCode.SUCCESS) return res;

            const [feature_form, err_form] = res.result;

            if (
                feature_form.length !== 1 ||
                feature_form[0].type !== TokenType.IDENT
            ) {
                return {
                    result: TokenError("feature must be an identifier", start),
                    code: PartialExitCode.ERROR
                };
            }

            if (
                err_form && (
                    err_form.length !== 1 ||
                    err_form[0].type !== TokenType.STR
                )
            ) {
                return {
                    result: TokenError("error message must be a string", start),
                    code: PartialExitCode.ERROR
                };
            }

            const feature = feature_form[0].literal;
            const err = err_form ? err_form[0].literal : `this file requires ${feature}`;

            if (!ctx.features.has(feature)) {
                return {
                    result: TokenError(err, start),
                    code: PartialExitCode.ERROR,
                };
            }

            return { result: TokenVoid(start), code: PartialExitCode.SUCCESS };
        }
    },
    {
        dispatch: "?",
        cursor: "prefix",
        produces: TokenType.ANY,
        fn: (lexer, start, ctx) => {
            const res = readFormList(lexer, start, {
                min: 2,
                max: 3,
                error: "expected #?(feature then [else])"
            });

            if (res.code !== PartialExitCode.SUCCESS) return res;

            const [feature_form, then_form, else_form] = res.result;

            if (
                feature_form.length !== 1 ||
                feature_form[0].type !== TokenType.IDENT
            ) {
                return {
                    result: TokenError("feature must be an identifier", start),
                    code: PartialExitCode.ERROR
                };
            }

            const feature = feature_form[0].literal;
            const branch = ctx.features.has(feature)
                ? then_form
                : else_form;

            if (branch)
                lexer.inject(branch);

            return {
                result: TokenVoid(start),
                code: PartialExitCode.SUCCESS
            };
        }
    },
    {
        dispatch: "+",
        cursor: "prefix",
        produces: TokenType.ANY,
        fn: (lexer, start, ctx) => {
            const res = readNForms(lexer, 2);

            if (res.code !== PartialExitCode.SUCCESS) return res;

            const [feature_form, body_form] = res.result;

            if (
                feature_form.length !== 1 ||
                feature_form[0].type !== TokenType.IDENT
            ) {
                return {
                    result: TokenError("feature must be an identifier", start),
                    code: PartialExitCode.ERROR
                };
            }

            if (ctx.features.has(feature_form[0].literal))
                lexer.inject(body_form);

            return {
                result: TokenVoid(start),
                code: PartialExitCode.SUCCESS
            };
        }
    },
    {
        dispatch: "-",
        cursor: "prefix",
        produces: TokenType.ANY,
        fn: (lexer, start, ctx) => {
            const res = readNForms(lexer, 2);

            if (res.code !== PartialExitCode.SUCCESS) return res;

            const [feature_form, body_form] = res.result;

            if (
                feature_form.length !== 1 ||
                feature_form[0].type !== TokenType.IDENT
            ) {
                return {
                    result: TokenError("feature must be an identifier", start),
                    code: PartialExitCode.ERROR
                };
            }

            if (!ctx.features.has(feature_form[0].literal))
                lexer.inject(body_form);

            return {
                result: TokenVoid(start),
                code: PartialExitCode.SUCCESS
            };
        }
    },
    {
        dispatch: "r",
        cursor: "prefix",
        produces: TokenType.NUM,
        fn: (lexer, start) => {
            const radix_tok = lexer.readNextToken();
            const number_tok = lexer.readNextToken();
            if (radix_tok.code !== PartialExitCode.SUCCESS) return radix_tok;
            if (number_tok.code !== PartialExitCode.SUCCESS) return number_tok;

            const radix = radix_tok.result;
            const num = number_tok.result;

            const radix_num = parseFloat(radix.literal);

            if (radix.type !== TokenType.NUM ||
                isNaN(radix_num) ||
                !Number.isInteger(radix_num) ||
                radix_num <= 1
            ) {
                return {
                    result: TokenError("expected a natural radix greater than 1"),
                    code: PartialExitCode.ERROR
                };
            }

            const num_num = parseInt(num.literal, radix_num);

            if (Number.isNaN(num_num)) {
                return {
                    result: TokenError(`expected a valid number in base ${radix.literal}`),
                    code: PartialExitCode.ERROR
                };
            }

            return {
                result: TokenNum(num_num, start),
                code: PartialExitCode.SUCCESS
            };
        }
    },
    {
        dispatch: "b",
        cursor: "prefix",
        produces: TokenType.NUM,
        fn: (lexer, start) => {
            const number_tok = lexer.readNextToken();
            if (number_tok.code !== PartialExitCode.SUCCESS) return number_tok;

            const num = parseInt(number_tok.result.literal, 2);

            if (Number.isNaN(num)) {
                return {
                    result: TokenError(`expected a valid number in base 2`),
                    code: PartialExitCode.ERROR
                };
            }

            return {
                result: TokenNum(num, start),
                code: PartialExitCode.SUCCESS
            };
        }
    },
    {
        dispatch: "o",
        cursor: "prefix",
        produces: TokenType.NUM,
        fn: (lexer, start) => {
            const number_tok = lexer.readNextToken();
            if (number_tok.code !== PartialExitCode.SUCCESS) return number_tok;

            const num = parseInt(number_tok.result.literal, 8);

            if (Number.isNaN(num)) {
                return {
                    result: TokenError(`expected a valid number in base 8`),
                    code: PartialExitCode.ERROR
                };
            }

            return {
                result: TokenNum(num, start),
                code: PartialExitCode.SUCCESS
            };
        }
    },
    {
        dispatch: "x",
        cursor: "prefix",
        produces: TokenType.NUM,
        fn: (lexer, start) => {
            const number_tok = lexer.readNextToken();
            if (number_tok.code !== PartialExitCode.SUCCESS) return number_tok;

            const num = parseInt(number_tok.result.literal, 16);

            if (Number.isNaN(num)) {
                return {
                    result: TokenError(`expected a valid number in base 16`),
                    code: PartialExitCode.ERROR
                };
            }

            return {
                result: TokenNum(num, start),
                code: PartialExitCode.SUCCESS
            };
        }
    },
]);

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
                final_result = new Token(CHAR_TOK_MAP[this.cur]!, this.cur, { row: this.row, col: this.col });
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
            new Token(TokenType.LPAREN, open, { row, col }),
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
