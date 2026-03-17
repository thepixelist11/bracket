/* Bracket uses the following tokens as lexical objects representing raw
 * elements of source code. Each token has a `literal` property, as well as a
 * `kind` property whose value is an enum member of `TokenKind`. The `literal`
 * property represents the literal value of a given token (i.e. the string in a
 * Str token or the ID in a Sym token) or the primary discriminant payload for
 * tokens which do not have a clear literal value. Tokens may additionally have
 * an optional `meta` property containing metadata (e.g. source location
 * information) which is ignored by the compiler or evaluator except for
 * producing debug information. `meta` must not be required in any token for
 * any purpose.
 *
 * Tokens are not used at runtime and are purely used in parsing, which will
 * produce AST representations of the corresponding tokens.
 *
 * The following is a list of all TokenKinds in Bracket, their `literal` types,
 * as well as any additional implementation or usage details.
 *
 * Str ---------------- String literal token
 *                        Literal: <string>
 *
 * ByteStr ------------ Byte String literal token
 *                        Literal: <string>
 *
 *                        Note that ByteStr tokens will be normalized to a
 *                        `bytes` form in the reader phase.
 *
 * Seq ---------------- Delimited Sequence token
 *                        Literal: <string>
 *
 *                        Sequence tokens represent a sequence of characters
 *                        delimited by the following, not beginning with '#':
 *
 *                        ( ) [ ] { } " ' , ` ;
 *                        Whitespace,
 *                        BOM Character (\uFEFF)
 *
 *                        These sequences are later converted to numbers and
 *                        symbols by the Reader.
 *
 * Quote -------------- Quote token - "'"
 *                        Literal: <none>
 *
 *                        Quote tokens represent the `quote` syntactic form
 *                        which are used to prevent evaluation of a datum or
 *                        form. For example: (quote x) is equivalent to 'x, a
 *                        symbol with a literal of "x". Quotes are also used to
 *                        prevent evaluation of s-expressions, resulting in a
 *                        raw list of datums. For example: (quote (a #\b 3)) is
 *                        equivalent to a list containing the elements sym:a,
 *                        char:b, and num:3. This is equivalent to (quote
 *                        <datum>) or '<datum>
 *
 * Quasiquote --------- Quasiquote token - '`'
 *                        Literal: <none>
 *
 *                        Quasiquote tokens represent the `quasiquote`
 *                        syntactic form which are used to prevent evaluation
 *                        of a datum or form, except where allowed through
 *                        Unquotes, in which the result of the unquote will be
 *                        expanded within the quasiquote. This is equivalent to
 *                        (quasiquote <datum>) or `<datum>
 *
 * Unquote ------------ Unquote token - ','
 *                        Literal: <none>
 *
 *                        Unquote tokens represent the `unquote` syntactic form
 *                        which are used within a quasiquoted context. During
 *                        parsing, Unquote <expr> becomes (unquote <expr>) and
 *                        is evaluated within quasiquoted data These are only
 *                        valid within quasiquoted forms.
 *
 * UnquoteSplicing ---- Unquote-splicing token - '@,'
 *                        Literal: <none>
 *
 *                        UnquoteSplicing tokens represent the
 *                        `unquote-splicing` syntactic form which are used
 *                        within a quasiquoted context to splice the elements
 *                        of a list into the surrounding quasiquoted structure.
 *                        During parsing, UnquoteSplicing <expr> becomes:
 *                        (unquote-splicing <expr>) and is evaluated within
 *                        quasiquoted data. The result of <expr> must evaluate
 *                        to a list, whose elements are inserted into the
 *                        enclosing list rather than included as a single
 *                        element. This is equivalent to ,@<expr>. These are
 *                        only valid within quasiquoted forms.
 *
 * Bool --------------- Boolean tokens
 *                        Literal: <boolean>
 *
 * Char --------------- Char tokens
 *                        Literal: <string>
 *
 *                        The literal value for char tokens must be a single
 *                        Unicode scalar value.
 *
 * EOF ---------------- EOF token
 *                        Literal: <none>
 *
 *                        EOF tokens mark the end of a token stream. Parsing
 *                        stops upon reaching this token.
 *
 * Error -------------- Error token
 *                        Literal: <{type: LexerErrorKind, msg: string}>
 *
 *                        Error tokens mark an error in parsing, lexing, or
 *                        evaluation. Upon receiving this token, the error
 *                        should be handled according to the error type
 *                        (`literal`). For example, this may represent a token
 *                        in which malformed input was found while lexing and
 *                        lexing must halt or continue outside of the current
 *                        scope, or it may represent a missing closing ')',
 *                        signaling an editor or REPL to create a newline on
 *                        enter rather than committing and evaluating the input
 *                        buffer.
 *
 * LParen ------------- Left Parentheses Token - '(', '[', '{'
 *                        Literal: <ParenKind>
 *
 * RParen ------------- Right Parentheses Token - ')', ']', '}'
 *                        Literal: <ParenKind>
 *
 * Dot ---------------- Dot token - '.'
 *                        Literal: <none>
 *
 * Keyword ------------ Keyword token - '#:'
 *                        Literal: <string>
 *
 * VectorStart -------- Vector Start token - '#('
 *                        Literal: <none>
 *
 * DatumComment ------- Datum Comment token - '#;'
 *                        Literal: <none>
 *
 * Shebang ------------ Shebang token - '#!'
 *                        Literal: <string>
 *
 * Line Comment ------- Line Comment token - ';'
 *                        Literal: <string>
 *
 *                        Line comment tokens contain the contents of the line
 *                        which may be used in parsing for generating inline
 *                        documentation, source reconstruction, etc., but are
 *                        stripped at runtime.
 */

