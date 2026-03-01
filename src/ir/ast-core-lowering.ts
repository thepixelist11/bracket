import { ASTLiteralNode, ASTNode, ASTProcedureNode, ASTSExprNode } from "../parser/ast.js";
import { RuntimeSymbol, TokenType } from "../parser/token.js";

function isLambdaForm(node: ASTNode): node is ASTSExprNode {
    return (
        node instanceof ASTSExprNode &&
        node.first instanceof ASTLiteralNode &&
        node.first.tok.type === TokenType.IDENT &&
        (node.first.tok.literal === "lambda" ||
            node.first.tok.literal === "λ")
    );
}

function lowerLambda(node: ASTSExprNode) {
    const param_list = node.elements[1];

    if (!(param_list instanceof ASTSExprNode))
        throw new Error("lambda: bad syntax; parameter list must be a list");

    const params: RuntimeSymbol[] = param_list.elements.map(p => {
        if (!(p instanceof ASTLiteralNode) ||
            p.tok.type !== TokenType.IDENT)
            throw new Error("lambda: bad syntax; parameters must be identifiers");

        return p.tok.value as RuntimeSymbol;
    });

    const body = node.elements.slice(2);
    if (body.length === 0)
        throw new Error("lambda: body cannot be empty");

    return new ASTProcedureNode(
        params,
        body,
        node.meta
    );
}

export function lowerToCore(node: ASTNode): ASTNode {
    if (node instanceof ASTSExprNode) {
        if (isLambdaForm(node))
            return lowerLambda(node);

        return new ASTSExprNode(
            ...(node as ASTSExprNode).elements.map(lowerToCore)
        );
    }

    return node;
}

