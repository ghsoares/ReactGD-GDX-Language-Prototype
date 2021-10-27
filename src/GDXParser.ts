import { Lexer, Parser, Cursor, Token } from "./parser";
import { ClassNameToken, GDXLexer, ImportToken } from "./GDXLexer";
import path from "path";

export interface ParserArgs {
    filePath: string;
    fileBaseName: string;
    folderPath: string;
}

export class GDXParser extends Parser {
    private args: ParserArgs;

    constructor(lexer: GDXLexer, args: ParserArgs) {
        super(lexer);
        this.args = args;
    }

    parse(): string {
        let parsed = this.input;
        let off = 0;
        let fileClassName = this.args.fileBaseName;

        for (const token of this.lexer.tokenize()) {
            switch (token.tokenType) {
                case "IMPORT": {
                    const importToken = token as ImportToken;
                    const className = importToken.className;
                    const p = path.join(this.args.folderPath, importToken.relativePath);
                    const range = importToken.range;

                    const prefix = parsed.slice(0, off + range[0].pos);
                    const parsedStr = `var ${className} = ResourceLoader.load("${p}")`
                    const suffix = parsed.slice(off + range[1].pos);

                    parsed = prefix + parsedStr + suffix;

                    const prevLen = (range[1].pos - range[0].pos);
                    const newLen = parsedStr.length;
                    
                    off += newLen - prevLen;
                    break;
                }
                case "CLASSNAME": {
                    const classNameToken = token as ClassNameToken;
                    fileClassName = classNameToken.className;
                    break;
                }
            }
        }

        parsed += `\nfunc get_class() -> String: return "${fileClassName}"`;

        return parsed;
    }
}