import { Err, Ok, Result } from "../shared/data-structures/result.js";
import { Position } from "../shared/util/types.js";
import { LexerErrorKind } from "./lexer-errors.js";

interface ErrorTokenLiteral {
    msg: string;
    kind: LexerErrorKind;
    pos?: Position;
}

export enum ParenKind {
    Paren,
    Bracket,
    Brace,
}

export function getParenKind(ch: string): Result<ParenKind, Error> {
    switch (ch) {
        case "(":
        case ")":
            return Ok(ParenKind.Paren);

        case "[":
        case "]":
            return Ok(ParenKind.Bracket);

        case "{":
        case "}":
            return Ok(ParenKind.Brace);

        default:
            return Err(
                new Error(`getParenKind failed; invalid paren type: '${ch}'`),
            );
    }
}

export enum TokenKind {
    Str,
    ByteStr,
    Seq,
    Quote,
    Quasiquote,
    Unquote,
    UnquoteSplicing,
    Bool,
    Char,
    EOF,
    Error,
    LParen,
    RParen,
    Dot,
    Keyword,
    VectorStart,
    DatumComment,
    Shebang,
    LineComment,
}

export type TokenMetadata = Partial<{
    pos: Position;
}> & { [key: string]: unknown };

export interface TokenBase {
    kind: TokenKind;
    meta?: Readonly<TokenMetadata>;
}

export interface TokenStr extends TokenBase {
    kind: TokenKind.Str;
    literal: string;
}

export interface TokenByteStr extends TokenBase {
    kind: TokenKind.ByteStr;
    literal: string;
}

export interface TokenSeq extends TokenBase {
    kind: TokenKind.Seq;
    literal: string;
}

export interface TokenQuote extends TokenBase {
    kind: TokenKind.Quote;
}

export interface TokenQuasiquote extends TokenBase {
    kind: TokenKind.Quasiquote;
}

export interface TokenUnquote extends TokenBase {
    kind: TokenKind.Unquote;
}

export interface TokenUnquoteSplicing extends TokenBase {
    kind: TokenKind.UnquoteSplicing;
}

export interface TokenBool extends TokenBase {
    kind: TokenKind.Bool;
    literal: boolean;
}

export interface TokenChar extends TokenBase {
    kind: TokenKind.Char;
    literal: string;
}

export interface TokenEOF extends TokenBase {
    kind: TokenKind.EOF;
}

export interface TokenError extends TokenBase {
    kind: TokenKind.Error;
    literal: ErrorTokenLiteral;
}

export interface TokenLParen extends TokenBase {
    kind: TokenKind.LParen;
    literal: ParenKind;
}

export interface TokenRParen extends TokenBase {
    kind: TokenKind.RParen;
    literal: ParenKind;
}

export interface TokenDot extends TokenBase {
    kind: TokenKind.Dot;
}

export interface TokenKeyword extends TokenBase {
    kind: TokenKind.Keyword;
    literal: string;
}

export interface TokenVectorStart extends TokenBase {
    kind: TokenKind.VectorStart;
}

export interface TokenDatumComment extends TokenBase {
    kind: TokenKind.DatumComment;
}

export interface TokenShebang extends TokenBase {
    kind: TokenKind.Shebang;
    literal: string;
}

export interface TokenLineComment extends TokenBase {
    kind: TokenKind.LineComment;
    literal: string;
}

export type Token =
    | TokenStr
    | TokenByteStr
    | TokenSeq
    | TokenQuote
    | TokenQuasiquote
    | TokenUnquote
    | TokenUnquoteSplicing
    | TokenBool
    | TokenChar
    | TokenEOF
    | TokenError
    | TokenLParen
    | TokenRParen
    | TokenDot
    | TokenKeyword
    | TokenVectorStart
    | TokenDatumComment
    | TokenShebang
    | TokenLineComment;

