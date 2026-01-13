import * as stdlib from "../bin/stdlib.js";
import { TokenVoid } from "../bin/token.js";

const DOCS = {};

function generateDocumentation(name, doc = "", is_procedure = false, arg_names = [], variadic = false, bound_to, imported_by) {
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

for (const [fn, mod] of stdlib.BRACKET_BUILTINS.associations) {
    const { constant, raw_arg_names, doc, variadic, min_args, value, special } = stdlib.BRACKET_BUILTINS.get(fn);
    const arg_names = raw_arg_names ?? (variadic
        ? [...Array.from({ length: (min_args ?? 1) - 1 }, (_, i) => `arg${i}`), "args"]
        : Array.from({ length: min_args ?? 0 }, (_, i) => `arg${i}`));

    DOCS[mod] ??= {};
    DOCS[mod][fn] = generateDocumentation(fn, doc ?? "", constant ? false : true, special ? ["special_function"] : arg_names, variadic ?? false, constant ? value : TokenVoid(), "");
}

console.log(`## Standard Library Reference\n<details>\n<summary>Modules</summary>\n`);

for (const mod in DOCS) {
    const docs = DOCS[mod];

    console.log(`### ${mod}`);
    console.log(`<details>`);
    console.log(`<pre><code>`);

    const list = [];
    for (const fn in docs) {
        list.push(docs[fn]);
    }
    console.log(list.join("\n\n"));

    console.log(`</code></pre>`);
    console.log(`</details>\n`);
}

console.log(`</details>`);

