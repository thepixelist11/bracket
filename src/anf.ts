import { ASTLiteralNode, ASTNode, ASTProcedureNode, ASTSExprNode } from "./ast.js";
import { RuntimeSymbol, TokenMetadata, Token, TokenType, TokenUninternedSym, TokenVoid } from "./token.js";

export interface ANFBase {
    meta?: TokenMetadata
}

export class ANFVar implements ANFBase {
    constructor(
        public name: RuntimeSymbol,
        public meta?: TokenMetadata
    ) { }
}

export class ANFLiteral implements ANFBase {
    constructor(
        public value: Token,
        public meta?: TokenMetadata
    ) { }
}

export class ANFLambda implements ANFBase {
    constructor(
        public params: RuntimeSymbol[],
        public body: ANFExpr,
        public meta?: TokenMetadata
    ) { }
}

export class ANFLet implements ANFBase {
    constructor(
        public name: RuntimeSymbol,
        public value: ANFExpr,
        public body: ANFExpr,
        public meta?: TokenMetadata
    ) { }
}

export class ANFApp implements ANFBase {
    constructor(
        public callee: ANFAtom,
        public args: ANFAtom[],
        public meta?: TokenMetadata
    ) { }
}

export class ANFIf implements ANFBase {
    constructor(
        public cond: ANFAtom,
        public then_branch: ANFExpr,
        public else_branch: ANFExpr,
        public meta?: TokenMetadata
    ) { }
}

export class ANFProgram {
    constructor(
        public body: ANFExpr,
        public name: string = ""
    ) {
        if (body instanceof ANFApp) {
            const temp = makeTemp();
            return new ANFProgram(
                new ANFLet(temp, body, new ANFVar(temp)),
                name,
            );
        }
    }
}

export type ANFAtom =
    | ANFVar
    | ANFLiteral
    | ANFLambda;

export type ANFExpr =
    | ANFAtom
    | ANFLet
    | ANFIf
    | ANFApp;

export type ANF =
    | ANFAtom
    | ANFExpr;

function isCall(node: ASTNode) {
    if (!(node instanceof ASTSExprNode))
        return false;

    const op_node = node.first;

    if (!(op_node instanceof ASTLiteralNode))
        return false;

    if (op_node.tok.type !== TokenType.IDENT)
        return false;

    return true;
}

function isLambda(node: ASTNode) {
    if (!isCall(node)) return false;

    const lambda = node as ASTSExprNode;

    return (
        (lambda.first as ASTLiteralNode).tok.literal === "lambda" ||
        (lambda.first as ASTLiteralNode).tok.literal === "λ"
    );
}

function isIf(node: ASTNode) {
    if (!isCall(node)) return false;

    const if_node = node as ASTSExprNode;

    return (
        (if_node.first as ASTLiteralNode).tok.literal === "if"
    );
}

function makeTemp(meta?: TokenMetadata) {
    return TokenUninternedSym("v", false, meta).value;
}

function wrapLets(lets: ANFLet[], body: ANFExpr): ANFExpr {
    return lets.reduceRight(
        (acc, l) => new ANFLet(l.name, l.value, acc, l.meta),
        body
    );
}

export class ANFCompiler {
    static makeANFExpr(node: ASTNode): ANFExpr {
        if (isIf(node)) {
            const if_node = node as ASTSExprNode;

            const [cond, then_branch, else_branch] = if_node.elements.slice(1);

            const cond_atomic = ANFCompiler.makeANFAtom(cond);

            return wrapLets(
                cond_atomic.lets,
                new ANFIf(
                    cond_atomic.atom,
                    ANFCompiler.makeANFExpr(then_branch),
                    ANFCompiler.makeANFExpr(else_branch),
                    if_node.meta
                )
            );

        } else if (node instanceof ASTLiteralNode) {
            if (node.tok.type === TokenType.IDENT)
                return new ANFVar(node.tok.value as RuntimeSymbol, node.meta);
            else
                return new ANFLiteral(node.tok, node.meta);

        } else if (node instanceof ASTSExprNode) {
            const op = node.first;
            const args = node.rest;

            const op_atomic = ANFCompiler.makeANFAtom(op);
            const args_atomic = args.map(ANFCompiler.makeANFAtom);

            return wrapLets(
                [...op_atomic.lets, ...args_atomic.flatMap(a => a.lets)],
                new ANFApp(op_atomic.atom, args_atomic.flatMap(a => a.atom))
            );

        } else if (node instanceof ASTProcedureNode) {
            return ANFCompiler.makeANFAtom(node).atom;
        }

        throw new Error("Failed to build ANF. Unrecognized ASTNode type.");
    }

