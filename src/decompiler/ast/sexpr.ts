import { ASTSExprNode } from "../../parser/ast.js";
import { ASTToSourceCode } from "./render.js";
import { RenderCtx, renderRawList } from "./render-context.js";
import { tryUnexpand } from "../macros/index.js";

export function ASTSExprNodeToSourceCode(ast: ASTSExprNode, ctx: RenderCtx, unexpand_macros: boolean = true) {
    if (unexpand_macros) {
        const result = tryUnexpand(ast, ctx);
        if (result) return result;
    }

    const inner_ctx = { ...ctx, indent: ctx.indent + 1 };
    const elems = ast.elements.map(e => ASTToSourceCode(e, inner_ctx));

    return renderRawList(elems, ctx);
}

