import { SourceLocation } from "../../shared/source-location.js";
import { Stream } from "../../shared/data-structures/stream.js";
import { Token } from "../tokens/tokens.js";

export class Lexer {
    private _src_stream: Stream<string>;
    private _idx: number;
    private _loc: SourceLocation;

    private constructor(src: string) {
        this._src_stream = new Stream<string>(src);
        this._idx = 0;
        this._loc = {
            row: 0,
            col: 0,
            file: "",
            idx: 0,
        };
    }

    get src() { return this._src_stream; }

    static lex(src: string): Stream<Token> {
        const stream = new Stream<Token>();
        const lexer = new Lexer(src);

        while (!lexer.src.is_done()) {
            console.log(lexer.src.next());
        }

        return stream;
    }
}
