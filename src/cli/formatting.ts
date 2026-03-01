import { Token, TokenVoid } from "../parser/token.js";

export function generateDocumentation(name: string, doc: string = "", is_procedure: boolean = false, arg_names: string[] = [], variadic: boolean = false, bound_to: Token = TokenVoid(), imported_by: string) {
    let out = "";
    if (is_procedure) {
        if (arg_names.length === 0 && variadic === false)
            out += `${name}: (${name})`;
        else
            out += `${name}: (${[name, ...arg_names.slice(0, -1), (arg_names.at(-1) ?? "") + (variadic ? "..." : "")].join(" ")})`;
    } else {
        out += `${name}: ${bound_to.toString()}`;
    }
    if (doc !== "") out += `\n${doc}`;
    if (imported_by !== "") out += `\n\nImported by: ${imported_by}`;
    return out;
}

export function toByteString(value: number | number[], bytes = 1) {
    if (typeof value === "number")
        return value.toString(2).padStart(8 * bytes, "0");

    return value.map(b => b.toString(2).padStart(8 * bytes, "0")).join(" ");
}

