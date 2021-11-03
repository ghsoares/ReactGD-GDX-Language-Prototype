import { Cursor, CursorRange, ParseError } from "./parser";
import {
    FunctionDeclarationToken,
    GDXLexer,
    ImportToken,
    TagProperty,
    TagToken,
    VariableDeclarationToken,
} from "./GDXLexer";
import path from "path";

export interface ParserArgs {
    filePath: string;
    fileBaseName: string;
    folderPath: string;
    assignId?: boolean;
}

interface TagParsed {
    range: CursorRange;
    className: string;
    properties: TagProperty[];
    children: TagParsed[];
}

function sfc32(a: number, b: number, c: number, d: number) {
    return function () {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
        var t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
}

function randomId(
    length: number,
    seed0: number,
    seed1: number,
    seed2: number,
    seed3: number
) {
    var result = "";
    var characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var charactersLength = characters.length;
    var rng = sfc32(seed0, seed1 || 1, seed2 || 2, seed3 || 3);
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(rng() * charactersLength));
    }
    return result;
}

export class GDXParser {
    private lexer: GDXLexer;
    private args: ParserArgs;
    private source: string;
    private variables: VariableDeclarationToken[];
    private functions: FunctionDeclarationToken[];
    private off: number;
    private treeStack: TagParsed[];
    private treeStart: Cursor;

    constructor(lexer: GDXLexer) {
        this.lexer = lexer;
    }

    parseRange(range: CursorRange, parsed: string) {
        const prefix = this.source.slice(0, this.off + range.start.pos);
        const suffix = this.source.slice(this.off + range.end.pos + 1);

        this.source = prefix + parsed + suffix;

        const prevLen = range.end.pos + 1 - range.start.pos;
        const newLen = parsed.length;

        this.off += newLen - prevLen;
    }

    parse(source: string, args: ParserArgs): string {
        this.lexer.setSource(source);
        this.args = args;
        this.source = source;

        this.getDeclarations();

        this.lexer.reset();
        this.off = 0;
        this.treeStack = [];
        this.treeStart = null;

        for (const token of this.lexer.tokenize()) {
            switch (token.tokenType) {
                case "IMPORT": {
                    const t = token as ImportToken;
                    const className = t.className;
                    const p = path.join(this.args.folderPath, t.relativePath);
                    const range = t.range;

                    this.parseRange(
                        range,
                        `var ${className} = ResourceLoader.load("${p}")`
                    );
                    break;
                }
                case "TAG": {
                    const t = token as TagToken;
                    const node: TagParsed = {
                        range: t.range,
                        className: t.className,
                        properties: t.properties,
                        children: [],
                    };

                    if (t.type === "SINGLE") {
                        if (this.treeStack.length === 0) {
                            this.parseRange(t.range, this.stringifyTag(node));
                        } else {
                            this.treeStack[
                                this.treeStack.length - 1
                            ].children.push(node);
                        }
                    } else if (t.type === "OPEN") {
                        if (this.treeStack.length === 0) {
                            this.treeStart = t.range.start;
                        }
                        this.treeStack.push(node);
                    } else if (t.type === "CLOSE") {
                        if (this.treeStack.length === 0) {
                            throw new ParseError(
                                `This tag is closing nothing`,
                                t.range.start
                            );
                        }
                        const parent = this.treeStack.pop();
                        if (parent.className !== node.className) {
                            throw new ParseError(
                                `This tag don't match with parent tag "${parent.className}"`,
                                t.range.start
                            );
                        }

                        if (this.treeStack.length === 0) {
                            this.parseRange(
                                { start: this.treeStart, end: t.range.end },
                                this.stringifyTag(parent)
                            );
                        } else {
                            this.treeStack[
                                this.treeStack.length - 1
                            ].children.push(parent);
                        }
                    }

                    break;
                }
            }
        }

        if (this.treeStack.length > 0) {
            throw new ParseError(
                `Missing closing tag for this tag`,
                this.treeStack[this.treeStack.length - 1].range.start
            );
        }

        return this.source;
    }

    stringifyTag(tag: TagParsed): string {
        let s = "{";

        if (this.args.assignId) {
            const id = randomId(
                4,
                tag.range.start.line,
                tag.range.start.column,
                tag.range.end.line,
                tag.range.end.column
            );

            s += `"id":"${id}"`;
            const keyProp = tag.properties.find((p) => p.name === "key");
            if (keyProp) {
                s += `+str(${keyProp.value})`;
            }
            s += ",";
        }

        let className = tag.className;

        if (className === "self") {
            className = "get_script()";
        }

        s += `"className":${className},`;
        s += `"properties":{`;
        let first = true;
        for (const prop of tag.properties) {
            if (!first) s += ",";
            let value = prop.value;

            if (this.functions.find((f) => f.name === value)) {
                value = `funcref(self,"${value}")`;
            }

            s += `"${prop.name}":${value}`;
            first = false;
        }
        s += `},`;
        s += `"children":[`;
        first = true;
        for (const child of tag.children) {
            if (!first) s += ",";
            s += this.stringifyTag(child);
            first = false;
        }
        s += `]`;
        const childrenProp = tag.properties.find((p) => p.name === "children");
        if (childrenProp) {
            s += `+${childrenProp.name}`;
        }

        s += "}";
        return s;
    }

    getDeclarations(): void {
        this.variables = [];
        this.functions = [];
        for (const token of this.lexer.tokenize()) {
            if (token.tokenType === "VARDECLARATION") {
                this.variables.push(token as VariableDeclarationToken);
            } else if (token.tokenType === "FUNCDECLARATION") {
                this.functions.push(token as FunctionDeclarationToken);
            } else if (token.tokenType === "IMPORT") {
                const t = token as ImportToken;
                this.variables.push({
                    tokenType: "VARDECLARATION",
                    range: t.range,
                    name: t.className,
                    type: "any",
                    initialValue: "",
                });
            }
        }
    }
}
