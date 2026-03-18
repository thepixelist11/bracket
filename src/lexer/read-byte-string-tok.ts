import { Ok, Result } from "../shared/data-structures/result.js";
import { isByteChar, convertSeqToString } from "../shared/util/strings.js";
import {
    LexerErrorKind,
    LexerError,
    toLexerError,
    generalLexerError,
} from "./lexer-errors.js";
import { Lexer } from "./lexer.js";
import { readEscape } from "./read-escape.js";
import { Token, TokenByteStr } from "./tokens.js";

export function readByteStringTok(l: Lexer): Result<Token, LexerError> {
    const pos = l.position;

    let res = l.expectN(
        (str) => str.join("") === '#"',
        2,
        'read byte string failed; expected an opening #"',
    );

    if (res.is_err())
        return res.map_err((x) =>
            toLexerError(x, LexerErrorKind.UnexpectedSyntax, pos),
        );

    let literal = "";
    let err: null | Result<never, LexerError> = null;

    read_loop: while (!l.is_done) {
        let ch = l.peek();

        switch (ch) {
            case '"':
                break read_loop;

            case "\\":
                const esc = readEscape(l);

                if (esc.is_err()) {
                    err ??= esc;
                } else {
                    ch = esc.val();
                }

                break;

            default:
                ch = l.next() as string;
                break;
        }

        if (!isByteChar(ch)) {
            err ??= generalLexerError(
                `read byte string failed; char '${ch}' (${ch.charCodeAt(0)}) ` +
                    `is out of range of byte string [0, 255]`,
                pos,
            );
        } else {
            literal += ch;
        }
    }

    res = l.expect(
        (ch) => ch === '"',
        'read byte string failed; expected a closing "',
    );

    if (res.is_err())
        return res.map_err((x) =>
            toLexerError(x, LexerErrorKind.MissingClosing, pos),
        );

    if (err) return err;

    return Ok(TokenByteStr(literal, { pos }));
}
