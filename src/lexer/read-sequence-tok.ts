import { Ok, Result } from "../shared/data-structures/result.js";
import { isSequenceDelimiter } from "../shared/util/strings.js";
import { LexerError, unexpectedSyntax } from "./lexer-errors.js";
import { Lexer } from "./lexer.js";
import { Token, TokenSeq } from "./tokens.js";

export function readSequence(l: Lexer): Result<string, LexerError> {
    const pos = l.position;
    let literal = "";
    let quoted = false;
    let last_was_quoted = false;

    read_loop: while (!l.is_done) {
        const ch = l.peek() as string;

        switch (ch) {
            case "|":
                quoted = !quoted;
                l.next();
                break;

            case "\\":
                l.next();
                if (l.is_done)
                    return unexpectedSyntax(
                        "read sequence failed; unexpected \\",
                        pos,
                    );

                literal += l.next() as string;
                last_was_quoted = quoted;
                break;

            default:
                if (!quoted && isSequenceDelimiter(ch)) break read_loop;

                literal += l.next() as string;
                last_was_quoted = quoted;
                break;
        }
    }

    if (quoted)
        return unexpectedSyntax(
            "read sequence failed; expected a closing |",
            pos,
        );

    if (literal === "." && !last_was_quoted)
        return unexpectedSyntax("illegal use of .", pos);

    return Ok(literal);
}

export function readSequenceTok(l: Lexer): Result<Token, LexerError> {
    const pos = l.position;

    const literal = readSequence(l);
    if (literal.is_err()) return literal;

    return Ok(TokenSeq(literal.unwrap(), { pos }));
}
