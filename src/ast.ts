import { TokenMetadata, Token, TokenError, TokenBool, TokenChar, TokenIdent, TokenNum, TokenStr, TokenSym, TokenVoid } from "./token.js";
import { Evaluator } from "./evaluator.js";
import { BracketEnvironment } from "./env.js";

interface ASTBase {
    meta?: TokenMetadata;
}

export class ASTLiteralNode implements ASTBase {
    public tok: Token;
    public meta: TokenMetadata;

    constructor(tok: Token) {
        this.tok = tok;
        this.meta = tok.meta;
    }
}

export class ASTSExprNode implements ASTBase {
    public elements: ASTNode[] = [];
    public meta?: TokenMetadata;

    constructor(...elements: (ASTNode | Token)[]) {
        this.elements = elements.map(e =>
            e instanceof Token ? new ASTLiteralNode(e) : e
        )

        if (this.elements.length === 0)
            this.meta = { row: -1, col: -1 };
        else
            this.meta = this.elements[0].meta;
    }

    get first() { return this.elements[0]; }
    get rest() { return this.elements.slice(1); }
    get last() { return this.elements.at(-1)!; }
}

export class ASTProcedureNode implements ASTBase {
    public params: string[];
    public body: ASTNode[];
    public closure: BracketEnvironment;
    public meta?: TokenMetadata;

    constructor(name: string, params: string[], body: ASTNode[], env: BracketEnvironment) {
        this.params = params;
        this.body = body;
        this.closure = new BracketEnvironment(name, env);
        this.closure.define(name, ASTVoid());
    }
}

export type ASTNode = ASTLiteralNode | ASTSExprNode | ASTProcedureNode;


export function ASTIdent(name: string): ASTLiteralNode {
    return new ASTLiteralNode(TokenIdent(name));
}

export function ASTSym(name: string): ASTLiteralNode {
    return new ASTLiteralNode(TokenSym(name));
}

export function ASTNum(value: number): ASTLiteralNode {
    return new ASTLiteralNode(TokenNum(value));
}

export function ASTBool(value: boolean): ASTLiteralNode {
    return new ASTLiteralNode(TokenBool(value));
}

export function ASTVoid(): ASTLiteralNode {
    return new ASTLiteralNode(TokenVoid());
}

export function ASTStr(value: string): ASTLiteralNode {
    return new ASTLiteralNode(TokenStr(value));
}

export function ASTChar(value: string): ASTLiteralNode {
    return new ASTLiteralNode(TokenChar(value));
}

export function ASTError(msg: string, row: number = -1, col: number = -1): ASTLiteralNode {
    return new ASTLiteralNode(TokenError(msg, row, col));
}

export function ASTCall(op: string, ...args: ASTNode[]): ASTSExprNode {
    return new ASTSExprNode(ASTIdent(op), ...args);
}


