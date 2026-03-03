// Bracket uses the following tokens as lexical objects representing raw
// elements of source code. Each token has a `literal` property, as well as a
// `kind` property whose value is an enum member of `TokenType`. The `literal`
// property represents the literal value of a given token (i.e. the string in a
// Str token or the ID in a Sym token) or the primary discriminant payload for
// tokens which do not have a clear literal value. Tokens may additionally have
// an optional `meta` property containing metadata (e.g. source location
// information) which is ignored by the compiler or evaluator except for
// producing debug information. `meta` must not be required in any token for
// any purpose.
//
// Tokens are not used at runtime and are purely used in parsing, which will
// produce AST representations of the corresponding tokens.
//
// The following is a list of all TokenTypes in Bracket, their `literal` types,
// as well as any additional implementation or usage details.
//
// Num ---------------- Numeric tokens
//                        Literal: <number>
//
// Str ---------------- String literal tokens
//                        Literal: <string>
//
// Sym ---------------- Symbol tokens
//                        Literal: <string> - Interned symbol name
//
//                        Symbol tokens represent a sequence of characters
//                        constituting an identifier in source code. The
//                        literal field contains the normalized name which is
//                        used in the intern table.
//
// Quote -------------- Quote token
//                        Literal: <none>
//
//                        Quote tokens represent the `quote` syntactic form
//                        which are used to prevent evaluation of a datum or
//                        form. For example: (quote x) is equivalent to 'x, a
//                        symbol with a literal of "x". Quotes are also used to
//                        prevent evaluation of s-expressions, resulting in a
//                        raw list of datums. For example: (quote (a #\b 3)) is
//                        equivalent to a list containing the elements sym:a,
//                        char:b, and num:3. This is equivalent to (quote
//                        <datum>) or '<datum>
//
// Quasiquote --------- Quasiquote token
//                        Literal: <none>
//
//                        Quasiquote tokens represent the `quasiquote`
//                        syntactic form which are used to prevent evaluation
//                        of a datum or form, except where allowed through
//                        Unquotes, in which the result of the unquote will be
//                        expanded within the quasiquote. This is equivalent to
//                        (quasiquote <datum>) or `<datum>
//
// Unquote ------------ Unquote token
//                        Literal: <none>
//
//                        Unquote tokens represent the `unquote` syntactic form
//                        which are used within a quasiquoted context. During
//                        parsing, Unquote <expr> becomes (unquote <expr>) and
//                        is evaluated within quasiquoted data These are only
//                        valid within quasiquoted forms.
//
// UnquoteSplicing ---- Unquote-splicing token
//                        Literal: <none>
//
//                        UnquoteSplicing tokens represent the
//                        `unquote-splicing` syntactic form which are used
//                        within a quasiquoted context to splice the elements
//                        of a list into the surrounding quasiquoted structure.
//                        During parsing, UnquoteSplicing <expr> becomes:
//                        (unquote-splicing <expr>) and is evaluated within
//                        quasiquoted data. The result of <expr> must evaluate
//                        to a list, whose elements are inserted into the
//                        enclosing list rather than included as a single
//                        element. This is equivalent to ,@<expr>. These are
//                        only valid within quasiquoted forms.
//
// Bool --------------- Boolean tokens
//                        Literal: <boolean>
//
// Char --------------- Char tokens
//                        Literal: <string>
//
//                        The literal value for char tokens must be a single
//                        Unicode scalar value.
//
// EOF ---------------- EOF token
//                        Literal: <none>
//
//                        EOF tokens mark the end of a token stream. Parsing
//                        stops upon reaching this token.
//
// Error -------------- Error token
//                        Literal: <{type: ErrorType, msg: string}> - See shared/errors.ts for ErrorType
//
//                        Error tokens mark an error in parsing, lexing, or
//                        evaluation. Upon receiving this token, the error
//                        should be handled according to the error type
//                        (`literal`). For example, this may represent a token
//                        in which malformed input was found while lexing and
//                        lexing must halt or continue outside of the current
//                        scope, or it may represent a missing closing ')',
//                        signaling an editor or REPL to create a newline on
//                        enter rather than committing and evaluating the input
//                        buffer.
//
// LParen ------------- Left Parentheses Token
//                        Literal: <ParenType>
//
// RParen ------------- Right Parentheses Token
//                        Literal: <ParenType>
//
// Dot ---------------- Dot token
//                        Literal: <none>
//
// Ellipsis ----------- Ellipsis token
//                        Literal: <none>

