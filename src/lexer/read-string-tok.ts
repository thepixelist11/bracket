import { TokenStr } from "./tokens.js";
import { Lexer } from "./lexer.js";
import { readEscape } from "./read-escape.js";

export function readStringTok(l: Lexer) {
    const pos = l.position;
    console.log(`found string at ${pos.idx} (${pos.row}/${pos.col})`);

    l.expect(ch => ch === '"', "read string failed; expected an opening \"");

    let literal = "";

    read_loop: while (!l.is_done) {
        const ch = l.peek() as string;

        switch (ch) {
            case '"':
                break read_loop;

            case '\\':
                literal += readEscape(l);
                break;

            default:
                literal += l.next() as string;
                break;
        }
    }

    l.expect(ch => ch === '"', "read string failed; expected a closing \"");

    return TokenStr(literal, { pos });
}
