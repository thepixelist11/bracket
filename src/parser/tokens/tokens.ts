// Bracket uses the following tokens as lexical objects representing raw
// elements of source code. Each token has a `literal` and `value` property, as
// well as a `kind` property whose value is an enum member of `TokenType`. The
// `literal` property represents the literal value of a given token (i.e. the
// string in a Str token or the ID in a Sym token) or the primary discriminant
// payload for tokens which do not have a clear literal value. The `value`
// property contains any additional data relevant to the token used in
// compilation and/or evaluation. Tokens may additionally have an optional
// `meta` property containing metadata (e.g. source location information) which
// is ignored by the compiler or evaluator except for producing debug
// information. `meta` must not be required in any token for any purpose.
//
// Tokens are not used at runtime and are purely used in parsing, which will
// produce AST representations of the corresponding tokens.
//
// The following is a list of all TokenTypes in Bracket, their `literal` and
// `value` types, as well as any additional implementation or usage details.
//
// Num ---------------- Numeric tokens
//                        Literal: <number>
//                        Value: <none>
//
// Str ---------------- String literal tokens
//                        Literal: <string>
//                        Value: <none>
//
// Sym ---------------- Symbol tokens
//                        Literal: <string> - Interned symbol name
//                        Value: <none>
//
//                        Symbol tokens represent a sequence of characters
//                        constituting an identifier in source code. The
//                        literal field contains the normalized name which is
//                        used in the intern table.
//
// Quote -------------- Quote token
//                        Literal: <none>
//                        Value: <none>
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
//                        Value: <none>
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
//                        Value: <none>
//
//                        Unquote tokens represent the `unquote` syntactic form
//                        which are used within a quasiquoted context. During
//                        parsing, Unquote <expr> becomes (unquote <expr>) and
//                        is evaluated within quasiquoted data These are only
//                        valid within quasiquoted forms.
//
// UnquoteSplicing ---- Unquote-splicing token
//                        Literal: <none>
//                        Value: <none>
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
//                        Value: <none>
//
// Char --------------- Char tokens
//                        Literal: <string>
//                        Value: <none>
//
//                        The literal value for char tokens must be a single
//                        Unicode scalar value.
//
// EOF ---------------- EOF token
//                        Literal: <none>
//                        Value: <none>
//
//                        EOF tokens mark the end of a token stream. Parsing
//                        stops upon reaching this token.
//
// Error -------------- Error token
//                        Literal: <ErrorType> - See ..../error.ts        todo: add this file
//                        Value: <string> - Error message
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
//                        Value: <none>
//
// RParen ------------- Right Parentheses Token
//                        Literal: <ParenType>
//                        Value: <none>
//
// Dot ---------------- TODO
//
// Ellipsis ----------- TODO

