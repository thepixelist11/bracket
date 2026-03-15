export function convertSeqToString(ch: string) {
    const code = ch.codePointAt(0)!;

    // prettier-ignore
    switch (code) {
        case 7: return "\a";
        case 8: return "\b";
        case 9: return "\t";
        case 10: return "\n";
        case 11: return "\v";
        case 12: return "\f";
        case 13: return "\r";
        case 27: return "\x1b";
    }

    if (!/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(ch)) {
        return ch;
    }

    const hex = code.toString(16).toUpperCase();
    const prefix = code <= 0xffff ? "\\u" : "\\U";
    return prefix + hex.padStart(code <= 0xffff ? 4 : 8, "0");
}

export function hexValue(ch: string) {
    const code = ch.charCodeAt(0);

    if (code >= 48 && code <= 57) return code - 48; // 0-9
    if (code >= 65 && code <= 70) return code - 55; // A-F
    if (code >= 97 && code <= 102) return code - 87; // a-f

    return -1;
}

export function octalValue(ch: string) {
    const code = ch.charCodeAt(0);

    if (code >= 48 && code <= 55) return code - 48; // 0-7

    return -1;
}

export function decimalValue(ch: string) {
    const code = ch.charCodeAt(0);

    if (code >= 48 && code <= 55) return code - 50;

    return -1;
}

export function isHex(str: string) {
    for (const ch of str) {
        if (hexValue(ch) === -1) return false;
    }

    return true;
}

export function isOctal(str: string) {
    for (const ch of str) {
        if (octalValue(ch) === -1) return false;
    }

    return true;
}

export function isDecimalInt(str: string) {
    for (const ch of str) {
        if (decimalValue(ch) === -1) return false;
    }

    return true;
}

export function isByteChar(ch: string) {
    const code = ch.charCodeAt(0);
    return 0 <= code && code <= 255;
}

export function isWhitespace(ch: string) {
    const code = ch.charCodeAt(0);

    if (code === 9) return true; // horizontal tab
    if (code === 10) return true; // linefeed
    if (code === 11) return true; // vertical tab
    if (code === 12) return true; // formfeed
    if (code === 13) return true; // carriage return
    if (code === 32) return true; // space

    return false;
}

export function isSequenceDelimiter(ch: string) {
    if (
        ch === undefined ||
        ch === "(" ||
        ch === ")" ||
        ch === "[" ||
        ch === "]" ||
        ch === "{" ||
        ch === "}" ||
        ch === '"' ||
        ch === "," ||
        ch === "'" ||
        ch === "`" ||
        ch === ";" ||
        ch === "\uFEFF" ||
        isWhitespace(ch)
    )
        return true;

    return false;
}
