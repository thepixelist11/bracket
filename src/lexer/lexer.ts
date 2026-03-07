import { PositionalStream, Stream } from "../shared/data-structures/stream.js";
import { getParenKind, Token, TokenDot, TokenEllipsis, TokenEOF, TokenLParen, TokenMetadata, TokenQuasiquote, TokenQuote, TokenRParen, TokenUnquote } from "./tokens.js";
import { readStringTok } from "./read-string-tok.js";
import { readByteStringTok } from "./read-byte-string-tok.js";

export class Lexer {
    private _src_stream: PositionalStream;

    private constructor(src: string) {
        this._src_stream = new PositionalStream(src);
    }

    get src() { return this._src_stream }
    get is_done() { return this.src.is_done }
    get size() { return this.src.size }
    get idx() { return this.src.idx }
    get position() { return this.src.position }

    public peek() { return this.src.peek() }
    public peekN(n: number) { return this.src.peekN(n) }
    public next() { return this.src.next() }
    public nextN(n: number) { return this.src.nextN(n) }
    public readWhile(pred: (item: string) => boolean) { return this.src.readWhile(pred) }
    public readWhileN(pred: (item: string) => boolean, n: number) { return this.src.readWhileN(pred, n) }
    public peekWhile(pred: (item: string) => boolean) { return this.src.peekWhile(pred) }
    public peekWhileN(pred: (item: string) => boolean, n: number) { return this.src.peekWhileN(pred, n) }
    public consumeIf(pred: (item: string) => boolean) { return this.src.consumeIf(pred) }
    public expect(pred: (item: string) => boolean, msg?: string) { return this.src.expect(pred, msg) }
    public mark() { return this.src.mark() }
    public unmark(mark: number) { return this.src.unmark(mark) }
    public restore(mark: number) { return this.src.restore(mark) }

    static lex(src: string): Stream<Token> {
        const toks: Token[] = [];
        const l = new Lexer(src);

        while (!l.src.is_done) {
            toks.push(l.readNextToken())
        }

        toks.push(TokenEOF());

        return new Stream(toks);
    }

    private readNextToken() {
        const [cur, next, next2] = this.src.peekN(3);
        const meta: TokenMetadata = { pos: this.src.position };
        switch (cur) {
            case "(":
            case "[":
            case "{":
                this.next();
                return TokenLParen(getParenKind(cur), meta);

            case ")":
            case "]":
            case "}":
                this.next();
                return TokenRParen(getParenKind(cur), meta);

            case "'":
                this.next();
                return TokenQuote(meta);

            case "`":
                this.next();
                return TokenQuasiquote(meta);

            case "@":
                if (next === ",") {
                    this.nextN(2);
                    return TokenUnquote(meta);
                }

            case ".":
                if (next === "." && next2 === ".") {
                    this.nextN(3);
                    return TokenEllipsis(meta);
                } else {
                    this.next();
                    return TokenDot(meta);
                }

            case '"':
                return readStringTok(this);

            case '#': {
                switch (next) {
                    case '"':
                        return readByteStringTok(this);

                    default:
                        return TokenEOF(meta); // TODO: # ident token
                }
            }

            default:
                this.next();
                return TokenEOF(meta);
        }
    }
}
