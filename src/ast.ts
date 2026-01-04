import { TokenMetadata, Token, TokenError, TokenBool, TokenChar, TokenIdent, TokenNum, TokenStr, TokenSym, TokenVoid, TokenList } from "./token.js";
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
        this.closure.define(name, ASTVoid(this.meta));
    }
}

export class ASTProgram {
    constructor(public forms: ASTNode[], public name: string = "") { };
}

export type ASTNode = ASTLiteralNode | ASTSExprNode | ASTProcedureNode;

export function ASTIdent(name: string, meta?: TokenMetadata): ASTLiteralNode {
    return new ASTLiteralNode(TokenIdent(name, meta));
}

export function ASTSym(name: string, meta?: TokenMetadata): ASTLiteralNode {
    return new ASTLiteralNode(TokenSym(name, meta));
}

export function ASTNum(value: number | string, meta?: TokenMetadata): ASTLiteralNode {
    return new ASTLiteralNode(TokenNum(value, meta));
}

export function ASTBool(value: boolean | string, meta?: TokenMetadata): ASTLiteralNode {
    return new ASTLiteralNode(TokenBool(value, meta));
}

export function ASTVoid(meta?: TokenMetadata): ASTLiteralNode {
    return new ASTLiteralNode(TokenVoid(meta));
}

export function ASTStr(value: string, meta?: TokenMetadata): ASTLiteralNode {
    return new ASTLiteralNode(TokenStr(value, meta));
}

export function ASTChar(value: string, meta?: TokenMetadata): ASTLiteralNode {
    return new ASTLiteralNode(TokenChar(value, meta));
}

export function ASTError(msg: string, meta?: TokenMetadata): ASTLiteralNode {
    return new ASTLiteralNode(TokenError(msg, meta));
}

export function ASTList(elems: Token[], meta?: TokenMetadata): ASTLiteralNode {
    return new ASTLiteralNode(TokenList(elems, meta));
}

export function ASTCall(op: string, meta?: TokenMetadata, ...args: ASTNode[]): ASTSExprNode {
    return new ASTSExprNode(ASTIdent(op, meta), ...args);
}

