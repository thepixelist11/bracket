import { DECOMPILER_CLOSING_ON_NEW_LINE } from "../../shared/globals.js";

export interface RenderCtx {
    indent: number;
    indent_step: number;
};

export function indentStr(ctx: RenderCtx) {
    return " ".repeat(ctx.indent * ctx.indent_step);
}

export function shouldMultiline(parts: string[]) {
    if (parts.length > 3) return true;
    return parts.some(p => p.includes("\n"));
}

export function indentLines(str: string, ctx: RenderCtx) {
    return str
        .split("\n")
        .map(line => indentStr(ctx) + line)
        .join("\n");
}

export function renderRawList(parts: string[], ctx: RenderCtx) {
    if (!shouldMultiline(parts)) {
        return `(${parts.join(" ")})`;
    }

    const base = indentStr(ctx);
    const inner_ctx = { ...ctx, indent: ctx.indent + 1 };

    const lines = parts.map((p, i) =>
        i === 0
            ? base + "(" + p.replace(/\n/g, "\n" + indentStr(inner_ctx))
            : indentLines(p, inner_ctx)
    );

    if (DECOMPILER_CLOSING_ON_NEW_LINE) {
        return `${lines.join("\n")}\n${base})`;
    } else {
        lines[lines.length - 1] += ")";
        return lines.join("\n");
    }
}

export function renderList(head: string, args: string[], ctx: RenderCtx) {
    return renderRawList([head, ...args], ctx);
}

