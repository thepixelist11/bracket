import { ASTLiteralNode, ASTSExprNode } from "../../parser/ast.js";
import { TokenType } from "../../parser/token.js";
import { ASTToSourceCode } from "../ast/render.js";

export function unexpandWhen(ast: ASTSExprNode): string[] | false {
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

