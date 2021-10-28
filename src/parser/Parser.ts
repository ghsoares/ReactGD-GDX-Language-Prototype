interface Cursor {
	pos: number;
	char: string;
	line: number;
	column: number;
	eof: boolean;
	lineBreak: boolean;
}

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

class Parser {
	private input: string;
	private cursor: Cursor;
	private matchStack: string[];
	private cursorStack: Cursor[][];
}