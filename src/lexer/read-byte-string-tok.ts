import { Err, Ok, Result } from "../shared/data-structures/result.js";
import { LexerError } from "../shared/errors.js";
import { isByteChar } from "../shared/util/strings.js";
import { Lexer } from "./lexer.js";
import { readEscape } from "./read-escape.js";
import { Token, TokenByteStr } from "./tokens.js";

export function readByteStringTok(l: Lexer): Result<Token, LexerError> {
    const pos = l.position;

    let res = l.expectN(
        str => str.join("") === '#"',
        2,
        "read byte string failed; expected an opening #\""
    );

    if (res.is_err())
        return res.map_err(x => new LexerError(x.message));

    let literal = "";

    read_loop: while (!l.is_done) {
        let ch = l.peek();

        switch (ch) {
            case '"':
                break read_loop;

            case '\\':
                const esc = readEscape(l);
                if (esc.is_err()) return esc;
                ch = esc.val();
                // FIXME: does not return literal escape sequence, must fix single byte check.
                break;

            default:
                ch = l.next() as string;
                break;
        }

        if (!isByteChar(ch))
            return Err(
                new Error(
                    `read byte string failed; char '${ch}' (${ch.charCodeAt(0)}) ` +
                    `is out of range of byte string [0, 255]`
                )
            );

        literal += ch;
    }

    res = l.expect(ch => ch === '"', "read byte string failed; expected a closing \"");

    if (res.is_err())
        return res.map_err(x => new LexerError(x.message));

    return Ok(TokenByteStr(literal, { pos }));
}