import { ErrorKind } from "../../shared/errors.js";
import { SourceLocation } from "../../shared/source-location.js";

interface ErrorTokenLiteral {
    msg: string;
    kind: ErrorKind;
};

export const enum TokenKind {
    Num,
    Str,
    Sym,
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
    Ellipsis,
};

type TokenKindLiteralMap<T extends TokenKind> =
    T extends TokenKind.Num ? number :
    T extends TokenKind.Str ? string :
    T extends TokenKind.Sym ? string :
    T extends TokenKind.Quote ? undefined :
    T extends TokenKind.Quasiquote ? undefined :
    T extends TokenKind.Unquote ? undefined :
    T extends TokenKind.UnquoteSplicing ? undefined :
    T extends TokenKind.Bool ? boolean :
    T extends TokenKind.Char ? string :
    T extends TokenKind.EOF ? undefined :
    T extends TokenKind.Error ? ErrorTokenLiteral :
    T extends TokenKind.LParen ? undefined :
    T extends TokenKind.RParen ? undefined :
    T extends TokenKind.Dot ? undefined :
    T extends TokenKind.Ellipsis ? undefined :
    never;

export type TokenMetadata = Partial<{
    loc: SourceLocation
}> & { [key: string]: unknown };

export class Token<T extends TokenKind = TokenKind> {
    constructor(
        private _kind: T,
        private _literal: TokenKindLiteralMap<T>,
        private _meta: TokenMetadata = {},
    ) { }

    get kind() { return this._kind; }
    get literal() { return this._literal; }
    get meta() { return this._meta; }

    public toString() {
        throw new Error("todo");
    }
}

export function TokenNum(literal: number, meta?: TokenMetadata) { return new Token(TokenKind.Num, literal, meta); }
export function TokenStr(literal: string, meta?: TokenMetadata) { return new Token(TokenKind.Str, literal, meta); }
export function TokenSym(literal: string, meta?: TokenMetadata) { return new Token(TokenKind.Sym, literal, meta); }
export function TokenQuote(meta?: TokenMetadata) { return new Token(TokenKind.Quote, undefined, meta); }
export function TokenQuasiquote(meta?: TokenMetadata) { return new Token(TokenKind.Quasiquote, undefined, meta); }
export function TokenUnquote(meta?: TokenMetadata) { return new Token(TokenKind.Unquote, undefined, meta); }
export function TokenUnquoteSplicing(meta?: TokenMetadata) { return new Token(TokenKind.UnquoteSplicing, undefined, meta); }
export function TokenBool(literal: boolean, meta?: TokenMetadata) { return new Token(TokenKind.Bool, literal, meta); }
export function TokenChar(literal: string & { length: 1 }, meta?: TokenMetadata) { return new Token(TokenKind.Char, literal, meta); }
export function TokenEOF(meta?: TokenMetadata) { return new Token(TokenKind.EOF, undefined, meta); }
export function TokenError(literal: ErrorTokenLiteral, meta?: TokenMetadata) { return new Token(TokenKind.Error, literal, meta); }
export function TokenLParen(meta?: TokenMetadata) { return new Token(TokenKind.LParen, undefined, meta); }
export function TokenRParen(meta?: TokenMetadata) { return new Token(TokenKind.RParen, undefined, meta); }
export function TokenDot(meta?: TokenMetadata) { return new Token(TokenKind.Dot, undefined, meta); }
export function TokenEllipsis(meta?: TokenMetadata) { return new Token(TokenKind.Ellipsis, undefined, meta); }
