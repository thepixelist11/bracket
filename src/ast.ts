import { TokenMetadata, Token, TokenError, TokenBool, TokenChar, TokenIdent, TokenNum, TokenStr, TokenSym, TokenVoid, TokenList, TokenType, BOOL_TRUE, TokenMetadataInjector, BOOL_FALSE } from "./token.js";
import { BracketEnvironment } from "./env.js";
import { Lexer } from "./lexer.js";
import { printDeep } from "./utils.js";

interface ASTBase {
    meta?: TokenMetadata;
}

export class ASTLiteralNode implements ASTBase {
    public tok: Token;
    public meta: TokenMetadata;

    constructor(tok: Token, meta?: TokenMetadata) {
        this.tok = tok;
        this.meta = meta ?? tok.meta;
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
        this.closure = new BracketEnvironment(name, env.ctx, env);
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

function ASTSExprNodeToSourceCode(ast: ASTSExprNode, unexpand_macros: boolean = true) {
    if (unexpand_macros) {
        let unexpanded: string[] | false;

        unexpanded = unexpandAnd(ast);
        if (unexpanded) return `(and ${unexpanded.join(" ")})`;

        unexpanded = unexpandOr(ast);
        if (unexpanded) return `(or ${unexpanded.join(" ")})`;

        unexpanded = unexpandVoid(ast);
        if (unexpanded) return `#<void>`;

        unexpanded = unexpandCond(ast);
        if (unexpanded) return `(cond (${unexpanded.join(" ")}))`;

        unexpanded = unexpandWhen(ast);
        if (unexpanded) return `(when ${unexpanded.join(" ")})`;
    }

    const elems = ast.elements;
    let results = [];

    for (const elem of elems) {
        results.push(ASTToSourceCode(elem));
    }

    return `(${results.join(" ").trim()})`;
}

function ASTProcedureNodeToSourceCode(ast: ASTProcedureNode) {
    const bodies = ast.body;
    const params = ast.params;

    const param_list = `(${params.join(" ").trim()})`;
    const body_list = `${bodies.map(ASTToSourceCode).join(" ").trim()}`;

    return `(lambda ${param_list} ${body_list})`;
}

function ASTLiteralNodeToSourceCode(ast: ASTLiteralNode) {
    const tok = ast.tok;

    switch (tok.type) {
        case TokenType.ERROR:
        case TokenType.EOF:
        case TokenType.ANY:
            return "";

        case TokenType.VOID:
            return "#<void>";

        case TokenType.LPAREN:
            return "(";

        case TokenType.RPAREN:
            return ")";

        case TokenType.IDENT:
        case TokenType.NUM:
            return tok.literal;

        case TokenType.SYM: {
            if (tok.literal.split("").some(ch => Lexer.isIllegalIdentChar(ch)))
                return `'|${tok.literal}|`;
            else
                return `'${tok.literal}`;
        }

        case TokenType.BOOL:
            return tok.literal === BOOL_TRUE ? "#t" : "#f";

        case TokenType.STR:
            return `"${tok.literal}"`;

        case TokenType.CHAR:
            return `#\\${tok.literal}`;

        case TokenType.PROCEDURE: {
            return ASTProcedureNodeToSourceCode(tok.value as ASTProcedureNode);
        }

        case TokenType.LIST:
        case TokenType.FORM: {
            const toks = tok.value as Token[];
            let result = "'(";
            for (const tok of toks)
                result += ASTLiteralNodeToSourceCode(new ASTLiteralNode(tok));

            return result.trim() + ")";
        }

        case TokenType.QUOTE:
            return `'`;

        case TokenType.FORM: {
            const toks = tok.value as Token[];
            let result = "(";
            for (const tok of toks)
                result += ASTLiteralNodeToSourceCode(new ASTLiteralNode(tok));

            return result.trim() + ")";
        }

        case TokenType.META: {
            const meta = Object.entries((tok.value as TokenMetadataInjector).meta);
            let result: string[] = [];

            for (const [key, value] of meta)
                result.push(`#meta ${key} ${typeof value === "number" ? value : '"' + value + '"'}`);

            return result.join("\n");
        }
    }
}

function unexpandAnd(ast: ASTSExprNode): string[] | false {
    if (ast.elements.length !== 4) return false;

    const if_node = ast.elements[0];
    const test1 = ast.elements[1];
    const test2 = ast.elements[2];
    const final = ast.elements[3];

    if (if_node.meta?.__macro && if_node.meta.__macro !== "and") return false;

    let params: string[] = [];

    if (!(if_node instanceof ASTLiteralNode) ||
        if_node.tok.type !== TokenType.IDENT ||
        if_node.tok.literal !== "if") return false;

    if (!(final instanceof ASTLiteralNode) ||
        final.tok.type !== TokenType.BOOL ||
        final.tok.literal !== BOOL_FALSE) return false;

    for (const branch of [test1, test2]) {
        if (branch instanceof ASTLiteralNode) {
            params.push(ASTLiteralNodeToSourceCode(branch));
        } else if (branch instanceof ASTSExprNode) {
            const nested_and = unexpandAnd(branch);
            if (nested_and)
                params.push(...nested_and);
            else
                params.push(ASTSExprNodeToSourceCode(branch));
        }
    }

    return params;
}

function unexpandOr(ast: ASTSExprNode): string[] | false {
    if (ast.elements.length !== 4) return false;

    const if_node = ast.elements[0];
    const test = ast.elements[1];
    const true_node = ast.elements[2];
    const final = ast.elements[3];

    if (if_node.meta?.__macro && if_node.meta.__macro !== "or") return false;

    let params: string[] = [];

    if (!(if_node instanceof ASTLiteralNode) ||
        if_node.tok.type !== TokenType.IDENT ||
        if_node.tok.literal !== "if") return false;

    if (!(true_node instanceof ASTLiteralNode) ||
        true_node.tok.type !== TokenType.BOOL ||
        true_node.tok.literal !== BOOL_TRUE) return false;

    for (const branch of [test, final]) {
        if (branch instanceof ASTLiteralNode) {
            params.push(ASTLiteralNodeToSourceCode(branch));
        } else if (branch instanceof ASTSExprNode) {
            const nested_or = unexpandOr(branch);
            if (nested_or)
                params.push(...nested_or);
            else
                params.push(ASTSExprNodeToSourceCode(branch));
        }
    }

    return params;
}

function unexpandVoid(ast: ASTSExprNode): string[] | false {
    if (ast.elements.length !== 1) return false;
    if (!(ast.elements[0] instanceof ASTLiteralNode) ||
        ast.elements[0].tok.type !== TokenType.IDENT ||
        ast.elements[0].tok.literal !== "void") return false;

    return [];
}

function unexpandWhen(ast: ASTSExprNode): string[] | false {
    if (ast.elements.length !== 4) return false;

    const if_node = ast.elements[0];
    const test = ast.elements[1];
    const then = ast.elements[2];
    const void_node = ast.elements[3];

    if (if_node.meta?.__macro && if_node.meta.__macro !== "when") return false;

    let params: string[] = [];

    if (!(if_node instanceof ASTLiteralNode) ||
        if_node.tok.type !== TokenType.IDENT ||
        if_node.tok.literal !== "if") return false;

    if (!(void_node instanceof ASTLiteralNode) ||
        void_node.tok.type !== TokenType.VOID ||
        void_node.tok.literal !== "") return false;

    for (const branch of [test, then]) {
        params.push(ASTToSourceCode(branch));
    }

    return params;
}

function unexpandCond(ast: ASTSExprNode): string[] | false {
    // return new ASTSExprNode(
    //     ASTIdent("if"),
    //     test,
    //     value,
    //     rest.length > 0 ? new ASTSExprNode(
    //         TokenIdent("cond"),
    //         ...rest,
    //     ) : ASTVoid(),
    // )

    // TODO:

    return false;
}

export function ASTToSourceCode(ast: ASTNode | ASTProgram): string {
    const forms = ast instanceof ASTProgram ? ast.forms : [ast];
    let results: string[] = [];

    for (const form of forms) {
        if (form instanceof ASTSExprNode) {
            results.push(ASTSExprNodeToSourceCode(form));
        } else if (form instanceof ASTLiteralNode) {
            results.push(ASTLiteralNodeToSourceCode(form));
        } else if (form instanceof ASTProcedureNode) {
            results.push(ASTProcedureNodeToSourceCode(form));
        }
    }

    return results.join("\n");
}
