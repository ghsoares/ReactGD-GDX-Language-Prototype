interface Cursor {
    input: string;
    inputLength: number;
    pos: number;
    char: string;
    line: number;
    column: number;
    indent: number;
    indenting: boolean;
    eof: boolean;
    lineBreak: boolean;

    walk(): void;
    walkTimes(times: number): void;
    move(pos: number): void;
    skipIgnore(): void;
    toString(): string;
}

interface CursorRange {
    start: Cursor;
    end: Cursor;
}

interface Token {
    tokenType: string;
    range: CursorRange;
}

function createCursor(input: string): Cursor {
    const obj = {
        input,
        inputLength: input.length,
        pos: 0,
        char: input[0],
        line: 0,
        column: 0,
        indent: 0,
        indenting: true,
        eof: false,
        lineBreak: false,
        walk: function () {
            this.pos++;
            this.column++;

            if (this.lineBreak) {
                this.line++;
                this.column = 0;
            }

            this.char = this.input[this.pos];
            this.eof = this.char === undefined;
            this.lineBreak = this.char === "\n";
            if (this.indenting) {
                if (this.char === "\t" || this.char === " ") this.indent++;
                else this.indenting = false;
            }
            if (this.lineBreak) {
                this.indenting = true;
                this.indent = 0;
            }
        },
        walkTimes: function (times: number) {
            for (let i = 0; i < times; i++) {
                this.walk();
            }
        },
        move: function (pos: number) {
            if (pos < 0) pos = 0;
            if (pos > this.inputLength - 1) pos = this.inputLength - 1;
            if (pos === this.pos) return;

            this.pos = 0;
            this.char = input[0];
            this.line = 0;
            this.column = 0;
            this.eof = false;
            this.lineBreak = input[0] === "\n";

            while (this.pos < pos) this.walk();
        },
        skipIgnore: function () {
            while (
                this.char === " " ||
                this.char === "\n" ||
                this.char === "\t"
            )
                this.walk();

            if (this.char === "#") {
                while (!this.eof && this.char !== "\n") {
                    this.walk();
                }
            }

            while (
                this.char === " " ||
                this.char === "\n" ||
                this.char === "\t"
            )
                this.walk();
        },
        toString: function () {
            return `(P:${this.pos} L:${this.line} C:${this.column} "${this.char}")`;
        },
    };

    return obj;
}

class Match {
    range: CursorRange;
    cursor: Cursor;
    matching: boolean;
    currVal: boolean;
    invertMatch: boolean;
    exceptionMsg: string;

    stringStack: string[];
    rangeStack: CursorRange[];

    constructor(cursor: Cursor) {
        this.cursor = cursor;
        this.range = { start: { ...cursor }, end: { ...cursor } };
        this.matching = true;
        this.currVal = false;
        this.invertMatch = false;
        this.exceptionMsg = "";

        this.stringStack = [];
        this.rangeStack = [];
    }

    testException() {
        if (this.exceptionMsg !== "" && !this.currVal) {
            throw new ParseError(this.exceptionMsg, this.cursor);
        }
        this.exceptionMsg = "";
    }

    pushStringStack(...items: string[]) {
        this.stringStack.push(...items);
        while (this.stringStack.length > 64) {
            this.stringStack.shift();
        }
    }

    pushRangeStack(...items: CursorRange[]) {
        this.rangeStack.push(...items);
        while (this.rangeStack.length > 64) {
            this.rangeStack.shift();
        }
    }
}

class ParseError extends Error {
    constructor(message: string, cursor: Cursor) {
        super(
            `Parse error at line ${cursor.line + 1} column ${
                cursor.column + 1
            }: ${message}`
        );
    }
}

class Lexer {
    private source: string;

    protected currentMatch: Match;
    protected matchStack: Match[];

    reset(): void {
        this.currentMatch = new Match(createCursor(this.source));
        this.matchStack = [];
    }

    setSource(source: string) {
        this.source = source;
        this.reset();
    }

    getSource(): string {
        return this.source;
    }

    getStr(pos: number): string {
        const stack = this.currentMatch.stringStack;
        if (stack.length === 0) return this.source;
        while (pos < 0) {
            pos += stack.length;
        }
        while (pos >= stack.length) {
            pos -= stack.length;
        }
        return stack[pos];
    }

    setStr(pos: number, str: string): void {
        const stack = this.currentMatch.stringStack;
        if (stack.length === 0) return;
        while (pos < 0) {
            pos += stack.length;
        }
        while (pos >= stack.length) {
            pos -= stack.length;
        }
        stack[pos] = str;
    }

    getRange(pos: number): CursorRange {
        const stack = this.currentMatch.rangeStack;

        if (stack.length === 0)
            return {
                start: createCursor(this.source),
                end: createCursor(this.source),
            };
        while (pos < 0) {
            pos += stack.length;
        }
        while (pos >= stack.length) {
            pos -= stack.length;
        }
        return stack[pos];
    }

