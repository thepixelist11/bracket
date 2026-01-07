import { Token, TokenList, TokenMetadataInjector, TokenType, TokenVoid } from "./token.js";
import { PartialExitCode, PAREN_TYPE_MAP, RPAREN_TYPE_MAP, InterpreterContext, getDefaultReaderFeatures, LANG_NAME, VERSION_NUMBER } from "./globals.js";
import { ASTNode, ASTSExprNode, ASTLiteralNode, ASTError, ASTProgram } from "./ast.js";

export class Parser {
    private toks: Token[] = [];
    private idx: number = 0;
    private meta_injector_stack: TokenMetadataInjector[] = [];

    ctx: InterpreterContext = {
        file_directives: new Map(),
        features: new Set(),
    }

    constructor(features: string[] | Set<string> = [], file_directives: Map<string, string> = new Map()) {
        this.ctx.features = new Set([
            ...features,
            ...getDefaultReaderFeatures(LANG_NAME, VERSION_NUMBER)
        ]);

        this.ctx.file_directives = file_directives;
    }

    private get cur() { return this.toks[this.idx] ?? undefined; }

    public parse(toks: Token[], name?: string): { result: ASTProgram | ASTNode, code: PartialExitCode } {
        this.toks = toks;
        this.idx = 0;

        const forms: ASTNode[] = [];

        while (this.cur && this.cur.type !== TokenType.EOF) {
            const expr = this.parseExpression();
            if (expr.code !== PartialExitCode.SUCCESS) {
                return {
                    result: expr.result,
                    code: expr.code
                };
            }

            forms.push(expr.result);
        }

        return {
            result: new ASTProgram(forms, name),
            code: PartialExitCode.SUCCESS
        };
    }

    private parseExpression(): { result: ASTNode, code: PartialExitCode } {
        if (!this.cur) {
            return {
                result: ASTError("unexpected end of input"),
                code: PartialExitCode.INCOMPLETE,
            };
        }

        // Any assertion to prevent overly specific type narrowing
        switch (this.cur.type as any) {
            case TokenType.LPAREN: {
                return this.parseSExpr();
            }

            case TokenType.META: {
                this.injectMetadata();
                return {
                    result: new ASTLiteralNode(TokenVoid()),
                    code: PartialExitCode.SUCCESS
                };
            }

            case TokenType.QUOTE: {
                const quote_tok = this.cur;
                this.idx++;
                const inner_tok = quote_tok.value as Token;

                if (!inner_tok || inner_tok.type !== TokenType.LIST) {
                    return {
                        result: ASTError("quoted expression must be a list"),
                        code: PartialExitCode.ERROR
                    };
                }

                const meta = this.cur.meta;
                const elems: Token[] = [];
                for (const tok of inner_tok.value as Token[]) {
                    const saved_toks = this.toks;
                    const saved_idx = this.idx;

                    this.toks = [tok];
                    this.idx = 0;

                    const { result, code } = this.parseExpression();
                    if (code !== PartialExitCode.SUCCESS) {
                        this.toks = saved_toks;
                        this.idx = saved_idx;
                        return { result, code };
                    }

                    if (!(result instanceof ASTLiteralNode)) {
                        return {
                            result: ASTError("expected a literal node"),
                            code: PartialExitCode.ERROR
                        };
                    }

                    elems.push(result.tok);

                    this.toks = saved_toks;
                    this.idx = saved_idx;
                }

                const list = new ASTLiteralNode(TokenList(elems, meta));
                return { result: list, code: PartialExitCode.SUCCESS };
            }

            case TokenType.ERROR: {
                return {
                    result: ASTError(
                        this.cur.literal,
                        this.cur.meta,
                    ),
                    code: PartialExitCode.ERROR,
                }
            }

            default: {
                const tok = this.cur;
                this.idx++;

                if (tok.type !== TokenType.LPAREN && tok.type !== TokenType.RPAREN) {
                    for (let i = 0; i < this.meta_injector_stack.length; i++) {
                        const injector = this.meta_injector_stack[i];
                        if (!injector.pred || injector.pred(tok)) {
                            tok.meta = { ...tok.meta, ...injector.meta };
                            this.meta_injector_stack.splice(i--, 1);
                        }
                    }
                }

                return {
                    result: new ASTLiteralNode(tok),
                    code: PartialExitCode.SUCCESS,
                }
            }
        }
    }

    private injectMetadata() {
        const injector = this.cur.value as TokenMetadataInjector;
        this.meta_injector_stack.push(injector);
        this.idx++;
    }

    private parseSExpr(): { result: ASTNode, code: PartialExitCode } {
        const start = this.cur;
        const elements: ASTNode[] = [];
        this.idx++;

        while (this.cur) {
            if (this.cur.type === TokenType.RPAREN) {
                this.idx++;
                return {
                    result: new ASTSExprNode(...elements),
                    code: PartialExitCode.SUCCESS,
                };
            }

            if (this.cur.type === TokenType.EOF) {
                return {
                    result: ASTError(
                        `unterminated list; missing ${RPAREN_TYPE_MAP[PAREN_TYPE_MAP[start.literal]]}`,
                        start.meta,
                    ),
                    code: PartialExitCode.INCOMPLETE,
                };
            }

            if (this.cur.type === TokenType.VOID) {
                this.idx++;
                continue;
            }

            if (this.cur.type === TokenType.META) {
                this.injectMetadata();
                continue;
            }

            const expr = this.parseExpression();
            if (expr.code !== PartialExitCode.SUCCESS) return expr;

            elements.push(expr.result);
        }

        return {
            result: ASTError(
                `unterminated list; missing ${RPAREN_TYPE_MAP[PAREN_TYPE_MAP[start.literal]]}`,
                start.meta,
            ),
            code: PartialExitCode.INCOMPLETE,
        };
    }
}
