import { Token, TokenType, TokenIdent } from "./token.js";
import { ParenType, PartialExitCode, PAREN_TYPE_MAP, RPAREN_TYPE_MAP } from "./globals.js";
import { ASTNode, ASTSExprNode, ASTLiteralNode, ASTError } from "./ast.js";
import { Evaluator } from "./evaluator.js";

export class Parser {
    private toks: Token[] = [];
    private idx: number = 0;
    private paren_stack: ParenType[] = [];

    private get cur() { return this.toks[this.idx] ?? undefined; }

    public parse(toks: Token[]): { result: ASTNode, code: PartialExitCode } {
        this.toks = toks;
        this.idx = 0;

        const exprs: ASTNode[] = [];

        while (this.cur && this.cur.type !== TokenType.EOF) {
            const expr = this.parseExpression();
            if (expr.code !== PartialExitCode.SUCCESS) return expr;
            exprs.push(expr.result);
        }

        return {
            result: new ASTSExprNode(
                TokenIdent("begin"),
                ...exprs
            ),
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

        switch (this.cur.type) {
            case TokenType.LPAREN:
                return this.parseList();
            case TokenType.ERROR:
                return {
                    result: ASTError(
                        this.cur.literal,
                        this.cur.meta.row,
                        this.cur.meta.col,
                    ),
                    code: PartialExitCode.ERROR,
                }
            default: {
                const tok = this.cur;
                this.idx++;
                return {
                    result: new ASTLiteralNode(tok),
                    code: PartialExitCode.SUCCESS,
                }
            }
        }
    }

    private parseList(): { result: ASTNode, code: PartialExitCode } {
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
                        start.meta.row,
                        start.meta.col,
                    ),
                    code: PartialExitCode.INCOMPLETE,
                };
            }

            const expr = this.parseExpression();
            if (expr.code !== PartialExitCode.SUCCESS) return expr;

            elements.push(expr.result);
        }

        return {
            result: ASTError(
                `unterminated list; missing ${RPAREN_TYPE_MAP[PAREN_TYPE_MAP[start.literal]]}`,
                start.meta.row,
                start.meta.col,
            ),
            code: PartialExitCode.INCOMPLETE,
        };
    }
}
