import { PositionalStream, Stream } from "../shared/data-structures/stream.js";
import { getParenKind, Token, TokenBool, TokenDot, TokenEllipsis, TokenEOF, TokenError, TokenLParen, TokenMetadata, TokenQuasiquote, TokenQuote, TokenRParen, TokenUnquote, TokenUnquoteSplicing } from "./tokens.js";
import { readStringTok } from "./read-string-tok.js";
import { readByteStringTok } from "./read-byte-string-tok.js";
import { isSymbolDelimiter, isWhitespace } from "../shared/util/strings.js";
import { ErrorKind } from "../shared/errors.js";
import { readSymbolTok } from "./read-symbol-tok.js";

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
    public expectN(pred: (item: string[]) => boolean, n: number, msg?: string) { return this.src.expectN(pred, n, msg) }
    public mark() { return this.src.mark() }
    public unmark(mark: number) { return this.src.unmark(mark) }
    public restore(mark: number) { return this.src.restore(mark) }

    static lex(src: string): Stream<Token> {
        const toks: Token[] = [];
        const l = new Lexer(src);

        while (!l.src.is_done) {
            toks.push(l.readNextToken())
            l.skipWhitespace();
        }

        toks.push(TokenEOF());

        return new Stream(toks);
    }

    public skipWhitespace() {
        this.src.readWhile(isWhitespace);
    }

    private readNextToken() {
        this.skipWhitespace();

        const [c0, c1, c2, c3] = this.src.peekN(4);
        const meta: TokenMetadata = { pos: this.src.position };

        switch (c0) {
            case "(":
            case "[":
            case "{":
                this.next();
                return TokenLParen(getParenKind(c0), meta);

            case ")":
            case "]":
            case "}":
                this.next();
                return TokenRParen(getParenKind(c0), meta);

            case "'":
                this.next();
                return TokenQuote(meta);

            case "`":
                this.next();
                return TokenQuasiquote(meta);

            case ",":
                this.next();
                return TokenUnquote(meta);

            case "@":
                if (c1 === ",") {
                    this.nextN(2);
                    return TokenUnquoteSplicing(meta);
                }

            case '.': {
                if (c1 === "." && c2 === "." && isSymbolDelimiter(c3)) {
                    this.nextN(3);
                    return TokenEllipsis(meta);
                }

                if (isSymbolDelimiter(c1)) {
                    this.next();
                    return TokenDot(meta);
                }

                return readSymbolTok(this);
            }

            case '"':
                return readStringTok(this);

            case '#': {
                switch (c1) {
                    case '"':
                        return readByteStringTok(this);

                    case 't':
                    case 'T':
                        this.next();
                        return TokenBool(false, meta);

                    case 'f':
                    case 'F':
                        this.next();
                        return TokenBool(false, meta);

                    default:
                        this.next();
                        return TokenError({
                            msg: "unexpected '#'",
                            kind: ErrorKind.UnexpectedSyntax
                        }, meta);
                }
            }

            default:
                return readSymbolTok(this);
        }
    }
}