    setRange(pos: number, start: Cursor | number, end: Cursor | number): void {
        const stack = this.currentMatch.rangeStack;

        if (stack.length === 0) return;
        while (pos < 0) {
            pos += stack.length;
        }
        while (pos >= stack.length) {
            pos -= stack.length;
        }

        let startCursor: Cursor;
        let endCursor: Cursor;

        if (typeof start === "number") {
            startCursor = createCursor(this.source);
            startCursor.move(start);
        } else {
            startCursor = start as Cursor;
        }
        if (typeof end === "number") {
            endCursor = createCursor(this.source);
            endCursor.move(end);
        } else {
            endCursor = end as Cursor;
        }
        stack[pos] = { start: startCursor, end: endCursor };
    }

    openMatch(): void {
        this.matchStack.push(this.currentMatch);
        this.currentMatch.cursor.skipIgnore();
        this.currentMatch = new Match(this.currentMatch.cursor);
    }

    and(): this {
        if (!this.currentMatch.matching) return this;

        if (!this.currentMatch.currVal) {
            this.currentMatch.matching = false;
        }

        return this;
    }

    or(): this {
        if (!this.currentMatch.matching) return this;

        if (this.currentMatch.currVal) {
            this.currentMatch.matching = false;
        }

        return this;
    }

    not(): this {
        if (!this.currentMatch.matching) return this;

        this.currentMatch.invertMatch = true;

        return this;
    }

    expectNext(msg: string): this {
        if (!this.currentMatch.matching) return this;

        this.currentMatch.exceptionMsg = msg;

        return this;
    }

    expectPrev(msg: string): this {
        if (!this.currentMatch.matching) return this;

        this.currentMatch.exceptionMsg = msg;
        this.currentMatch.testException();

        return this;
    }

    match(m: string | RegExp, ...args: any[]): this {
        if (!this.currentMatch.matching) return this;
        this.currentMatch.cursor.skipIgnore();

        this.currentMatch.currVal = false;

        if (typeof m === "string") {
            const s = this.source.slice(
                this.currentMatch.cursor.pos,
                this.currentMatch.cursor.pos + m.length
            );
            if (args[0]) {
                this.currentMatch.currVal = s.toUpperCase() === m.toUpperCase();
            } else {
                this.currentMatch.currVal = s === m;
            }

            if (this.currentMatch.invertMatch) {
                this.currentMatch.currVal = !this.currentMatch.currVal;
            } else if (this.currentMatch.currVal) {
                const matchStart = { ...this.currentMatch.cursor };
                this.currentMatch.cursor.walkTimes(m.length - 1);
                const matchEnd = { ...this.currentMatch.cursor };

                this.currentMatch.pushStringStack(s);
                this.currentMatch.pushRangeStack({
                    start: matchStart,
                    end: matchEnd,
                });
                this.currentMatch.range.end = matchEnd;

                this.currentMatch.cursor.walk();
            }
        } else if (m instanceof RegExp) {
            const match = m.exec(
                this.source.slice(this.currentMatch.cursor.pos)
            );

            this.currentMatch.currVal = match !== null && match.index === 0;

            if (this.currentMatch.invertMatch) {
                this.currentMatch.currVal = !this.currentMatch.currVal;
            } else if (this.currentMatch.currVal) {
                const matchStart = { ...this.currentMatch.cursor };
                this.currentMatch.cursor.walkTimes(match[0].length - 1);
                const matchEnd = { ...this.currentMatch.cursor };

                this.currentMatch.pushStringStack(match[0]);
                this.currentMatch.pushRangeStack({
                    start: matchStart,
                    end: matchEnd,
                });
                this.currentMatch.range.end = matchEnd;

                this.currentMatch.cursor.walk();
            }
        }

        this.currentMatch.testException();
        this.currentMatch.invertMatch = false;

        return this;
    }

    foundMatch(): boolean {
        return this.currentMatch.currVal;
    }

    closeMatch(): void {
        if (this.matchStack.length === 0) {
            throw new Error("Closing more matches than opening");
        }

        const prevMatch = this.currentMatch;
        this.currentMatch = this.matchStack.pop();

        if (this.currentMatch.matching) {
            this.currentMatch.currVal = prevMatch.currVal;
            this.currentMatch.testException();

            if (prevMatch.currVal) {
                this.currentMatch.cursor.move(prevMatch.cursor.pos);

                this.currentMatch.pushStringStack(...prevMatch.stringStack);
                this.currentMatch.pushRangeStack(...prevMatch.rangeStack);
                this.currentMatch.pushStringStack(
                    this.source.slice(
                        prevMatch.range.start.pos,
                        prevMatch.range.end.pos + 1
                    )
                );
                this.currentMatch.pushRangeStack(prevMatch.range);

                this.currentMatch.range.end = prevMatch.range.end;
            }
        }
    }

    *tokenize(): IterableIterator<Token> {
        this.reset();
        while (!this.currentMatch.cursor.eof) {
            const token: Token = this.getToken();
            if (this.matchStack.length > 0) {
                throw new Error("Not closing all opened matches!");
            }
            if (token) yield token;
            else this.currentMatch.cursor.walk();
        }
    }

    // Virtual functions
    getToken(): Token {
        return null;
    }
}

class Parser {
    protected readonly lexer: Lexer;

    constructor(lexer: Lexer) {
        this.lexer = lexer;
    }

    parse(source: string): string {
        return source;
    }
}

export { Lexer, Parser, Cursor, CursorRange, Token, createCursor, ParseError };
