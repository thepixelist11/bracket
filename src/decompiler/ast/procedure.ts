import { ASTProcedureNode } from "../../parser/ast.js";
import { RenderCtx, renderRawList } from "./render-context.js";
import { ASTToSourceCode } from "./render.js";

export function ASTProcedureNodeToSourceCode(ast: ASTProcedureNode, ctx: RenderCtx) {
    const params = `(${ast.params.map(p => p.name).join(" ")})`;
    const inner_ctx = { ...ctx, indent: ctx.indent + 1 };
    const bodies = ast.body.map(b => ASTToSourceCode(b, inner_ctx));

    return renderRawList(["lambda", params, ...bodies], ctx);
}

