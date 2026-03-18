import { Token, TokenKind, TokenStr } from "./tokens.js";
import { Lexer } from "./lexer.js";
import { readEscape } from "./read-escape.js";
import { Result, Ok } from "../shared/data-structures/result.js";
import { LexerError, LexerErrorKind, toLexerError } from "./lexer-errors.js";

export function readStringTok(l: Lexer): Result<Token, LexerError> {
    const pos = l.position;

    let res = l.expect(
        (ch) => ch === '"',
        'read string failed; expected an opening "',
    );

    if (res.is_err())
        return res.map_err((err) =>
            toLexerError(err, LexerErrorKind.UnexpectedSyntax, pos),
        );

    let literal = "";
    let err: null | Result<never, LexerError> = null;

    read_loop: while (!l.is_done) {
        const ch = l.peek() as string;

        switch (ch) {
            case '"':
                break read_loop;

            case "\\":
                const esc = readEscape(l);

                if (esc.is_err()) {
                    err ??= esc;
                } else {
                    literal += esc.unwrap();
                }

                break;

            default:
                literal += l.next() as string;
                break;
        }
    }

    res = l.expect(
        (ch) => ch === '"',
        'read string failed; expected a closing "',
    );

    if (res.is_err())
        return res.map_err((err) =>
            toLexerError(err, LexerErrorKind.MissingClosing, pos),
        );

    if (err) return err;

    return Ok(TokenStr(literal, { pos }));
}
