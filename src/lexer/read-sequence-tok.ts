import { Err, Ok, Result } from "../shared/data-structures/result.js";
import { LexerError } from "../shared/errors.js";
import { isSequenceDelimiter } from "../shared/util/strings.js";
import { Lexer } from "./lexer.js";
import { Token, TokenSeq } from "./tokens.js";

export function readSequenceTok(l: Lexer): Result<Token, LexerError> {
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
                    return Err(
                        new Error("read sequence failed; unexpected \\")
                    );

                literal += l.next() as string;
                break;

            default:
                if (!quoted && isSequenceDelimiter(ch))
                    break read_loop;

                literal += l.next() as string;
                break;
        }
    }

    if (quoted)
        return Err(
            new LexerError("read sequence failed; expected a closing |")
        );

    return Ok(TokenSeq(literal, { pos }));
}
