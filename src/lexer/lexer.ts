import { PositionalStream, Stream } from "../shared/data-structures/stream.js";
import { readStringTok } from "./read-string-tok.js";
import { readByteStringTok } from "./read-byte-string-tok.js";
import { isSequenceDelimiter, isWhitespace } from "../shared/util/strings.js";
import { readSequence, readSequenceTok } from "./read-sequence-tok.js";
import { Ok, Result } from "../shared/data-structures/result.js";
import {
    getParenKind,
    Token,
    TokenBool,
    TokenDatumComment,
    TokenDot,
    TokenEOF,
    TokenError,
    TokenKeyword,
    TokenLineComment,
    TokenLParen,
    TokenMetadata,
    TokenQuasiquote,
    TokenQuote,
    TokenRParen,
    TokenShebang,
    TokenUnquote,
    TokenUnquoteSplicing,
    TokenVectorStart,
} from "./tokens.js";
import {
    LexerError,
    LexerErrorKind,
    toLexerError,
    unexpectedSyntax,
} from "./lexer-errors.js";

export class Lexer extends PositionalStream {
    static lex(src: string): Result<Stream<Token>, LexerError> {
        const toks: Token[] = [];
        const l = new Lexer(src);

        l.skipWhitespace();

        while (!l.is_done) {
            const next_tok = l.readNextToken();

            if (next_tok.is_err()) {
                const err = next_tok.err();
                toks.push(
                    TokenError({
                        msg: err.message,
                        kind: err.kind,
                        pos: err.pos,
                    }),
                );
            } else {
                toks.push(next_tok.val());
            }

            l.skipWhitespace();
        }

        toks.push(TokenEOF());

        return Ok(new Stream(toks));
    }

    public skipWhitespace() {
        this.readWhile(isWhitespace);
    }

    public skipWhitespaceOnLine() {
        this.readWhile((ch) => ch !== "\n" && isWhitespace(ch));
    }

    private readNextToken(): Result<Token, LexerError> {
        const [c0, c1] = this.peekN(2);
        const meta: TokenMetadata = { pos: this.position };

        switch (c0) {
            case "(":
            case "[":
            case "{": {
                this.next();
                const type = getParenKind(c0);
                if (type.is_err())
                    return type.map_err((x) =>
                        toLexerError(
                            x,
                            LexerErrorKind.UnexpectedSyntax,
                            meta.pos,
                        ),
                    );

                return Ok(TokenLParen(type.val(), meta));
            }

            case ";": {
                this.next();
                this.skipWhitespaceOnLine();

                return Ok(
                    TokenLineComment(
                        this.readWhile((ch) => ch !== "\n").join(""),
                        meta,
                    ),
                );
            }

            case ")":
            case "]":
            case "}": {
                this.next();
                const type = getParenKind(c0);
                if (type.is_err())
                    return type.map_err((x) =>
                        toLexerError(
                            x,
                            LexerErrorKind.UnexpectedSyntax,
                            meta.pos,
                        ),
                    );

                return Ok(TokenRParen(type.val(), meta));
            }

            case "'":
                this.next();
                return Ok(TokenQuote(meta));

            case "`":
                this.next();
                return Ok(TokenQuasiquote(meta));

            case ",":
                this.next();

                if (c1 === "@") {
                    this.next();
                    return Ok(TokenUnquoteSplicing(meta));
                }

                return Ok(TokenUnquote(meta));

            case ".": {
                if (isSequenceDelimiter(c1)) {
                    this.next();
                    return Ok(TokenDot(meta));
                }

                return readSequenceTok(this);
            }

            case '"':
                return readStringTok(this);

            case "#": {
                switch (c1) {
                    case '"':
                        return readByteStringTok(this);

                    case "t":
                    case "T":
                        this.nextN(2);
                        return Ok(TokenBool(true, meta));

                    case "f":
                    case "F":
                        this.nextN(2);
                        return Ok(TokenBool(false, meta));

                    case "!":
                        this.nextN(2);
                        return Ok(
                            TokenShebang(
                                this.readWhile((ch) => ch !== "\n").join(""),
                                meta,
                            ),
                        );

                    case ":":
                        this.nextN(2);
                        const keyword = readSequence(this);
                        if (keyword.is_err()) return keyword;

                        const keyword_str = keyword.unwrap();
                        if (keyword_str.length === 0)
                            return unexpectedSyntax(
                                `invalid keyword; expected a valid symbol following #:`,
                            );

                        return Ok(TokenKeyword(keyword_str, meta));

                    case ";":
                        this.nextN(2);
                        return Ok(TokenDatumComment(meta));

                    case "(":
                        this.nextN(2);
                        return Ok(TokenVectorStart(meta));

                    default:
                        this.nextN(2);
                        return unexpectedSyntax(`bad syntax: #${c1}`, meta.pos);
                }
            }

            default:
                return readSequenceTok(this);
        }
    }
}
