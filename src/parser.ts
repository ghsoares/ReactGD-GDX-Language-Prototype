interface Cursor {
    input: string;
    inputLength: number;
    pos: number;
    char: string;
    line: number;
    column: number;
    eof: boolean;
    lineBreak: boolean;

    walk(back?: boolean): void;
    walkTimes(times: number, back?: boolean): void;
    move(pos: number): void;
    skipIgnore(): void;
}

interface Token {
    tokenType: string;
    range: Cursor[];
}

type MatchType = string | (() => boolean) | RegExp;

function createCursor(input: string): Cursor {
    const obj = {
        input,
        inputLength: input.length,
        pos: 0,
        char: input[0],
        line: 0,
        column: 0,
        eof: false,
        lineBreak: false,
        walk: function (back: boolean = false) {
            if (back) {
                this.pos--;
                this.column--;
                if (this.lineBreak) {
                    this.line--;
                    this.column = 0;
                    for (let i = this.pos - 1; i >= 0; i--) {
                        if (this.input[i] === "\n") break;
                        this.column++;
                    }
                }
            } else {
                this.pos++;
                this.column++;
                if (this.lineBreak) {
                    this.line++;
                    this.column = 0;
                }
            }

            this.char = this.input[this.pos];
            this.eof = this.char === undefined;
            this.lineBreak = this.char === "\n";
        },
        walkTimes: function (times: number, back: boolean = false) {
            for (let i = 0; i < times; i++) {
                this.walk(back);
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
    private _input: string;
    protected get input(): string {
        return this._input;
    }
    protected set input(val: string) {
        this._input = val;
        this.clear();
    }

    protected cursor: Cursor;
    protected matchStack: string[];
    protected cursorStack: Cursor[][];

    constructor(input: string) {
        this._input = input;
        this.cursor = createCursor(input);
        this.matchStack = [];
        this.cursorStack = [];
    }

    clear(): void {
        this.cursor = createCursor(this.input);
        this.matchStack = [];
        this.cursorStack = [];
    }

    getInput(): string {
        return this.input;
    }

    getStr(pos: number): string {
        if (this.matchStack.length === 0) return this.input;
        while (pos < 0) {
            pos += this.matchStack.length;
        }
        while (pos >= this.matchStack.length) {
            pos -= this.matchStack.length;
        }
        return this.matchStack[pos];
    }

    setStr(pos: number, str: string): void {
        if (this.matchStack.length === 0) return;
        while (pos < 0) {
            pos += this.matchStack.length;
        }
        while (pos >= this.matchStack.length) {
            pos -= this.matchStack.length;
        }
        this.matchStack[pos] = str;
    }

    getCursorStart(pos: number): Cursor {
        if (this.cursorStack.length === 0) return createCursor(this.input);
        while (pos < 0) {
            pos += this.cursorStack.length;
        }
        while (pos >= this.cursorStack.length) {
            pos -= this.cursorStack.length;
        }
        return this.cursorStack[pos][0];
    }

    getCursorEnd(pos: number): Cursor {
        if (this.cursorStack.length === 0) return createCursor(this.input);
        while (pos < 0) {
            pos += this.cursorStack.length;
        }
        while (pos >= this.cursorStack.length) {
            pos -= this.cursorStack.length;
        }
        return this.cursorStack[pos][1];
    }

    match(str: MatchType, ...args: any[]): boolean {
        this.cursor.skipIgnore();

        if (typeof str === "string") {
            const sliced: string = this.input.slice(
                this.cursor.pos,
                this.cursor.pos + str.length
            );
            if (sliced === str) {
                this.matchStack.push(str);
                const startCursor: Cursor = { ...this.cursor };
                this.cursor.walkTimes(str.length);
                const endCursor: Cursor = { ...this.cursor };
                this.cursorStack.push([startCursor, endCursor]);
                return true;
            }
        } else if (typeof str === "function") {
            const tCursor: Cursor = { ...this.cursor };
            const mPos: number = this.matchStack.length;

            if (str.apply(this)) {
                if (args[0]) {
                    const str: string = this.input.slice(
                        tCursor.pos,
                        this.getCursorEnd(-1).pos
                    );
                    this.matchStack.push(str);
                } else {
                    const str: string = this.matchStack.slice(mPos).join("");
                    this.matchStack.push(str);
                }
                this.cursorStack.push([tCursor, { ...this.cursor }]);
                return true;
            } else {
                this.matchStack = this.matchStack.slice(0, mPos);
                this.cursorStack = this.cursorStack.slice(0, mPos);
                this.cursor.move(tCursor.pos);
            }
        } else if (str instanceof RegExp) {
            const match = str.exec(this.input.slice(this.cursor.pos));
            if (match && match.index === 0) {
                this.matchStack.push(match[0]);
                const startCursor: Cursor = { ...this.cursor };
                this.cursor.walkTimes(match[0].length);
                const endCursor: Cursor = { ...this.cursor };
                this.cursorStack.push([startCursor, endCursor]);
                return true;
            }
        }

        return false;
    }

    matchUntil(str: MatchType): boolean {
        while (!this.cursor.eof) {
            if (this.match(str)) {
                return true;
            } else this.cursor.walk();
        }
        return false;
    }

    matchWhile(str: MatchType): boolean {
        while (!this.cursor.eof) {
            if (!this.match(str)) break;
        }

        return true;
    }

    matchScope(strOpen: MatchType, strClose: MatchType): boolean {
        if (!this.match(strOpen)) return false;
        let lvl: number = 0;

        while (!this.cursor.eof) {
            if (this.match(strOpen)) lvl++;
            else if (this.match(strClose)) {
                lvl--;
                if (lvl < 0) return true;
            } else this.cursor.walk();
        }

        return false;
    }

    expect(str: MatchType, msg: string): boolean {
        const tCursor = { ...this.cursor };
        if (this.match(str)) return true;

        throw new ParseError(msg, tCursor);
    }

    *tokenize(): IterableIterator<Token> {
        this.clear();
        while (!this.cursor.eof) {
            const token: Token = this.getToken();
            if (token) yield token;
            else this.cursor.walk();
        }
    }

    // Virtual functions
    getToken(): Token {
        return null;
    }
}

class Parser {
    protected readonly input: string;
    protected readonly lexer: Lexer;

    constructor(lexer: Lexer) {
        this.input = lexer.getInput();
        this.lexer = lexer;
    }

    parse(): string {
        return this.input;
    }
}

export { Lexer, Parser, Cursor, Token, MatchType, createCursor, ParseError };
