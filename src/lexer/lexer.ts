import { PositionalStream, Stream } from "../shared/data-structures/stream.js";
import { getParenKind, Token, TokenBool, TokenDot, TokenEllipsis, TokenEOF, TokenLParen, TokenMetadata, TokenQuasiquote, TokenQuote, TokenRParen, TokenUnquote, TokenUnquoteSplicing } from "./tokens.js";
import { readStringTok } from "./read-string-tok.js";
import { readByteStringTok } from "./read-byte-string-tok.js";
import { isSequenceDelimiter, isWhitespace } from "../shared/util/strings.js";
import { readSequenceTok } from "./read-sequence-tok.js";
import { LexerError } from "../shared/errors.js";
import { Ok, Result } from "../shared/data-structures/result.js";

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
    public consumeIfThen(pred: (item: string) => boolean, cb: (s: Stream<string>) => void) { return this.src.consumeIfThen(pred, cb) }
    public expect(pred: (item: string) => boolean, msg?: string) { return this.src.expect(pred, msg) }
    public expectN(pred: (item: string[]) => boolean, n: number, msg?: string) { return this.src.expectN(pred, n, msg) }
    public mark() { return this.src.mark() }
    public unmark(mark: number) { return this.src.unmark(mark) }
    public restore(mark: number) { return this.src.restore(mark) }

    static lex(src: string): Result<Stream<Token>, LexerError> {
        const toks: Token[] = [];
        const l = new Lexer(src);

        while (!l.src.is_done) {
            const next_tok = l.readNextToken();
            toks.push(next_tok.val());
            l.skipWhitespace();
        }

        toks.push(TokenEOF());

        return Ok(new Stream(toks));
    }

    public skipWhitespace() {
        this.src.readWhile(isWhitespace);
    }

    private readNextToken(): Result<Token, LexerError> {
        this.skipWhitespace();

        const [c0, c1, c2, c3] = this.src.peekN(4);
        const meta: TokenMetadata = { pos: this.src.position };

        switch (c0) {
            case "(":
            case "[":
            case "{": {
                this.next();
                const type = getParenKind(c0);
                if (type.is_err()) return type.map_err(x => new LexerError(x.message));

                return Ok(
                    TokenLParen(type.val(), meta)
                );
            }

            case ")":
            case "]":
            case "}": {
                this.next();
                const type = getParenKind(c0);
                if (type.is_err()) return type.map_err(x => new LexerError(x.message));

                return Ok(
                    TokenRParen(type.val(), meta)
                );
            }

            case "'":
                this.next();
                return Ok(
                    TokenQuote(meta)
                );

            case "`":
                this.next();
                return Ok(
                    TokenQuasiquote(meta)
                );

            case ",":
                this.next();
                return Ok(
                    TokenUnquote(meta)
                );

            case "@":
                if (c1 === ",") {
                    this.nextN(2);
                    return Ok(
                        TokenUnquoteSplicing(meta)
                    );
                }

            case '.': {
                if (c1 === "." && c2 === "." && isSequenceDelimiter(c3)) {
                    this.nextN(3);
                    return Ok(
                        TokenEllipsis(meta)
                    );
                }

                if (isSequenceDelimiter(c1)) {
                    this.next();
                    return Ok(
                        TokenDot(meta)
                    );
                }

                return readSequenceTok(this);
            }

            case '"':
                return Ok(
                    readStringTok(this)
                );

            // TODO: General dispatch token, move this to Reader.
            case '#': {
                switch (c1) {
                    case '"':
                        return readByteStringTok(this);

                    case 't':
                    case 'T':
                        this.next();
                        return Ok(
                            TokenBool(false, meta)
                        );

                    case 'f':
                    case 'F':
                        this.next();
                        return Ok(
                            TokenBool(false, meta)
                        );
                }
            }

            default:
                return readSequenceTok(this);
        }
    }
}
