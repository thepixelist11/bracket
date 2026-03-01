import { ASTLiteralNode, ASTSExprNode } from "../../parser/ast.js";
import { TokenType } from "../../parser/token.js";

export function unexpandVoid(ast: ASTSExprNode): string[] | false {
    if (ast.elements.length !== 1) return false;
    if (!(ast.elements[0] instanceof ASTLiteralNode) ||
        ast.elements[0].tok.type !== TokenType.IDENT ||
        ast.elements[0].tok.literal !== "void") return false;

    return [];
}

