import { eq } from "../../shared/util/objects.js";
import fs from "fs";

export class TerminalHistory {
    private hist: string[][] = [];
    private temp_hist_buffers = new Map<number, string[]>();
    private index = -1;
    private draft: string[] | null = null;

    public loadFile(
        file_path: string,
        size: number,
        filter_lines: (line: string) => boolean = () => true,
    ): boolean {
        if (
            file_path === "" ||
            !fs.existsSync(file_path) ||
            !fs.statSync(file_path).isFile()
        ) {
            return false;
        }

        const raw = fs.readFileSync(file_path, "utf8").split("\n");

        const entries: string[][] = [];

        let i = 0;
        while (i < raw.length) {
            const count = parseInt(raw[i++], 10);
            if (Number.isNaN(count) || count <= 0) break;

            const cmd = raw.slice(i, i + count);
            i += count;

            if (filter_lines(cmd.join("\n"))) entries.push(cmd);
        }

        this.hist = entries.reverse().slice(0, size);

        return true;
    }

    // FIXME: Repeats on subsequent runs duplicate history
    public append(current_buffer: readonly string[]): void {
        if (current_buffer.length === 0) return;
        if (eq(this.hist[0], current_buffer)) return;

        this.hist.unshift([...current_buffer]);
        this.resetNavigation();
    }

    public appendFile(file_path: string, buffer: readonly string[]): boolean {
        if (file_path === "" || buffer.length === 0) {
            return false;
        }

        const entry = buffer.length + "\n" + buffer.join("\n") + "\n";

        fs.appendFileSync(file_path, entry);

        return true;
    }

    public previous(current_buffer: readonly string[]): string[] | null {
        if (this.hist.length === 0) return null;

        if (this.index === -1) {
            this.draft = [...current_buffer];
            this.index = 0;
        } else if (this.index < this.hist.length - 1) {
            this.index++;
        }

        return this.getEntry(this.index);
    }

    public next(): string[] | null {
        if (this.index === -1) return null;

        if (this.index > 0) {
            this.index--;
            return this.getEntry(this.index);
        }

        this.index = -1;
        return this.draft ?? [""];
    }

    public resetNavigation(): void {
        this.index = -1;
        this.draft = null;
        this.temp_hist_buffers.clear();
    }

    public updateCurrent(buffer: readonly string[]): void {
        if (this.index >= 0)
            this.temp_hist_buffers.set(this.index, [...buffer]);
    }

    public getEntry(idx: number): string[] {
        if (this.temp_hist_buffers.has(idx))
            return this.temp_hist_buffers.get(idx)!;

        return idx >= this.hist.length ? [""] : this.hist[idx];
    }
}