export function tokenToString(token: Token): string {
    switch (token.kind) {
        case TokenKind.Error: {
            const { msg, kind, pos } = token.literal;

            const kindStr =
                kind === LexerErrorKind.General
                    ? `<${LexerErrorKind[kind]}>`
                    : "<error>";

            const pos_str = pos ? ` at ${pos.row}:${pos.col}` : "";

            return `TokenError(${kindStr}:${msg}${pos_str})`;
        }

        case TokenKind.LParen:
        case TokenKind.RParen: {
            const kind_str = TokenKind[token.kind];
            const lit_str = ParenKind[token.literal] ?? "";
            return `Token${kind_str}(${lit_str})`;
        }

        case TokenKind.Str:
        case TokenKind.ByteStr:
        case TokenKind.Seq:
        case TokenKind.Bool:
        case TokenKind.Char:
        case TokenKind.Keyword:
        case TokenKind.Shebang:
        case TokenKind.LineComment: {
            const kind_str = TokenKind[token.kind];
            return `Token${kind_str}(${token.literal})`;
        }

        default: {
            const kind_str = TokenKind[token.kind];
            return `Token${kind_str}`;
        }
    }
}

export function TokenStr(
    literal: string,
    meta?: TokenMetadata,
): Readonly<TokenStr> {
    return { kind: TokenKind.Str, literal, meta } as const;
}

export function TokenByteStr(
    literal: string,
    meta?: TokenMetadata,
): Readonly<TokenByteStr> {
    return { kind: TokenKind.ByteStr, literal, meta } as const;
}

export function TokenSeq(
    literal: string,
    meta?: TokenMetadata,
): Readonly<TokenSeq> {
    return { kind: TokenKind.Seq, literal, meta } as const;
}

export function TokenQuote(meta?: TokenMetadata): Readonly<TokenQuote> {
    return { kind: TokenKind.Quote, meta } as const;
}

export function TokenQuasiquote(
    meta?: TokenMetadata,
): Readonly<TokenQuasiquote> {
    return { kind: TokenKind.Quasiquote, meta } as const;
}

export function TokenUnquote(meta?: TokenMetadata): Readonly<TokenUnquote> {
    return { kind: TokenKind.Unquote, meta } as const;
}

export function TokenUnquoteSplicing(
    meta?: TokenMetadata,
): Readonly<TokenUnquoteSplicing> {
    return { kind: TokenKind.UnquoteSplicing, meta } as const;
}

export function TokenBool(
    literal: boolean,
    meta?: TokenMetadata,
): Readonly<TokenBool> {
    return { kind: TokenKind.Bool, literal, meta } as const;
}

export function TokenChar(
    literal: string,
    meta?: TokenMetadata,
): Readonly<TokenChar> {
    return { kind: TokenKind.Char, literal, meta } as const;
}

export function TokenEOF(meta?: TokenMetadata): Readonly<TokenEOF> {
    return { kind: TokenKind.EOF, meta } as const;
}

export function TokenError(
    literal: ErrorTokenLiteral,
    meta?: TokenMetadata,
): Readonly<TokenError> {
    return { kind: TokenKind.Error, literal, meta } as const;
}

export function TokenLParen(
    literal: ParenKind,
    meta?: TokenMetadata,
): Readonly<TokenLParen> {
    return { kind: TokenKind.LParen, literal, meta } as const;
}

export function TokenRParen(
    literal: ParenKind,
    meta?: TokenMetadata,
): Readonly<TokenRParen> {
    return { kind: TokenKind.RParen, literal, meta } as const;
}

export function TokenDot(meta?: TokenMetadata): Readonly<TokenDot> {
    return { kind: TokenKind.Dot, meta } as const;
}

export function TokenKeyword(
    literal: string,
    meta?: TokenMetadata,
): Readonly<TokenKeyword> {
    return { kind: TokenKind.Keyword, literal, meta } as const;
}

export function TokenVectorStart(
    meta?: TokenMetadata,
): Readonly<TokenVectorStart> {
    return { kind: TokenKind.VectorStart, meta } as const;
}

export function TokenDatumComment(
    meta?: TokenMetadata,
): Readonly<TokenDatumComment> {
    return { kind: TokenKind.DatumComment, meta } as const;
}

export function TokenShebang(
    literal: string,
    meta?: TokenMetadata,
): Readonly<TokenShebang> {
    return { kind: TokenKind.Shebang, literal, meta } as const;
}

export function TokenLineComment(
    literal: string,
    meta?: TokenMetadata,
): Readonly<TokenLineComment> {
    return { kind: TokenKind.LineComment, literal, meta } as const;
}

/*        Token Factory Exhaustiveness Checking       */

type __ExpandMissing<T> = T extends any ? ["Missing token factory:", T] : never;
type __TokenKindNames = Extract<keyof typeof TokenKind, string>;
type __ExpectedFactoryNames = `Token${__TokenKindNames}`;
type __ModuleExports = typeof import("./tokens.ts");
type __ActualFactoryNames = Extract<keyof __ModuleExports, `Token${string}`>;
type __MissingFactories = Exclude<__ExpectedFactoryNames, __ActualFactoryNames>;
type __AssertAllFactoriesExist = [__MissingFactories] extends [never]
    ? true
    : __ExpandMissing<__MissingFactories>;
const __assertTokenFactories: __AssertAllFactoriesExist = true;
