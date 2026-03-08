import { isSymbolDelimiter } from "../shared/util/strings.js";
import { Lexer } from "./lexer.js";
import { TokenSym } from "./tokens.js";

export function readSymbolTok(l: Lexer) {
    const pos = l.position;

    let literal = "";
    let quoted = false;

    read_loop: while (!l.is_done) {
        const ch = l.peek() as string;

        switch (ch) {
            case '|':
                quoted = !quoted;
                l.next();
                break;

            case '\\':
                l.next();
                if (l.is_done)
                    throw new Error("read symbol failed; unexpected \\");

                literal += l.next() as string;
                break;

            default:
                if (!quoted && isSymbolDelimiter(ch))
                    break read_loop;

                literal += l.next() as string;
                break;
        }
    }

    if (quoted)
        throw new Error("read symbol failed; expected a closing |");

    return TokenSym(literal, { pos });
}
