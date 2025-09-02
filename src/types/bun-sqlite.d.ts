// Minimal type shims for Bun's native SQLite module to satisfy TypeScript in adapter/core builds.
declare module 'bun:sqlite' {
    export class Database {
        constructor(path: string);
        exec(sql: string): void;
        prepare<T = any>(sql: string): Statement<T>;
        close(): void;
    }

    export interface RunResult {
        changes: number;
        lastInsertRowid: number | bigint;
    }

    export interface Statement<T = any> {
        run(...params: any[]): RunResult;
        all(...params: any[]): T[];
        get(...params: any[]): T;
    }
}