    static makeANFAtom(node: ASTNode): { atom: ANFAtom, lets: ANFLet[] } {
        if (isIf(node)) {
            const temp = makeTemp(node.meta);

            return {
                atom: new ANFVar(temp),
                lets: [
                    new ANFLet(temp, ANFCompiler.makeANFExpr(node), null!, node.meta)
                ]
            };

        } else if (isLambda(node)) {
            const lambda_node = node as ASTSExprNode;

            const params_list = lambda_node.rest[0];
            const body = lambda_node.rest.slice(1);

            if (!(params_list instanceof ASTSExprNode))
                throw new Error(`lambda: bad syntax; expected parameters to be a list`);

            const params = params_list.elements.map(p => {
                if (!(p instanceof ASTLiteralNode) || p.tok.type !== TokenType.IDENT)
                    throw new Error("lambda: bad syntax; parameters must be identifiers");
                return p.tok.value as RuntimeSymbol;
            });

            const lambda = new ASTProcedureNode(params, body);

            const body_expr = ANFCompiler.makeANFSequence(lambda.body);
            return { atom: new ANFLambda(lambda.params, body_expr, lambda_node.meta), lets: [] };

        } else if (node instanceof ASTLiteralNode) {
            if (node.tok.type === TokenType.IDENT)
                return {
                    atom: new ANFVar(node.tok.value as RuntimeSymbol, node.meta),
                    lets: [],
                };
            else
                return {
                    atom: new ANFLiteral(node.tok, node.meta),
                    lets: [],
                };

        } else if (node instanceof ASTSExprNode) {
            const op = node.first;
            const args = node.rest;

            const op_atomic = ANFCompiler.makeANFAtom(op);
            const args_atomic = args.map(ANFCompiler.makeANFAtom);

            const temp = makeTemp(node.meta);

            const app = new ANFApp(
                op_atomic.atom,
                args_atomic.map(a => a.atom),
                node.meta
            );

            return {
                atom: new ANFVar(temp, node.meta),
                lets: [
                    ...op_atomic.lets,
                    ...args_atomic.flatMap(a => a.lets),
                    new ANFLet(temp, app, null!, node.meta)
                ]
            };
        } else if (node instanceof ASTProcedureNode) {
            const lambda = new ANFLambda(
                node.params,
                ANFCompiler.makeANFSequence(node.body),
                node.meta
            );

            return { atom: lambda, lets: [] };
        }

        throw new Error("Failed to build ANF. Unrecognized ASTNode type.");
    }

    static makeANFSequence(nodes: ASTNode[]): ANFExpr {
        if (nodes.length === 1)
            return ANFCompiler.makeANFExpr(nodes[0]);

        const first = nodes[0];
        const rest = nodes.slice(1);

        const temp = makeTemp(first.meta);

        return new ANFLet(
            temp,
            ANFCompiler.makeANFExpr(first),
            ANFCompiler.makeANFSequence(rest),
            first.meta
        );
    }

    static chainANFExprs(exprs: ANFExpr[]): ANFExpr {
        if (exprs.length === 0) return new ANFLiteral(TokenVoid());
        if (exprs.length === 1) return exprs[0];

        const temp = makeTemp();
        return new ANFLet(temp, exprs[0], ANFCompiler.chainANFExprs(exprs.slice(1)));
    }
};

