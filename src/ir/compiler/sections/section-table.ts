import { splitUint32, splitUint8 } from "../../../shared/utils/binary/writer";

export type BCSection = { tag: number, offset: number, size: number };

//           Section Table                   The section table is used to position sections in the
//  Section Count ------------ 1 byte          file. These consist of a tag, the absolute file offset
//  Count Times:                               in bytes, and the size of the section. This must be
//   Section Tag ------------- 1 byte          placed immediately after the header.
//   Absolute Offset --------- 4 bytes
//   Size -------------------- 4 bytes

export function sectionTable(sections: BCSection[]) {
    if (sections.length >= 256)
        throw new Error(`got ${sections.length} sections; expected at most 255 sections`);

    const section_table_size = sections.length * 9 + 1;

    const current_sections = new Set();
    const tmp: number[] = [...splitUint8(sections.length)];
    for (const sec of sections) {
        if (current_sections.has(sec.tag)) {
            console.warn(`duplicate section with tag ${sec.tag}; skipping`);
            continue;
        }

        tmp.push(...splitUint8(sec.tag));
        tmp.push(...splitUint32(sec.offset + section_table_size));
        tmp.push(...splitUint32(sec.size));
    }
    return new Uint8Array(tmp);
}

