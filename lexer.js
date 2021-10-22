import fs from 'fs';

class GDXError extends Error {
	constructor(message, cursor = {}) {
		super(`Parse error at line ${cursor.line + 1} column ${cursor.column + 1}: ${message}`);
		this.cursor = cursor;
	}
}

function* lexer(input = "") {
	let cursor = {
		pos: 0,
		char: input[0],
		line: 0,
		column: 0,
		eof: false
	};

	function walkCursor(back = false, tCursor = cursor) {
		if (!back) {
			tCursor.pos++;
			tCursor.column++;
			while ((input[tCursor.pos] === '\n') && input[tCursor.pos]) {
				tCursor.pos++;
				tCursor.line++;
				tCursor.column = 0;
			}
		} else {
			tCursor.pos--;
			tCursor.column--;
			while ((input[tCursor.pos] === '\n') && input[tCursor.pos]) {
				tCursor.pos--;
				tCursor.line--;
				tCursor.column = 0;
				for (let i = tCursor.pos - 1; i >= 0; i--) {
					if (input[i] === '\n') break;
					tCursor.column++;
				}
			}
		}
		tCursor.char = input[tCursor.pos];
		tCursor.eof = !tCursor.char;
	}

	function moveCursor(toPos, tCursor = cursor) {
		if (toPos === tCursor.pos) return;

		var back = (toPos - tCursor.pos) < 0;
		if (!back) {
			while (tCursor.pos < toPos) {
				walkCursor(false, tCursor);
			}
		} else {
			while (tCursor.pos > toPos) {
				walkCursor(true, tCursor);
			}
		}
	}

	function recordCursor(tCursor) {
		tCursor.pos = cursor.pos;
		tCursor.char = cursor.char;
		tCursor.line = cursor.line;
		tCursor.column = cursor.column;
		tCursor.eof = cursor.eof;
		return true;
	}

	function skipIgnore() {
		while (cursor.char === ' '
			|| cursor.char === '\n'
			|| cursor.char === '\t') walkCursor();

		if (cursor.char === '#') {
			const line = cursor.line;
			while (!cursor.eof && cursor.line === line) walkCursor();
		}
	}

	function match(m) {
		skipIgnore();
		const prevCursor = { ...cursor };
		switch (typeof m) {
			case 'function': {
				const res = m();
				if (res) {
					walkCursor(true);
					const endCursor = { ...cursor };
					walkCursor(false);
					return {
						range: [prevCursor, endCursor],
						res
					};
				}
				break;
			}
			case 'string': {
				if (input.slice(cursor.pos, cursor.pos + m.length) === m) {
					moveCursor(cursor.pos + m.length - 1);
					const endCursor = { ...cursor };
					walkCursor(false);
					return {
						range: [prevCursor, endCursor],
						res: m
					};
				}
				break;
			}
			default: {
				if (m instanceof RegExp) {
					const match = m.exec(input.slice(cursor.pos));
					if (match && match.index === 0) {
						moveCursor(cursor.pos + m.lastIndex - 1);
						const endCursor = { ...cursor };
						walkCursor(false);
						return {
							range: [prevCursor, endCursor],
							res: match[0]
						};
					}
				}
			}
		}
		moveCursor(prevCursor.pos);
		return null;
	}

	function matchOptional(m) {
		let res = m();
		return res || true;
	}

	function matchUntil(m) {
		skipIgnore();
		const prevCursor = { ...cursor };
		while (!cursor.eof) {
			let res = match(m);
			if (res) {
				return {
					...res,
					range: [prevCursor, { ...cursor }]
				}
			}
			else {
				walkCursor();
			}
		}
		moveCursor(prevCursor.pos);
		return null;
	}

	function matchScope(mOpen, mClose) {
		skipIgnore();
		const prevCursor = { ...cursor };
		let lvl = 1;
		while (!cursor.eof) {
			let resOpen = match(mOpen);
			let resClose = match(mClose);
			if (resOpen) {
				lvl++;
			} else if (resClose) {
				lvl--;
				if (lvl <= 0) {
					return {
						...resClose,
						range: [prevCursor, { ...cursor }]
					}
				}
			}
			else {
				walkCursor();
			}
		}
		moveCursor(prevCursor.pos);
		return null;
	}

	function matchMultiple(m) {
		skipIgnore();
		let ret = {};
		while (!cursor.eof) {
			let res = match(m);
			if (res) {
				ret = { ...ret, ...res };
			} else break;
		}

		return ret;
	}

	function err(cursor, msg) {
		throw new GDXError(msg, cursor);
	}

	function expectToken(m, msg) {
		skipIgnore();
		const res = m();
		if (res) {
			return res;
		}
		err(cursor, `Unexpected token '${cursor.char}' ${msg}`);
	}

	function expect(m, msg, tCursor) {
		skipIgnore();
		const res = m();
		if (res) {
			return res;
		}
		err(tCursor, msg);
	}

	function gdxBlock() {
		let tc = { ...cursor };
		let block = match(() => {
			return match("(") && match("<") && expect(() => matchUntil(() => {
				return recordCursor(tc) && match(">") && match(")")
			}), "Need to close gdx block", tc);
		});

		if (block) {
			const prevCursor = { ...cursor };
			moveCursor(block.range[0].pos);
			walkCursor();

			const gdxBlock = {
				type: "GDXBLOCK",
				range: block.range,
				tags: []
			};
			while (!cursor.eof && cursor.pos <= block.range[1].pos - 1) {
				const t = tag();
				gdxBlock.tags.push(t);
				skipIgnore();
			}
			moveCursor(prevCursor.pos);
			cursor = prevCursor;
			return gdxBlock;
		}
	}

	function tag() {
		let start;
		let symb;
		const block = expectToken(() => {
			return ((start = match("</")) && (symb = match(T_SYMBOL)))
				|| ((start = match("<")) && (symb = match(T_SYMBOL)))
		}, "expected '<' or '</'");
		if (block) {
			let props = tagProps();
			let end;

			if (end = expectToken(() => match("/>") || match(">"), "expected '/>' or '>'")) {
				let startStr = start.res;
				let endStr = end.res;
				return {
					tagName: symb.res.res,
					tagType: (
						startStr == "<" ?
							(endStr == ">" ? "START" : "SINGLE") : "CLOSE"
					),
					range: [start.range[0], end.range[1]],
					props
				};
			}
		}
	}

	function tagProps() {
		let props = [];
		let prop;
		while (prop = propAssign()) {
			props.push(prop);
		}
		return props;
	}

	function propAssign() {
		let member;
		let value;
		if (match(() => {
			return (member = match(T_SYMBOL)) && match("=") && (value = match(T_VALUE))
		})) {
			const valueRange = value.res.range;
			let memberStr = input.slice(
				member.range[0].pos, member.range[1].pos + 1
			);
			let valueStr = input.slice(
				valueRange[0].pos, valueRange[1].pos + 1
			);
			return {
				[memberStr]: valueStr
			};
		}
	}

	// Tokens
	function T_VALUE() {
		return T_GDBLOCK() || T_FUNCCALL() || T_LITERAL() || T_SYMBOL();
	}

	function T_SYMBOL() {
		const m = match(/(_|[a-z]|[A-Z])(_|[a-z]|[A-Z]|[0-9])*/g);
		if (m) {
			return {
				...m,
				valueRange: m.range
			}
		}
	}

	function T_LITERAL() {
		return T_STRING() || T_FLOAT() || T_INT();
	}

	function T_INT() {
		const m = match(/[+-]?0x([0-9]|[a-f]|[A-F])+/g)
			|| match(/[+-]?0b[01]+/g)
			|| match(/[+-]?[0-9]+/g);
		if (m) {
			return {
				...m,
				valueRange: m.range
			}
		}
	}

	function T_FLOAT() {
		const m = match(/[+-]?[0-9]+\.[0-9]*e[+-]?[0-9]+/g)
			|| match(/[+-]?[0-9]+\.[0-9]*[fF]?/g)
			|| match(/[+-]?[0-9]+/g);
		if (m) {
			return {
				...m,
				valueRange: m.range
			}
		}
	}

	function T_STRING() {
		const m = match(/\".*?\"|\'.*?\'/g);
		if (m) {
			return {
				...m,
				valueRange: m.range
			}
		}
	}

	function T_FUNCCALL() {
		const block = match(() => (
			match(T_SYMBOL) && match("(") && matchOptional(T_VALUE) && matchMultiple(() => (
				match(",") && match(T_VALUE)
			)) && expectToken(() => match(")"), "expected ')'")
		));
		if (block) {
			return {
				...block,
				valueRange: block.range
			}
		}
	}

	function T_GDBLOCK() {
		const block = match(() => match("{") && matchScope("{", "}"));
		if (block) {
			walkCursor(false, block.range[0]);
			walkCursor(true, block.range[1]);
			return {
				...block,
				valueRange: block.range
			};
		}
	}

	while (true) {
		const token = gdxBlock();
		if (token) yield token;
		else walkCursor();
		if (cursor.eof) { yield { type: "EOF" } }
	}
}

function parse(input = "") {
	// Convert possible line breaks into single line break
	input = input.replace(/\r?\n|\r/g, "\n");

	for (const token of lexer(input)) {
		if (token.type === "EOF") break;
		if (token.type === "GDXBLOCK") {
			const numTags = token.tags.length;
			const tags = token.tags;

			function findTagEnd(start, name, scopeEnd = -1) {
				if (tags[start].tagType === 'SINGLE') return start;
				let indent = 0;
				if (scopeEnd < 0) {
					scopeEnd = numTags - 1;
				}
				for (let i = start + 1; i <= scopeEnd; i++) {
					if (tags[i].tagName === name) {
						if (tags[i].tagType === 'START') {
							indent++;
						} else if (tags[i].tagType === 'CLOSE') {
							indent--;
							if (indent < 0) return i;
						}
					}
				}
				return -1;
			}

			function parseTag(start, end) {
				if (end == -1) {
					throw new GDXError(`Couldn't find close tag`, tags[start].range[0]);
				}
				const tagStart = tags[start];

				const tag = {
					type: tagStart.tagName,
					props: tagStart.props,
					children: []
				}

				for (let i = start + 1; i <= end - 1; i++) {
					if (tags[i].tagType === 'SINGLE') {
						tag.children.push(parseTag(i, i));
					} else if (tags[i].tagType === 'START') {
						let otherEnd = findTagEnd(i, tags[i].tagName, end - 1);
						tag.children.push(parseTag(i, otherEnd));
						if (otherEnd !== -1) {
							i = otherEnd;
						}
					} else if (tags[i].tagType === 'CLOSE') {
						throw new GDXError(`This tag is closing nothing`, tags[i].range[0]);
					}
				}

				return tag;
			}

			const start = 0;
			const end = findTagEnd(start, tags[0].tagName);
			if (end !== numTags - 1) {
				const after = tags[end + 1];
				if (after.tagType === 'CLOSE') {
					throw new GDXError(
						`This tag is closing nothing`, after.range[0]
					);
				} else {
					throw new GDXError(
						`You can return only one node`, after.range[0]
					);
				}
			}
			const dict = parseTag(0, end);
			console.log(JSON.stringify(dict, " ", " "));
		}
	}
}

function test(input) {
	var start = Date.now();
	console.log("--start--");

	const parsed = parse(input);

	console.log("--finish--");
	var elapsed = Date.now() - start;
	console.log(`Parsed in ${elapsed} ms`)
}

console.clear();
fs.readFile('input.txt', 'utf8', (err, data) => {
	if (err) {
		console.error(err)
		return
	}
	test(data);
})



