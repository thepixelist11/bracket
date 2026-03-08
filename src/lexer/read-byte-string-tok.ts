import { isByteChar } from "../shared/util/strings.js";
import { Lexer } from "./lexer.js";
import { readEscape } from "./read-escape.js";
import { TokenByteStr } from "./tokens.js";

export function readByteStringTok(l: Lexer) {
    const pos = l.position;

    l.expectN(
        str => str.join("") === '#"',
        2,
        "read byte string failed; expected an opening #\""
    );

    let literal = "";

    read_loop: while (!l.is_done) {
        let ch = l.peek();

        switch (ch) {
            case '"':
                break read_loop;

            case '\\':
                ch = readEscape(l);
                break;

            default:
                ch = l.next() as string;
                break;
        }

        if (!isByteChar(ch))
            throw new Error(`read byte string failed; char '${ch}' (${ch.charCodeAt(0)}) is out of range of byte string [0, 255]`);

        literal += ch;
    }

    l.expect(ch => ch === '"', "read byte string failed; expected a closing \"");
    return TokenByteStr(literal, { pos });
}
