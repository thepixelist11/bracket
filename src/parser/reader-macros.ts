import { FD_LANGUAGE, FD_SHEBANG, PartialExitCode } from "../shared/globals.js";
import { readFormList, readNForms } from "./read-forms.js";
import { ReaderMacroTable } from "./reader-macro-table.js";
import { TokenBool, TokenError, TokenIdent, TokenLParen, TokenMeta, TokenNum, TokenRParen, TokenType, TokenVoid } from "./token.js";

export const READER_MACROS = new ReaderMacroTable([
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
        dispatch: "true",
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
        dispatch: "false",
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

