import { Token } from "../lexer/tokens.js";
import { Stream } from "../shared/data-structures/stream.js";

export class Reader extends Stream<Token> {
    private constructor(toks: Stream<Token>) {
        super(toks);
    }

    static read(toks: Stream<Token>) {
        const r = new Reader(toks);
    }
}
